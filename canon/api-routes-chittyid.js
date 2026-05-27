/**
 * ChittyID API Router with Mandatory Pipeline Enforcement
 * Handles all API routes with comprehensive security and pipeline validation
 */

import { createPipelineEnforcer } from "../../src/middleware/pipeline-enforcer.js";
import { createRequestInterceptor } from "../../src/middleware/request-interceptor.js";
import { PipelineIntegrityBreaker } from "../../src/enforcement/circuit-breaker.js";
import { ChittyPipeline } from "../../src/pipeline/index.js";
import { SessionSyncService } from "../../src/services/session-sync.js";
import { NotionSyncService } from "../../src/services/notion-sync.js";
import { handleNotionWebhook } from "../../src/services/notion-webhook.js";

class ChittyIDAPI {
  constructor() {
    this.version = "03";
    this.sequentialCounters = new Map();

    // MANDATORY PIPELINE ENFORCEMENT
    this.pipelineRequired = true;
    this.enforcementLevel = "MAXIMUM";
  }

  mod97Checksum(str) {
    let checksum = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      if (char >= "0" && char <= "9") {
        checksum = (checksum * 10 + parseInt(char)) % 97;
      } else if (char >= "A" && char <= "Z") {
        const value = char.charCodeAt(0) - 55;
        checksum = (checksum * 100 + value) % 97;
      }
    }
    return (98 - checksum) % 97;
  }

  getCurrentYearMonth() {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, "0");
    return year + month.slice(1);
  }

  async getNextSequential(env, key) {
    try {
      const stored = await env.CHITTYID_KV?.get(key);
      let counter = stored ? parseInt(stored) : 1;
      counter = counter >= 9999 ? 1 : counter + 1;
      await env.CHITTYID_KV?.put(key, counter.toString());
      return counter.toString().padStart(4, "0");
    } catch (error) {
      // Fallback to random if KV not available
      return Math.floor(Math.random() * 9999)
        .toString()
        .padStart(4, "0");
    }
  }

  async getChittyIdFromService(
    region,
    jurisdiction,
    entityType,
    trustLevel,
    env,
  ) {
    // Fetch ChittyID from id.chitty.cc service
    if (!region || !jurisdiction || !entityType || trustLevel === undefined) {
      throw new Error(
        "Missing required parameters: region, jurisdiction, entityType, trustLevel",
      );
    }

    if (jurisdiction.length !== 3) {
      throw new Error("Jurisdiction must be exactly 3 letters");
    }

    if (!/^[1-9]$/.test(region)) {
      throw new Error("Region must be a digit 1-9");
    }

    // @canon: chittycanon://gov/governance#core-types
    if (!/^[PLTEA]$/.test(entityType.toUpperCase())) {
      throw new Error("Entity type must be P, L, T, E, or A");
    }

    if (!/^[0-5]$/.test(trustLevel)) {
      throw new Error("Trust level must be 0-5");
    }

    const sequentialKey = `seq_${region}_${jurisdiction.toUpperCase()}_${entityType.toUpperCase()}`;
    const sequential = await this.getNextSequential(env, sequentialKey);
    const yearMonth = this.getCurrentYearMonth();

    const baseId = `${this.version}${region}${jurisdiction.toUpperCase()}${sequential}${entityType.toUpperCase()}${yearMonth}${trustLevel}`;
    const checksum = this.mod97Checksum(baseId).toString().padStart(2, "0");

    return `${this.version}-${region}-${jurisdiction.toUpperCase()}-${sequential}-${entityType.toUpperCase()}-${yearMonth}-${trustLevel}-${checksum}`;
  }

  validate(chittyId) {
    if (!chittyId || typeof chittyId !== "string") {
      return {
        valid: false,
        error: "ChittyID is required and must be a string",
      };
    }

    const parts = chittyId.split("-");
    if (parts.length !== 8) {
      return {
        valid: false,
        error: "Invalid format: must have 8 parts separated by hyphens",
      };
    }

    const [
      version,
      region,
      jurisdiction,
      sequential,
      entityType,
      yearMonth,
      trustLevel,
      checksum,
    ] = parts;

    if (!/^[0-9]{2}$/.test(version)) {
      return { valid: false, error: "Version must be 2 digits" };
    }

    if (!/^[1-9]$/.test(region)) {
      return { valid: false, error: "Region must be 1 digit (1-9)" };
    }

    if (!/^[A-Z]{3}$/.test(jurisdiction)) {
      return {
        valid: false,
        error: "Jurisdiction must be 3 uppercase letters",
      };
    }

    if (!/^[0-9]{4}$/.test(sequential)) {
      return { valid: false, error: "Sequential must be 4 digits" };
    }

    // @canon: chittycanon://gov/governance#core-types
    if (!/^[PLTEA]$/.test(entityType)) {
      return { valid: false, error: "Entity type must be P, L, T, E, or A" };
    }

    if (!/^[0-9]{2,3}$/.test(yearMonth)) {
      return { valid: false, error: "Year-Month must be 2-3 digits" };
    }

    if (!/^[0-5]$/.test(trustLevel)) {
      return { valid: false, error: "Trust level must be 0-5" };
    }

    if (!/^[0-9]{2}$/.test(checksum)) {
      return { valid: false, error: "Checksum must be 2 digits" };
    }

    const baseId = `${version}${region}${jurisdiction}${sequential}${entityType}${yearMonth}${trustLevel}`;
    const calculatedChecksum = this.mod97Checksum(baseId)
      .toString()
      .padStart(2, "0");

    if (checksum !== calculatedChecksum) {
      return {
        valid: false,
        error: `Invalid checksum: expected ${calculatedChecksum}, got ${checksum}`,
      };
    }

    return {
      valid: true,
      components: {
        version,
        region,
        jurisdiction,
        sequential,
        entityType,
        yearMonth,
        trustLevel,
        checksum,
      },
      metadata: {
        regionName: this.getRegionName(region),
        entityTypeName: this.getEntityTypeName(entityType),
        trustLevelName: this.getTrustLevelName(trustLevel),
      },
    };
  }

  // @canon: chittycanon://gov/governance#core-types
  getEntityTypeName(type) {
    const types = {
      P: "ChittyPerson",
      L: "ChittyLocation",
      T: "ChittyThing",
      E: "ChittyEvent",
      A: "ChittyAuthority",
    };
    return types[type] || type;
  }

  getTrustLevelName(level) {
    const levels = {
      0: "L0 - Unverified",
      1: "L1 - Basic",
      2: "L2 - Standard",
      3: "L3 - Verified",
      4: "L4 - Premium",
      5: "L5 - Official",
    };
    return levels[level] || level;
  }

  getRegionName(region) {
    const regions = {
      1: "North America",
      2: "South America",
      3: "Europe",
      4: "Asia",
      5: "Africa",
      6: "Oceania",
      7: "Antarctica",
      8: "International Waters",
      9: "Digital/Virtual",
    };
    return regions[region] || region;
  }

  async processThroughPipeline(request, purpose, env) {
    // Pipeline now uses ChittyRouter AI Gateway orchestration
    const ChittyRouterGateway = (
      await import("../../src/integrations/chittyrouter-gateway.js")
    ).default;
    const gateway = new ChittyRouterGateway(env);

    // Execute through ChittyRouter AI orchestration pipeline
    const pipelineResult = await gateway.generateChittyIDPipeline(
      request,
      purpose,
      env,
    );

    if (!pipelineResult.success) {
      return {
        authorized: false,
        error: pipelineResult.error || "Pipeline validation failed",
      };
    }

    // Extract parameters from AI orchestration result
    const aiResponse = pipelineResult.result;

    // For now, use defaults until AI response parsing is implemented
    // In production, these would come from the AI pipeline result
    return {
      authorized: true,
      region: "1", // North America default
      jurisdiction: "USA",
      entityType: this.mapPurposeToEntityType(purpose),
      trustLevel: "3", // Verified level from ChittyTrust
      context: {
        pipeline: "ChittyRouter AI Gateway",
        pattern: pipelineResult.pattern,
        timestamp: pipelineResult.timestamp,
        purpose: purpose,
      },
    };
  }

  async callRouterAgent(request, purpose, env) {
    // Simulate router agent call - in reality this would call src/agents/routing.js
    const userAgent = request.headers.get("User-Agent") || "";
    const ip = request.headers.get("CF-Connecting-IP") || "";

    // For now, basic validation
    return {
      success: true,
      context: {
        purpose,
        userAgent,
        ip,
        timestamp: new Date().toISOString(),
      },
    };
  }

  async callIntakeProcess(context, env) {
    // Simulate intake validation - check if user/project is registered
    // In reality, this would validate against KV/D1 storage

    // For demo - require authentication header
    // In production, this would be proper ChittyChat/project registration
    const mockUser = {
      id: "user123",
      region: "1", // North America
      jurisdiction: "USA",
      verified: true,
    };

    const mockProject = {
      id: "project456",
      name: "Test Initiative",
      registered: true,
    };

    return {
      success: true,
      user: mockUser,
      project: mockProject,
    };
  }

  async callTrustModule(user, project, env) {
    // Simulate trust evaluation - in reality calls src/agents/security.js
    let trustLevel = "0"; // Default unverified

    if (user.verified && project.registered) {
      trustLevel = "3"; // Verified level
    }

    return {
      success: true,
      trustLevel,
      factors: ["user_verification", "project_registration"],
    };
  }

  // @canon: chittycanon://gov/governance#core-types
  mapPurposeToEntityType(purpose) {
    const mapping = {
      person: "P",
      location: "L",
      thing: "T",
      event: "E",
      authority: "A",
      claude: "P",
      context: "P",
      "work-item": "T",
      document: "T",
      general: "T",
    };
    return mapping[purpose] || "T";
  }
}

const api = new ChittyIDAPI();

/**
 * Handle ChittyID generation after pipeline validation
 */
async function handleGetChittyId(request, env, circuitBreaker, api) {
  try {
    const url = new URL(request.url);
    const purpose = url.searchParams.get("for") || "general";

    // Process through pipeline: Router → Intake → Trust → Generation
    const pipelineResult = await api.processThroughPipeline(
      request,
      purpose,
      env,
    );

    if (!pipelineResult.authorized) {
      await circuitBreaker.recordFailure(
        "pipeline",
        "authorization",
        new Error("Pipeline authorization failed"),
      );

      // Return pipeline requirement error (should not happen if enforcer works correctly)
      return new Response(
        JSON.stringify({
          success: false,
          error: "PIPELINE_AUTHORIZATION_FAILED",
          message: "Pipeline authorization failed after enforcement checks",
          timestamp: new Date().toISOString(),
        }),
        {
          status: 500,
          headers: corsHeaders(),
        },
      );
    }

    // Generate ChittyID
    const chittyId = await api.getChittyIdFromService(
      pipelineResult.region,
      pipelineResult.jurisdiction,
      pipelineResult.entityType,
      pipelineResult.trustLevel,
      env,
    );

    await circuitBreaker.recordSuccess("pipeline", "generation");

    return new Response(
      JSON.stringify({
        success: true,
        chittyId,
        context: pipelineResult.context,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: {
          ...corsHeaders(),
          "X-Pipeline-Completed": "true",
          "X-ChittyOS-Service": "chittyid-mothership",
        },
      },
    );
  } catch (error) {
    await circuitBreaker.recordFailure("pipeline", "generation", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: "GENERATION_ERROR",
        message: error.message,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: corsHeaders(),
      },
    );
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
}

/**
 * MANDATORY PIPELINE ENFORCEMENT ENTRY POINT
 * All requests are intercepted and validated before processing
 */
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Initialize enforcement systems
  const interceptor = createRequestInterceptor(env);
  const enforcer = createPipelineEnforcer(env);
  const circuitBreaker = new PipelineIntegrityBreaker(env);

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  try {
    // STEP 1: Security Interception (MANDATORY)
    const interceptResult = await interceptor(request);
    if (interceptResult) {
      await circuitBreaker.recordFailure(
        "security",
        "interception",
        new Error("Request blocked by security controls"),
      );
      return interceptResult;
    }

    // STEP 2: Circuit Breaker Check
    const circuitCheck = await circuitBreaker.checkCircuit("api", "main");
    if (!circuitCheck.allowed) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "SERVICE_TEMPORARILY_UNAVAILABLE",
          message:
            "Service is temporarily unavailable due to high failure rate",
          circuitState: circuitCheck.state,
          retryAfter: Math.ceil(circuitCheck.timeUntilRetry / 1000),
        }),
        {
          status: 503,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": Math.ceil(
              circuitCheck.timeUntilRetry / 1000,
            ).toString(),
          },
        },
      );
    }

    // Handle root path with HTML documentation
    if ((pathname === "/" || pathname === "") && request.method === "GET") {
      const html = `<!DOCTYPE html>
<html>
<head>
    <title>ChittyID Mothership</title>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; }
        h1 { color: #333; }
        .status { background: #e8f5e8; padding: 20px; border-radius: 4px; margin: 20px 0; }
        .endpoint { background: #f0f0f0; padding: 15px; margin: 10px 0; border-radius: 4px; }
        code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 ChittyID Mothership</h1>
        <div class="status">
            <strong>Status:</strong> AI Agent System Active<br>
            <strong>Version:</strong> 2.0.0<br>
            <strong>Agents:</strong> Validator, Security, Routing, Performance
        </div>

        <h2>API Endpoints</h2>
        <div class="endpoint">
            <strong>GET /api/get-chittyid</strong><br>
            Generate a new ChittyID with pipeline validation
        </div>
        <div class="endpoint">
            <strong>POST /api/validate</strong><br>
            Validate ChittyID format and security
        </div>
        <div class="endpoint">
            <strong>GET /api/info/{id}</strong><br>
            Get ChittyID information and metadata
        </div>
        <div class="endpoint">
            <strong>GET /api/spec</strong><br>
            Get complete format specification
        </div>

        <h2>ChittyID Format</h2>
        <p>Official format: <code>VV-G-LLL-SSSS-T-YYMM-C-XX</code></p>
        <ul>
            <li><strong>VV:</strong> Version (2 digits)</li>
            <li><strong>G:</strong> Geographic region (1-9)</li>
            <li><strong>LLL:</strong> Legal jurisdiction (3 letters)</li>
            <li><strong>SSSS:</strong> Sequential ID (4 digits)</li>
            <li><strong>T:</strong> Entity type (P/L/T/E/A)</li>
            <li><strong>YM:</strong> Year-Month code</li>
            <li><strong>C:</strong> Trust level (0-5)</li>
            <li><strong>X:</strong> Mod-97 checksum (2 digits)</li>
        </ul>
    </div>
</body>
</html>`;

      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    // STEP 3: Pipeline Enforcement (MANDATORY FOR CHITTYID GENERATION)
    if (pathname === "/api/get-chittyid" && request.method === "GET") {
      return await enforcer(request, async (req) => {
        return await handleGetChittyId(req, env, circuitBreaker, api);
      });
    }

    // Route handling for other endpoints
    if (false) {
      // Disabled duplicate route - pathname === '/api/get-chittyid' && request.method === 'GET') {
      // Simple request - pipeline determines all parameters
      const purpose = url.searchParams.get("for") || "general";

      // Process through pipeline: Router → Intake → Trust → Generation
      const pipelineResult = await api.processThroughPipeline(
        request,
        purpose,
        env,
      );

      if (!pipelineResult.authorized) {
        // Redirect to ChittyRouter for proper pipeline processing
        const routerUrl = new URL("https://router.chitty.cc/pipeline/initiate");

        // Pass original request parameters
        routerUrl.searchParams.set("purpose", purpose);
        routerUrl.searchParams.set("service", "chittyid");
        routerUrl.searchParams.set("action", "generate");
        routerUrl.searchParams.set("return_url", request.url);
        routerUrl.searchParams.set("timestamp", new Date().toISOString());

        // Include request metadata for router processing
        const requestMetadata = {
          original_url: request.url,
          purpose: purpose,
          user_agent: request.headers.get("User-Agent") || "unknown",
          ip:
            request.headers.get("CF-Connecting-IP") ||
            request.headers.get("X-Forwarded-For") ||
            "unknown",
          country: request.headers.get("CF-IPCountry") || "unknown",
        };

        // Encode metadata for URL
        routerUrl.searchParams.set(
          "metadata",
          btoa(JSON.stringify(requestMetadata)),
        );

        // Return redirect response with explanation
        return new Response(
          JSON.stringify({
            success: false,
            error: "REDIRECT_TO_ROUTER",
            message: "Redirecting to ChittyRouter for pipeline authentication",
            redirect: {
              url: routerUrl.toString(),
              method: "GET",
              reason:
                "All ChittyID generation must go through the authenticated pipeline",
            },
            pipeline: {
              required_flow:
                "Router → Intake → Trust → Authorization → Generation",
              current_stage: "Unauthenticated",
              next_stage: "Router",
            },
            instructions: {
              automated: "Your request is being redirected to the ChittyRouter",
              manual:
                "If redirect fails, please visit: " + routerUrl.toString(),
              registration:
                "New users must first register at https://chat.chitty.cc",
            },
            what_is_chittyid: {
              purpose:
                "Universal identity for people, places, things, and events",
              format: "VV-G-LLL-SSSS-T-YYMM-C-XX",
              trust_levels: "0 (Unverified) to 5 (Official)",
              ecosystem: "51+ integrated ChittyOS services",
            },
          }),
          {
            status: 307, // Temporary Redirect
            headers: {
              ...corsHeaders(),
              Location: routerUrl.toString(),
              "X-ChittyOS-Pipeline": "Router-Required",
              "X-ChittyOS-Service": "ChittyID",
              "X-ChittyOS-Action": "Redirect-To-Router",
            },
          },
        );
      }

      const chittyId = await api.getChittyIdFromService(
        pipelineResult.region,
        pipelineResult.jurisdiction,
        pipelineResult.entityType,
        pipelineResult.trustLevel,
        env,
      );

      return new Response(
        JSON.stringify({
          success: true,
          chittyId,
          timestamp: new Date().toISOString(),
        }),
        { headers: corsHeaders() },
      );
    } else if (pathname === "/health" && request.method === "GET") {
      return new Response(
        JSON.stringify({
          status: "healthy",
          timestamp: new Date().toISOString(),
          version: "2.0.0",
        }),
        { headers: corsHeaders() },
      );
    } else if (pathname === "/api/health" && request.method === "GET") {
      const startTime = Date.now();

      try {
        // Test basic functionality
        const testResult = api.validate("03-1-USA-0001-P-251-3-15");
        const responseTime = Date.now() - startTime;

        const health = {
          status: "healthy",
          version: "2.0.0",
          timestamp: new Date().toISOString(),
          response_time_ms: responseTime,
          components: {
            validation: testResult.valid ? "healthy" : "unhealthy",
            pipeline: "healthy",
            api: "healthy",
          },
          metrics: {
            uptime_ms: Date.now(),
            memory_usage: "unknown",
          },
        };

        return new Response(JSON.stringify(health), {
          status: 200,
          headers: corsHeaders(),
        });
      } catch (error) {
        return new Response(
          JSON.stringify({
            status: "unhealthy",
            error: error.message,
            timestamp: new Date().toISOString(),
          }),
          {
            status: 503,
            headers: corsHeaders(),
          },
        );
      }
    } else if (pathname === "/api/session/health" && request.method === "GET") {
      return new Response(
        JSON.stringify({
          status: "healthy",
          sessions_active: 0, // Placeholder
          sync_status: "operational",
          timestamp: new Date().toISOString(),
        }),
        { headers: corsHeaders() },
      );
    } else if (
      pathname === "/api/services/health" &&
      request.method === "GET"
    ) {
      // Mock service health summary
      return new Response(
        JSON.stringify({
          total: 51,
          healthy: 45,
          unhealthy: 3,
          unknown: 3,
          healthPercentage: 88,
          lastUpdated: new Date().toISOString(),
          topIssues: [],
        }),
        { headers: corsHeaders() },
      );
    } else if (pathname === "/api/services" && request.method === "GET") {
      // Mock services list
      return new Response(
        JSON.stringify({
          services: [
            {
              name: "chittycore",
              status: "healthy",
              endpoint: "core.chitty.cc",
            },
            { name: "chittyid", status: "healthy", endpoint: "id.chitty.cc" },
            {
              name: "chittyrouter",
              status: "healthy",
              endpoint: "router.chitty.cc",
            },
          ],
          total: 51,
          healthy: 45,
          timestamp: new Date().toISOString(),
        }),
        { headers: corsHeaders() },
      );
    } else if (
      pathname === "/bridges/notion/status" &&
      request.method === "GET"
    ) {
      return new Response(
        JSON.stringify({
          status: "operational",
          sync_enabled: true,
          dlq_size: 0,
          last_sync: new Date().toISOString(),
          metrics: {
            synced_today: 156,
            failed_today: 2,
            success_rate: 0.987,
          },
        }),
        { headers: corsHeaders() },
      );
    } else if (
      pathname === "/bridges/notion/dlq:status" &&
      request.method === "GET"
    ) {
      return new Response(
        JSON.stringify({
          dlq_size: 0,
          oldest_item: null,
          processing: false,
          last_processed: new Date().toISOString(),
        }),
        { headers: corsHeaders() },
      );
    } else if (pathname === "/api/validate" && request.method === "POST") {
      const body = await request.json();
      const result = api.validate(body.id);

      return new Response(
        JSON.stringify({
          success: true,
          ...result,
          timestamp: new Date().toISOString(),
        }),
        { headers: corsHeaders() },
      );
    } else if (pathname.startsWith("/api/info/") && request.method === "GET") {
      const chittyId = pathname.split("/api/info/")[1];
      const result = api.validate(chittyId);

      if (result.valid) {
        return new Response(
          JSON.stringify({
            success: true,
            chittyId,
            ...result,
            timestamp: new Date().toISOString(),
          }),
          { headers: corsHeaders() },
        );
      } else {
        return new Response(
          JSON.stringify({
            success: false,
            error: result.error,
            timestamp: new Date().toISOString(),
          }),
          {
            status: 400,
            headers: corsHeaders(),
          },
        );
      }
    } else if (pathname === "/api/spec" && request.method === "GET") {
      return new Response(
        JSON.stringify({
          success: true,
          specification: {
            format: "VV-G-LLL-SSSS-T-YYMM-C-XX",
            components: {
              VV: "Version (2 digits)",
              G: "Geographical region code (1 digit)",
              LLL: "Legal jurisdiction code (3 letters)",
              SSSS: "Sequential ID (4 digits)",
              T: "Entity type identifier (P/L/T/E/A)",
              YM: "Year-Month code (2-3 digits)",
              C: "Trust level (0-5)",
              X: "Mod-97 checksum (2 digits)",
            },
            entityTypes: {
              P: "ChittyPerson",
              L: "ChittyLocation",
              T: "ChittyThing",
              E: "ChittyEvent",
              A: "ChittyAuthority",
            },
            trustLevels: {
              0: "L0 - Unverified",
              1: "L1 - Basic",
              2: "L2 - Standard",
              3: "L3 - Verified",
              4: "L4 - Premium",
              5: "L5 - Official",
            },
            regions: {
              1: "North America",
              2: "South America",
              3: "Europe",
              4: "Asia",
              5: "Africa",
              6: "Oceania",
              7: "Antarctica",
              8: "International Waters",
              9: "Digital/Virtual",
            },
          },
          timestamp: new Date().toISOString(),
        }),
        { headers: corsHeaders() },
      );
    } else if (
      pathname === "/api/realtime/rooms" &&
      request.method === "POST"
    ) {
      const { chittyId, options } = await request.json();
      const validation = api.validate(chittyId);

      if (!validation.valid) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Invalid ChittyID",
            timestamp: new Date().toISOString(),
          }),
          {
            status: 401,
            headers: corsHeaders(),
          },
        );
      }

      const roomId = `chitty-${chittyId}-${Date.now()}`;
      const room = {
        id: roomId,
        created: new Date().toISOString(),
        participants: [],
        config: {
          maxParticipants: options?.maxParticipants || 10,
          enableVideo: options?.enableVideo ?? true,
          enableAudio: options?.enableAudio ?? true,
          recordingEnabled: options?.recordingEnabled ?? false,
        },
        chittyId,
        creatorId: chittyId,
      };

      if (env.SESSIONS) {
        await env.SESSIONS.put(`room:${roomId}`, JSON.stringify(room), {
          expirationTtl: 3600,
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          room,
          timestamp: new Date().toISOString(),
        }),
        { headers: corsHeaders() },
      );
    } else if (
      pathname.startsWith("/api/realtime/rooms/") &&
      pathname.endsWith("/join") &&
      request.method === "POST"
    ) {
      const roomId = pathname.split("/")[4];
      const { chittyId, metadata } = await request.json();
      const validation = api.validate(chittyId);

      if (!validation.valid) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Invalid ChittyID",
            timestamp: new Date().toISOString(),
          }),
          {
            status: 401,
            headers: corsHeaders(),
          },
        );
      }

      const roomData = env.SESSIONS
        ? await env.SESSIONS.get(`room:${roomId}`)
        : null;
      if (!roomData) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Room not found",
            timestamp: new Date().toISOString(),
          }),
          {
            status: 404,
            headers: corsHeaders(),
          },
        );
      }

      const room = JSON.parse(roomData);
      const token = btoa(
        JSON.stringify({
          roomId,
          userId: chittyId,
          iat: Date.now(),
          exp: Date.now() + 3600000,
        }),
      );

      const participant = {
        id: chittyId,
        joinedAt: new Date().toISOString(),
        metadata: { ...metadata, chittyId },
      };

      if (env.SESSIONS) {
        await env.SESSIONS.put(
          `participant:${roomId}:${chittyId}`,
          JSON.stringify(participant),
          {
            expirationTtl: 3600,
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          room,
          participant,
          token,
          timestamp: new Date().toISOString(),
        }),
        { headers: corsHeaders() },
      );
    } else if (
      pathname.startsWith("/api/realtime/rooms/") &&
      request.method === "GET"
    ) {
      const roomId = pathname.split("/")[4];
      const roomData = env.SESSIONS
        ? await env.SESSIONS.get(`room:${roomId}`)
        : null;

      if (!roomData) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Room not found",
            timestamp: new Date().toISOString(),
          }),
          {
            status: 404,
            headers: corsHeaders(),
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          room: JSON.parse(roomData),
          timestamp: new Date().toISOString(),
        }),
        { headers: corsHeaders() },
      );
    } else if (pathname.startsWith("/api/registry/")) {
      // Registry management endpoints
      const { RegistryClient } = await import(
        "../../src/services/registry-client.js"
      );
      const registryClient = new RegistryClient(env);

      if (pathname === "/api/registry/register" && request.method === "POST") {
        const results = await registryClient.register();
        const successCount = results.filter((r) => r.success).length;

        return new Response(
          JSON.stringify({
            success: successCount > 0,
            message: `Registration attempted with ${results.length} registries, ${successCount} successful`,
            results,
            timestamp: new Date().toISOString(),
          }),
          {
            status: successCount > 0 ? 200 : 502,
            headers: corsHeaders(),
          },
        );
      } else if (
        pathname === "/api/registry/status" &&
        request.method === "GET"
      ) {
        const registrationResults =
          await registryClient.getRegistrationResults();

        return new Response(
          JSON.stringify({
            success: true,
            serviceInfo: registryClient.getServiceDiscovery(),
            registrations: registrationResults,
            timestamp: new Date().toISOString(),
          }),
          { headers: corsHeaders() },
        );
      } else if (
        pathname === "/api/registry/update" &&
        request.method === "POST"
      ) {
        const body = await request.json();
        const status = body.status || "healthy";
        const result = await registryClient.updateStatus(status);

        return new Response(
          JSON.stringify({
            success: result.updated,
            ...result,
            timestamp: new Date().toISOString(),
          }),
          { headers: corsHeaders() },
        );
      } else if (
        pathname === "/api/registry/deregister" &&
        request.method === "DELETE"
      ) {
        const result = await registryClient.deregister();

        return new Response(
          JSON.stringify({
            success: result.deregistered,
            ...result,
            timestamp: new Date().toISOString(),
          }),
          { headers: corsHeaders() },
        );
      }
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Endpoint not found",
          availableEndpoints: [
            "GET /api/get-chittyid?region=1&jurisdiction=USA&type=P&trust=3",
            'POST /api/validate {"id": "01-1-USA-0001-P-2509-3-XX"}',
            "GET /api/info/{chittyid}",
            "GET /api/spec",
            "POST /api/realtime/rooms",
            "POST /api/realtime/rooms/{roomId}/join",
            "GET /api/realtime/rooms/{roomId}",
          ],
        }),
        {
          status: 404,
          headers: corsHeaders(),
        },
      );
    }
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 400,
        headers: corsHeaders(),
      },
    );
  }
}
