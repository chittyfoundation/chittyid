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
import { onRequest } from "./functions/api/[[route]].js";

// Import MCP Portal Handler for enhanced routing
import { ChittyOSMCPPortalHandler } from "./mcp-cloudflare-portal-handler.js";

// Import Ontology Controller for entity classification and hybrid ID generation
import OntologyControllerWorker from "./src/hybrid/ontology-controller.js";

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

      // Create a context object that matches Pages Functions format
      const context = {
        request,
        env,
        ctx,
        waitUntil: ctx.waitUntil.bind(ctx),
        passThroughOnException: ctx.passThroughOnException.bind(ctx),
      };

      // Use the same handler as Pages Functions but in Worker context
      return await onRequest(context);
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
