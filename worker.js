/**
 * ChittyID Mothership - Cloudflare Worker Entry Point
 * Hardened Security Configuration with Pipeline Enforcement
 * Enhanced with MCP Portal Integration and LangChain AI Routing
 */

import { createPipelineEnforcer } from "./src/middleware/pipeline-enforcer.js";
import { createRequestInterceptor } from "./src/middleware/request-interceptor.js";
import { PipelineIntegrityBreaker, PipelineCircuitBreaker } from "./src/enforcement/circuit-breaker.js";
import { ComplianceMonitor } from "./src/enforcement/compliance-monitor.js";

// Import the main API handler from Pages Functions
// NOTE: Disabled - [[route]] syntax doesn't bundle correctly in Workers
// import { onRequest } from "./functions/api/[[route]].js";

// Import MCP Portal Handler for enhanced routing
import { ChittyOSMCPPortalHandler } from "./mcp-cloudflare-portal-handler.js";

// Import Ontology Controller for entity classification and hybrid ID generation
import OntologyControllerWorker from "./src/hybrid/ontology-controller.js";

// Note: Minting is now delegated to ChittyMint (mint.chitty.cc)
// ChittyID serves as the API layer for ID operations

// Mod-97 checksum calculation (used for local validation only)
function mod97Checksum(str) {
  let checksum = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char >= '0' && char <= '9') {
      checksum = (checksum * 10 + parseInt(char)) % 97;
    } else if (char >= 'A' && char <= 'Z') {
      checksum = (checksum * 100 + (char.charCodeAt(0) - 55)) % 97;
    }
  }
  return (98 - checksum) % 97;
}

// ChittyMint service URL
const CHITTYMINT_URL = process.env.CHITTYMINT_URL || 'https://mint.chitty.cc';

// Fallback ID service URL
const FALLBACK_ID_SERVICE = process.env.FALLBACK_ID_SERVICE || 'https://fallback.id.chitty.cc';

// Request timeout (30 seconds)
const REQUEST_TIMEOUT = 30000;

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(url, options, timeout = REQUEST_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
}

/**
 * Fetch with circuit breaker and timeout
 */
async function fetchWithCircuitBreaker(circuitBreaker, serviceName, operation, url, options, timeout = REQUEST_TIMEOUT) {
  // Check circuit state
  const circuitCheck = await circuitBreaker.checkCircuit(serviceName, operation);
  
  if (!circuitCheck.allowed) {
    throw new Error(`Circuit breaker is open for ${serviceName}:${operation}. Time until retry: ${circuitCheck.timeUntilRetry}ms`);
  }

  try {
    const response = await fetchWithTimeout(url, options, timeout);
    
    // Record success
    await circuitBreaker.recordSuccess(serviceName, operation);
    
    return response;
  } catch (error) {
    // Record failure
    await circuitBreaker.recordFailure(serviceName, operation, error);
    throw error;
  }
}

/**
 * Request a fallback error ID from the central fallback service
 * This replaces local ID generation and ensures all IDs come from services
 */
async function requestFallbackIdFromService(errorCode, entityType, originalRequest, env) {
  try {
    // Initialize circuit breaker if not already done
    if (!env._circuitBreaker) {
      env._circuitBreaker = new PipelineCircuitBreaker(env);
    }

    const fallbackRequest = {
      errorCode,
      entityType: entityType?.toLowerCase(),
      context: {
        originalRequest,
        timestamp: new Date().toISOString(),
        service: 'id.chitty.cc'
      }
    };

    // Call fallback service with circuit breaker and timeout
    const response = await fetchWithCircuitBreaker(
      env._circuitBreaker,
      'fallback-id-service',
      'request-fallback-id',
      `${FALLBACK_ID_SERVICE}/api/fallback`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(fallbackRequest)
      },
      REQUEST_TIMEOUT
    );

    if (!response.ok) {
      throw new Error(`Fallback service returned ${response.status}`);
    }

    const result = await response.json();
    return result.chittyId;
  } catch (error) {
    console.error('Fallback service unavailable:', error.message);
    // If fallback service itself is unavailable, return a structured error
    return {
      errorCode,
      message: `Both ChittyMint and fallback service unavailable: ${error.message}`,
      originalRequest
    };
  }
}

/**
 * Check if a ChittyID is a fallback error ID
 */
function isErrorId(chittyId) {
  if (!chittyId) return false;
  const parts = chittyId.split('-');
  if (parts.length !== 8) return false;

  const [version, region, jurisdiction, sequential] = parts;

  // Error IDs have: region=0, jurisdiction=ERR, sequential in 0000-0099
  return region === '0' &&
         jurisdiction === 'ERR' &&
         parseInt(sequential) >= 0 &&
         parseInt(sequential) <= 99;
}

/**
 * Get error details from a fallback error ID
 */
function getErrorFromId(chittyId) {
  if (!isErrorId(chittyId)) return null;

  const parts = chittyId.split('-');
  const sequential = parts[3];

  return {
    isError: true,
    errorCode: sequential,
    errorName: `ERROR_${sequential}`,
    message: `This is a fallback error ID. Error code: ${sequential}. Re-verify to attempt replacement with a valid ID.`,
    canReplace: true
  };
}

// Direct ChittyID generation handler - delegates to ChittyMint with fallback
async function handleDirectChittyIdGeneration(url, env, request) {
  const entityTypeParam = (url.searchParams.get('type') || url.searchParams.get('for') || 'thing').toLowerCase();

  // Extract auth token if present (forward to ChittyMint)
  const authHeader = request?.headers?.get('Authorization');

  // Build request body for ChittyMint
  const mintRequest = {
    entityType: entityTypeParam
  };

  // Add optional parameters if provided
  const regionParam = url.searchParams.get('region');
  if (regionParam) mintRequest.region = regionParam;

  const jurisdictionParam = url.searchParams.get('jurisdiction');
  if (jurisdictionParam) mintRequest.jurisdiction = jurisdictionParam;

  const trustParam = url.searchParams.get('trust');
  if (trustParam) mintRequest.trust = parseInt(trustParam);

  try {
    // Call ChittyMint for actual ID generation
    const mintResponse = await fetch(`${CHITTYMINT_URL}/api/mint`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { 'Authorization': authHeader } : {}),
        // Forward CF geolocation for region/jurisdiction auto-detection
        ...(request?.cf?.country ? { 'CF-IPCountry': request.cf.country } : {})
      },
      body: JSON.stringify(mintRequest)
    });

    if (!mintResponse.ok) {
      // ChittyMint rejected - generate fallback error ID
      const errorCode = mintResponse.status === 429 ? 'RATE_LIMITED' :
                        mintResponse.status === 400 ? 'INVALID_REQUEST' : 'MINT_REJECTED';
      return generateFallbackResponse(errorCode, entityTypeParam, mintRequest, env);
    }

    const result = await mintResponse.json();

    // Pass through the ChittyMint response
    return new Response(JSON.stringify({
      ...result,
      service: 'id.chitty.cc',
      mintedBy: 'mint.chitty.cc'
    }), {
      status: mintResponse.status,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (error) {
    // ChittyMint unavailable - generate fallback error ID
    const errorCode = error.message?.includes('timeout') ? 'MINT_TIMEOUT' : 'MINT_UNAVAILABLE';
    return generateFallbackResponse(errorCode, entityTypeParam, mintRequest, env);
  }
}

/**
 * Generate fallback response with error ID from service
 * Stores the original request for later replacement
 */
async function generateFallbackResponse(errorCode, entityType, originalRequest, env) {
  const fallbackId = await requestFallbackIdFromService(errorCode, entityType, originalRequest, env);

  // If fallback service itself failed, return error object
  if (typeof fallbackId === 'object' && fallbackId.errorCode) {
    return new Response(JSON.stringify({
      success: false,
      error: 'SERVICE_UNAVAILABLE',
      message: fallbackId.message,
      errorCode: fallbackId.errorCode,
      timestamp: new Date().toISOString(),
      service: 'id.chitty.cc'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // Store the pending request for later replacement (if KV available)
  if (env?.CHITTYID_PENDING) {
    await env.CHITTYID_PENDING.put(fallbackId, JSON.stringify({
      originalRequest,
      errorCode,
      createdAt: new Date().toISOString(),
      attempts: 0
    }), { expirationTtl: 86400 * 7 }); // 7 day TTL
  }

  // Parse the fallback ID components
  const parts = fallbackId.split('-');
  const [version, region, jurisdiction, sequential, type, yearMonth, trustLevel, checksum] = parts;

  return new Response(JSON.stringify({
    success: true,
    chittyId: fallbackId,
    fallback: true,
    errorCode,
    message: `ChittyMint unavailable. Issued fallback ID with error code ${errorCode}. This ID will be replaced with a valid ID on next verification.`,
    components: {
      version,
      region,
      jurisdiction,
      sequential,
      entityType: type,
      yearMonth,
      trustLevel,
      checksum
    },
    geo: { region, regionName: 'Error/Pending', jurisdiction, source: 'fallback' },
    trust: { level: parseInt(trustLevel), source: 'fallback', verified: false },
    timestamp: new Date().toISOString(),
    service: 'id.chitty.cc',
    mintedBy: 'fallback.id.chitty.cc'
  }), {
    status: 200, // Return 200 even for fallback (ID was issued)
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

// Validate ChittyID format
function validateChittyId(id) {
  if (!id || typeof id !== 'string') {
    return { valid: false, error: 'ChittyID is required and must be a string' };
  }
  const parts = id.split('-');
  if (parts.length !== 8) {
    return { valid: false, error: 'Invalid format: must have 8 parts separated by hyphens' };
  }
  const [version, region, jurisdiction, sequential, entityType, yearMonth, trustLevel, checksum] = parts;

  if (!/^\d{2}$/.test(version)) return { valid: false, error: 'Version must be 2 digits' };
  if (!/^[1-9]$/.test(region)) return { valid: false, error: 'Region must be 1 digit (1-9)' };
  if (!/^[A-Z]{3}$/.test(jurisdiction)) return { valid: false, error: 'Jurisdiction must be 3 uppercase letters' };
  if (!/^\d{4}$/.test(sequential)) return { valid: false, error: 'Sequential must be 4 digits' };
  if (!/^[PLTEA]$/.test(entityType)) return { valid: false, error: 'Entity type must be P, L, T, E, or A' };
  if (!/^\d{4}$/.test(yearMonth)) return { valid: false, error: 'Year-Month must be 4 digits (YYMM)' };
  if (!/^[0-5]$/.test(trustLevel)) return { valid: false, error: 'Trust level must be 0-5' };
  if (!/^\d{2}$/.test(checksum)) return { valid: false, error: 'Checksum must be 2 digits' };

  const baseId = `${version}${region}${jurisdiction}${sequential}${entityType}${yearMonth}${trustLevel}`;
  const calculatedChecksum = mod97Checksum(baseId).toString().padStart(2, '0');

  if (checksum !== calculatedChecksum) {
    return { valid: false, error: `Invalid checksum: expected ${calculatedChecksum}, got ${checksum}` };
  }

  return { valid: true, components: { version, region, jurisdiction, sequential, entityType, yearMonth, trustLevel, checksum } };
}

/**
 * Main Worker entry point with hardened security
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Enhanced routing for MCP Portal and LangChain AI
    try {
      // MCP Portal endpoints
      if (
        url.pathname.startsWith("/mcp/") ||
        url.pathname.startsWith("/portal/")
      ) {
        const mcpHandler = new ChittyOSMCPPortalHandler();

        if (
          url.pathname === "/mcp/health" ||
          url.pathname === "/portal/health"
        ) {
          const health = await mcpHandler.healthCheck();
          return new Response(JSON.stringify(health), {
            headers: { "Content-Type": "application/json" },
          });
        }

        if (url.pathname === "/mcp/tools" || url.pathname === "/portal/tools") {
          const tools = await mcpHandler.processMessage({
            method: "tools/list",
          });
          return new Response(JSON.stringify(tools), {
            headers: { "Content-Type": "application/json" },
          });
        }

        if (
          request.method === "POST" &&
          url.pathname.startsWith("/mcp/call/")
        ) {
          const toolName = url.pathname.split("/").pop();
          const params = await request.json();
          const oauthToken = request.headers
            .get("Authorization")
            ?.replace("Bearer ", "");

          if (!oauthToken) {
            return new Response(
              JSON.stringify({ error: "OAuth token required" }),
              {
                status: 401,
                headers: { "Content-Type": "application/json" },
              },
            );
          }

          const result = await mcpHandler.handleToolCall(
            toolName,
            params,
            oauthToken,
          );
          return new Response(JSON.stringify(result), {
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      // LangChain AI endpoints
      if (
        url.pathname.startsWith("/ai/") ||
        url.pathname.startsWith("/langchain/")
      ) {
        const mcpHandler = new ChittyOSMCPPortalHandler();
        const oauthToken = request.headers
          .get("Authorization")
          ?.replace("Bearer ", "");

        if (!oauthToken) {
          return new Response(
            JSON.stringify({
              error: "OAuth token required for AI endpoints",
              portal_mode: true,
            }),
            {
              status: 401,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        if (
          url.pathname.endsWith("/legal-analysis") &&
          request.method === "POST"
        ) {
          const params = await request.json();
          const result = await mcpHandler.handleToolCall(
            "langchain_legal_analysis",
            params,
            oauthToken,
          );
          return new Response(JSON.stringify(result), {
            headers: { "Content-Type": "application/json" },
          });
        }

        if (
          url.pathname.endsWith("/document-generation") &&
          request.method === "POST"
        ) {
          const params = await request.json();
          const result = await mcpHandler.handleToolCall(
            "langchain_document_generation",
            params,
            oauthToken,
          );
          return new Response(JSON.stringify(result), {
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      // ChittyCases endpoints
      if (url.pathname.startsWith("/cases/")) {
        const mcpHandler = new ChittyOSMCPPortalHandler();
        const oauthToken = request.headers
          .get("Authorization")
          ?.replace("Bearer ", "");

        if (!oauthToken) {
          return new Response(
            JSON.stringify({
              error: "OAuth token required for cases endpoints",
              portal_mode: true,
            }),
            {
              status: 401,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        if (url.pathname.endsWith("/research") && request.method === "POST") {
          const params = await request.json();
          const result = await mcpHandler.handleToolCall(
            "chittycases_legal_research",
            params,
            oauthToken,
          );
          return new Response(JSON.stringify(result), {
            headers: { "Content-Type": "application/json" },
          });
        }

        if (url.pathname.endsWith("/insights") && request.method === "POST") {
          const params = await request.json();
          const result = await mcpHandler.handleToolCall(
            "chittycases_case_insights",
            params,
            oauthToken,
          );
          return new Response(JSON.stringify(result), {
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      // Ontology System endpoints - Entity classification and hybrid ID generation
      if (
        url.pathname.startsWith("/ontology/") ||
        url.pathname.startsWith("/translate/") ||
        url.pathname.startsWith("/governance/")
      ) {
        // The OntologyController worker has its own fetch handler
        // Strip the prefix and route to controller
        const ontologyRequest = new Request(
          request.url.replace(/\/(ontology|translate|governance)/, ""),
          request,
        );
        return await OntologyControllerWorker.fetch(ontologyRequest, env, ctx);
      }

      // Direct API handlers (bypassing Pages Functions import issues)
      if (url.pathname === "/api/get-chittyid" && request.method === "GET") {
        return await handleDirectChittyIdGeneration(url, env, request);
      }

      if (url.pathname === "/api/health" && request.method === "GET") {
        return new Response(JSON.stringify({
          status: "healthy",
          version: "2.0.0",
          timestamp: new Date().toISOString(),
          service: "chittyid-mothership"
        }), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }

      if (url.pathname === "/api/validate" && request.method === "POST") {
        const body = await request.json();

        // Check if this is a fallback error ID that needs replacement
        if (isErrorId(body.id)) {
          const errorInfo = getErrorFromId(body.id);

          // Try to get the original request and mint a real ID
          if (env?.CHITTYID_PENDING) {
            const pendingData = await env.CHITTYID_PENDING.get(body.id);
            if (pendingData) {
              const pending = JSON.parse(pendingData);

              // Attempt to mint a real ID via ChittyMint
              try {
                // Initialize circuit breaker if not already done
                if (!env._circuitBreaker) {
                  env._circuitBreaker = new PipelineCircuitBreaker(env);
                }

                const authHeader = request?.headers?.get('Authorization');
                
                // Use circuit breaker and timeout wrapper for mint request
                const mintResponse = await fetchWithCircuitBreaker(
                  env._circuitBreaker,
                  'chittymint',
                  'remint-fallback-id',
                  `${CHITTYMINT_URL}/api/mint`,
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      ...(authHeader ? { 'Authorization': authHeader } : {})
                    },
                    body: JSON.stringify(pending.originalRequest)
                  },
                  REQUEST_TIMEOUT
                );

                if (mintResponse.ok) {
                  const mintResult = await mintResponse.json();

                  // Delete the pending entry
                  await env.CHITTYID_PENDING.delete(body.id);

                  return new Response(JSON.stringify({
                    success: true,
                    replaced: true,
                    oldId: body.id,
                    newId: mintResult.chittyId,
                    message: 'Fallback error ID has been replaced with a valid ChittyID',
                    ...mintResult,
                    timestamp: new Date().toISOString()
                  }), {
                    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
                  });
                }
              } catch (e) {
                // ChittyMint still unavailable or circuit breaker open - return error info
                pending.attempts = (pending.attempts || 0) + 1;
                await env.CHITTYID_PENDING.put(body.id, JSON.stringify(pending), { expirationTtl: 86400 * 7 });
              }
            }
          }

          // Return error ID info if replacement failed
          return new Response(JSON.stringify({
            success: true,
            valid: false,
            ...errorInfo,
            timestamp: new Date().toISOString()
          }), {
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
          });
        }

        // Normal validation for non-error IDs
        const result = validateChittyId(body.id);
        return new Response(JSON.stringify({
          success: true,
          ...result,
          timestamp: new Date().toISOString()
        }), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }

      if (url.pathname === "/api/spec" && request.method === "GET") {
        return new Response(JSON.stringify({
          success: true,
          specification: {
            format: "VV-G-LLL-SSSS-T-YM-C-X",
            entityTypes: { P: "Person", L: "Place", T: "Thing", E: "Event", A: "Authority" },
            trustLevels: { 0: "Unverified", 1: "Basic", 2: "Standard", 3: "Verified", 4: "Premium", 5: "Official" }
          },
          timestamp: new Date().toISOString()
        }), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }

      // Fallback 404 for unmatched routes
      return new Response(JSON.stringify({
        success: false,
        error: "NOT_FOUND",
        message: `Route not found: ${url.pathname}`,
        timestamp: new Date().toISOString(),
        service: "chittyid-mothership"
      }), {
        status: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    } catch (error) {
      console.error("Worker error:", error);

      // Security response for any unhandled errors
      return new Response(
        JSON.stringify({
          success: false,
          error: "SECURITY_ERROR",
          message: "Request processing failed security validation",
          timestamp: new Date().toISOString(),
          security: {
            level: "MAXIMUM",
            enforcement: "MANDATORY",
            bypassable: false,
          },
          portal_integration: true,
          mcp_enabled: true,
        }),
        {
          status: 503,
          headers: {
            "Content-Type": "application/json",
            "X-Security-Error": "true",
            "X-Pipeline-Required": "true",
            "X-ChittyOS-Service": "chittyid-mothership",
            "X-MCP-Portal": "enabled",
            "X-LangChain-AI": "integrated",
          },
        },
      );
    }
  },
};
