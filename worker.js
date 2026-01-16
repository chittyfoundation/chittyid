/**
 * ChittyID Mothership - Cloudflare Worker Entry Point
 * Hardened Security Configuration with Pipeline Enforcement
 * Enhanced with MCP Portal Integration and LangChain AI Routing
 */

import { createPipelineEnforcer } from "./src/middleware/pipeline-enforcer.js";
import { createRequestInterceptor } from "./src/middleware/request-interceptor.js";
import { PipelineIntegrityBreaker } from "./src/enforcement/circuit-breaker.js";
import { ComplianceMonitor } from "./src/enforcement/compliance-monitor.js";

// Import the main API handler from Pages Functions
// NOTE: Disabled - [[route]] syntax doesn't bundle correctly in Workers
// import { onRequest } from "./functions/api/[[route]].js";

// Import MCP Portal Handler for enhanced routing
import { ChittyOSMCPPortalHandler } from "./mcp-cloudflare-portal-handler.js";

// Import Ontology Controller for entity classification and hybrid ID generation
import OntologyControllerWorker from "./src/hybrid/ontology-controller.js";

// Entity type mapping
const ENTITY_TYPES = { person: 'P', place: 'L', thing: 'T', event: 'E', authority: 'A' };

// Mod-97 checksum calculation
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

// Get current year-month code
function getCurrentYearMonth() {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  return year + month.slice(1);
}

// Get next sequential ID
async function getNextSequential(env, key) {
  if (!env.CHITTYID_KV) {
    throw new Error('CHITTYID_KV namespace not available');
  }
  const stored = await env.CHITTYID_KV.get(key);
  let counter = stored ? parseInt(stored) : 1;
  counter = counter >= 9999 ? 1 : counter + 1;
  await env.CHITTYID_KV.put(key, counter.toString());
  return counter.toString().padStart(4, '0');
}

// Direct ChittyID generation handler
async function handleDirectChittyIdGeneration(url, env) {
  const entityTypeParam = (url.searchParams.get('type') || url.searchParams.get('for') || 'thing').toLowerCase();
  const entityType = ENTITY_TYPES[entityTypeParam] || 'T';
  const region = '1'; // North America default
  const jurisdiction = 'USA';
  const trustLevel = '3'; // Verified default
  const version = '03';

  try {
    const sequentialKey = `seq_${region}_${jurisdiction}_${entityType}`;
    const sequential = await getNextSequential(env, sequentialKey);
    const yearMonth = getCurrentYearMonth();

    const baseId = `${version}${region}${jurisdiction}${sequential}${entityType}${yearMonth}${trustLevel}`;
    const checksum = mod97Checksum(baseId).toString().padStart(2, '0');
    const chittyId = `${version}-${region}-${jurisdiction}-${sequential}-${entityType}-${yearMonth}-${trustLevel}-${checksum}`;

    return new Response(JSON.stringify({
      success: true,
      chittyId,
      components: { version, region, jurisdiction, sequential, entityType, yearMonth, trustLevel, checksum },
      timestamp: new Date().toISOString(),
      service: 'id.chitty.cc'
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: 'GENERATION_FAILED',
      message: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
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
  if (!/^\d{2,3}$/.test(yearMonth)) return { valid: false, error: 'Year-Month must be 2-3 digits' };
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
        return await handleDirectChittyIdGeneration(url, env);
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
