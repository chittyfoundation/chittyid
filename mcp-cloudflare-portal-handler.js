#!/usr/bin/env node

/**
 * ChittyOS MCP Cloudflare Portal Handler
 * Integrates with existing ChittyAuth service for OAuth and API key management
 * Designed for Cloudflare MCP Portal deployment
 */

import { LangChainAIService } from "./src/services/langchain-ai.js";
import { ChittyCasesService } from "./src/services/chittycases-integration.js";

class ChittyOSMCPPortalHandler {
  constructor() {
    this.chittyAuthUrl =
      process.env.CHITTYAUTH_URL || "https://chittyauth-prod.workers.dev";
    this.mcpPortalMode = process.env.CLOUDFLARE_MCP_PORTAL === "true";
    this.oauthToken = null;
    this.apiKeys = new Map();

    // Initialize services (will use OAuth-managed keys)
    this.langChainAI = null;
    this.chittyCases = null;

    console.log("[MCP-PORTAL] Initializing ChittyOS MCP Portal Handler");
    console.log(`[MCP-PORTAL] ChittyAuth URL: ${this.chittyAuthUrl}`);
    console.log(`[MCP-PORTAL] Portal Mode: ${this.mcpPortalMode}`);
  }

  /**
   * Initialize services with OAuth-managed API keys
   */
  async initializeServices(oauthToken) {
    try {
      // Get API keys from ChittyAuth using OAuth token
      const apiKeys = await this.getOAuthManagedAPIKeys(oauthToken);

      // Initialize LangChain AI service
      this.langChainAI = new LangChainAIService({
        OPENAI_API_KEY: apiKeys.get("OPENAI_API_KEY"),
        ANTHROPIC_API_KEY: apiKeys.get("ANTHROPIC_API_KEY"),
        CHITTY_SERVER_URL: "https://id.chitty.cc",
        CHITTY_API_KEY: apiKeys.get("CHITTY_API_KEY"),
      });

      // Initialize ChittyCases service
      this.chittyCases = new ChittyCasesService({
        OPENAI_API_KEY: apiKeys.get("OPENAI_API_KEY"),
        ANTHROPIC_API_KEY: apiKeys.get("ANTHROPIC_API_KEY"),
        CHITTY_SERVER_URL: "https://id.chitty.cc",
        CHITTY_API_KEY: apiKeys.get("CHITTY_API_KEY"),
        CHITTYCASES_TOKEN: apiKeys.get("CHITTYCASES_API_KEY"),
      });

      console.log(
        "[MCP-PORTAL] Services initialized with OAuth-managed API keys",
      );
      return true;
    } catch (error) {
      console.error("[MCP-PORTAL] Failed to initialize services:", error);
      return false;
    }
  }

  /**
   * Get OAuth-managed API keys from ChittyAuth
   */
  async getOAuthManagedAPIKeys(oauthToken) {
    try {
      const response = await fetch(
        `${this.chittyAuthUrl}/api/v1/oauth/managed-keys`,
        {
          headers: {
            Authorization: `Bearer ${oauthToken}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to get managed API keys: ${response.status}`);
      }

      const data = await response.json();
      const keyMap = new Map();

      // Map the managed keys
      for (const key of data.managed_keys) {
        keyMap.set(key.name, key.value);
      }

      this.apiKeys = keyMap;
      console.log(
        `[MCP-PORTAL] Retrieved ${keyMap.size} managed API keys from ChittyAuth`,
      );

      return keyMap;
    } catch (error) {
      console.error(
        "[MCP-PORTAL] Failed to get OAuth-managed API keys:",
        error,
      );
      throw error;
    }
  }

  /**
   * Validate OAuth token with ChittyAuth
   */
  async validateOAuthToken(token) {
    try {
      const response = await fetch(
        `${this.chittyAuthUrl}/api/v1/oauth/validate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token: token,
            scopes_required: [
              "chittyid:read",
              "chittyid:write",
              "ai:langchain",
              "cases:read",
              "mcp:projects",
              "session:sync",
            ],
          }),
        },
      );

      if (!response.ok) {
        return {
          valid: false,
          error: `Token validation failed: ${response.status}`,
        };
      }

      const result = await response.json();

      if (result.valid) {
        this.oauthToken = token;
        await this.initializeServices(token);
      }

      return result;
    } catch (error) {
      console.error("[MCP-PORTAL] OAuth token validation failed:", error);
      return { valid: false, error: error.message };
    }
  }

  /**
   * Handle MCP tool calls with OAuth validation
   */
  async handleToolCall(toolName, parameters, oauthToken) {
    // Validate OAuth token first
    if (!this.oauthToken || this.oauthToken !== oauthToken) {
      const validation = await this.validateOAuthToken(oauthToken);
      if (!validation.valid) {
        throw new Error(`OAuth validation failed: ${validation.error}`);
      }
    }

    // Ensure services are initialized
    if (!this.langChainAI || !this.chittyCases) {
      const initialized = await this.initializeServices(oauthToken);
      if (!initialized) {
        throw new Error(
          "Failed to initialize services with OAuth-managed keys",
        );
      }
    }

    console.log(`[MCP-PORTAL] Executing tool: ${toolName}`);

    switch (toolName) {
      case "chittyid_generate":
        return await this.handleChittyIDGenerate(parameters);

      case "chittyid_validate":
        return await this.handleChittyIDValidate(parameters);

      case "langchain_legal_analysis":
        return await this.handleLangChainLegalAnalysis(parameters);

      case "langchain_document_generation":
        return await this.handleLangChainDocumentGeneration(parameters);

      case "chittycases_legal_research":
        return await this.handleChittyCasesLegalResearch(parameters);

      case "chittycases_case_insights":
        return await this.handleChittyCasesCaseInsights(parameters);

      case "session_sync_status":
        return await this.handleSessionSyncStatus(parameters);

      case "mcp_project_register":
        return await this.handleMCPProjectRegister(parameters);

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  /**
   * ChittyID generation tool
   */
  async handleChittyIDGenerate(parameters) {
    const { entity_type, metadata = {} } = parameters;

    try {
      const response = await fetch("https://id.chitty.cc/v1/mint", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKeys.get("CHITTY_API_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          entityType: entity_type.toUpperCase(),
          metadata: {
            ...metadata,
            source: "mcp-portal",
            oauth_managed: true,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`ChittyID generation failed: ${response.status}`);
      }

      const result = await response.json();

      return {
        success: true,
        chitty_id: result.chitty_id,
        entity_type: entity_type,
        format: "VV-G-LLL-SSSS-T-YM-C-X",
        generated_at: new Date().toISOString(),
        source: "oauth_managed_mcp",
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        entity_type: entity_type,
      };
    }
  }

  /**
   * ChittyID validation tool
   */
  async handleChittyIDValidate(parameters) {
    const { chitty_id } = parameters;

    try {
      const response = await fetch(`https://id.chitty.cc/v1/verify`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKeys.get("CHITTY_API_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chitty_id: chitty_id,
        }),
      });

      if (!response.ok) {
        throw new Error(`ChittyID validation failed: ${response.status}`);
      }

      const result = await response.json();

      return {
        chitty_id: chitty_id,
        valid: result.valid,
        format_valid: result.format_valid,
        exists: result.exists,
        entity_type: result.entity_type,
        trust_level: result.trust_level,
        validated_at: new Date().toISOString(),
      };
    } catch (error) {
      return {
        chitty_id: chitty_id,
        valid: false,
        error: error.message,
      };
    }
  }

  /**
   * LangChain legal analysis tool
   */
  async handleLangChainLegalAnalysis(parameters) {
    const {
      case_details,
      analysis_type,
      ai_provider = "anthropic",
    } = parameters;

    try {
      const result = await this.langChainAI.analyzeLegalCase({
        caseDetails: case_details,
        analysisType: analysis_type,
        provider: ai_provider,
      });

      return {
        success: true,
        analysis_type: analysis_type,
        ai_provider: ai_provider,
        analysis: result.analysis,
        confidence: result.confidence,
        generated_at: new Date().toISOString(),
        source: "oauth_managed_langchain",
      };
    } catch (error) {
      return {
        success: false,
        analysis_type: analysis_type,
        error: error.message,
      };
    }
  }

  /**
   * LangChain document generation tool
   */
  async handleLangChainDocumentGeneration(parameters) {
    const {
      document_type,
      case_data,
      jurisdiction = "Cook County, Illinois",
    } = parameters;

    try {
      const result = await this.langChainAI.generateDocument({
        documentType: document_type,
        caseData: case_data,
        template: { jurisdiction: jurisdiction },
        requirements: { format: "legal_standard" },
      });

      return {
        success: true,
        document_type: document_type,
        jurisdiction: jurisdiction,
        document: result.document,
        document_id: result.documentId,
        generated_at: new Date().toISOString(),
        source: "oauth_managed_langchain",
      };
    } catch (error) {
      return {
        success: false,
        document_type: document_type,
        error: error.message,
      };
    }
  }

  /**
   * ChittyCases legal research tool
   */
  async handleChittyCasesLegalResearch(parameters) {
    const {
      query,
      jurisdiction = "Cook County, Illinois",
      case_number,
    } = parameters;

    try {
      const result = await this.chittyCases.performLegalResearch({
        query: query,
        jurisdiction: jurisdiction,
        caseNumber: case_number,
      });

      return {
        success: true,
        query: query,
        jurisdiction: jurisdiction,
        case_number: case_number,
        research_results: result.results,
        sources: result.sources,
        searched_at: new Date().toISOString(),
        source: "oauth_managed_chittycases",
      };
    } catch (error) {
      return {
        success: false,
        query: query,
        error: error.message,
      };
    }
  }

  /**
   * ChittyCases case insights tool
   */
  async handleChittyCasesCaseInsights(parameters) {
    const { case_number, insight_type = "strategic" } = parameters;

    try {
      const result = await this.chittyCases.getCaseInsights({
        caseNumber: case_number,
        insightType: insight_type,
      });

      return {
        success: true,
        case_number: case_number,
        insight_type: insight_type,
        insights: result.insights,
        recommendations: result.recommendations,
        generated_at: new Date().toISOString(),
        source: "oauth_managed_chittycases",
      };
    } catch (error) {
      return {
        success: false,
        case_number: case_number,
        error: error.message,
      };
    }
  }

  /**
   * Session sync status tool
   */
  async handleSessionSyncStatus(parameters) {
    const { include_history = false } = parameters;

    try {
      // Get session sync status from ChittyAuth
      const response = await fetch(
        `${this.chittyAuthUrl}/api/v1/sessions/status`,
        {
          headers: {
            Authorization: `Bearer ${this.oauthToken}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Session sync status failed: ${response.status}`);
      }

      const result = await response.json();

      if (include_history) {
        const historyResponse = await fetch(
          `${this.chittyAuthUrl}/api/v1/sessions/history`,
          {
            headers: {
              Authorization: `Bearer ${this.oauthToken}`,
              "Content-Type": "application/json",
            },
          },
        );

        if (historyResponse.ok) {
          const history = await historyResponse.json();
          result.cross_session_history = history;
        }
      }

      return {
        success: true,
        session_sync: result,
        oauth_managed: true,
        retrieved_at: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * MCP project registration tool
   */
  async handleMCPProjectRegister(parameters) {
    const { project_name, description, capabilities = [] } = parameters;

    try {
      const response = await fetch(
        `${this.chittyAuthUrl}/api/v1/mcp/projects`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.oauthToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: project_name,
            description: description,
            capabilities: capabilities,
            oauth_managed: true,
            portal_integration: "cloudflare_mcp",
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`MCP project registration failed: ${response.status}`);
      }

      const result = await response.json();

      return {
        success: true,
        project_id: result.project_id,
        project_name: project_name,
        capabilities: capabilities,
        oauth_managed: true,
        registered_at: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        project_name: project_name,
        error: error.message,
      };
    }
  }

  /**
   * Health check for portal integration
   */
  async healthCheck() {
    try {
      // Check ChittyAuth connectivity
      const authResponse = await fetch(`${this.chittyAuthUrl}/health`);
      const authHealthy = authResponse.ok;

      // Check service initialization
      const servicesHealthy = this.langChainAI && this.chittyCases;

      return {
        healthy: authHealthy && servicesHealthy,
        mcp_portal_mode: this.mcpPortalMode,
        chittyauth_connectivity: authHealthy,
        services_initialized: servicesHealthy,
        oauth_token_valid: !!this.oauthToken,
        managed_api_keys: this.apiKeys.size,
        chittyauth_url: this.chittyAuthUrl,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

// MCP Protocol Handler for Cloudflare Portal
class MCPCloudflarePortalServer {
  constructor() {
    this.handler = new ChittyOSMCPPortalHandler();
  }

  async processMessage(message) {
    try {
      const { method, params } = message;

      switch (method) {
        case "tools/list":
          return {
            tools: [
              {
                name: "chittyid_generate",
                description:
                  "Generate ChittyID from central authority (OAuth managed)",
                inputSchema: {
                  type: "object",
                  properties: {
                    entity_type: {
                      type: "string",
                      enum: [
                        "person",
                        "location",
                        "thing",
                        "event",
                        "info",
                        "fact",
                        "context",
                        "actor",
                      ],
                      description: "Type of entity for ChittyID generation",
                    },
                    metadata: {
                      type: "object",
                      description: "Additional metadata for the entity",
                    },
                  },
                  required: ["entity_type"],
                },
              },
              {
                name: "chittyid_validate",
                description:
                  "Validate ChittyID format and existence (OAuth managed)",
                inputSchema: {
                  type: "object",
                  properties: {
                    chitty_id: {
                      type: "string",
                      description:
                        "ChittyID to validate (format: VV-G-LLL-SSSS-T-YM-C-X)",
                    },
                  },
                  required: ["chitty_id"],
                },
              },
              {
                name: "langchain_legal_analysis",
                description:
                  "Perform legal case analysis using LangChain AI (OAuth managed)",
                inputSchema: {
                  type: "object",
                  properties: {
                    case_details: {
                      type: "string",
                      description: "Legal case details and context",
                    },
                    analysis_type: {
                      type: "string",
                      enum: ["risk", "strategy", "summary", "precedent"],
                      description: "Type of legal analysis to perform",
                    },
                    ai_provider: {
                      type: "string",
                      enum: ["anthropic", "openai"],
                      description: "AI provider preference",
                    },
                  },
                  required: ["case_details", "analysis_type"],
                },
              },
              {
                name: "langchain_document_generation",
                description:
                  "Generate legal documents using LangChain AI (OAuth managed)",
                inputSchema: {
                  type: "object",
                  properties: {
                    document_type: {
                      type: "string",
                      enum: [
                        "petition",
                        "brief",
                        "motion",
                        "contract",
                        "discovery",
                      ],
                      description: "Type of legal document to generate",
                    },
                    case_data: {
                      type: "object",
                      description:
                        "Case data and context for document generation",
                    },
                    jurisdiction: {
                      type: "string",
                      description: "Legal jurisdiction",
                    },
                  },
                  required: ["document_type", "case_data"],
                },
              },
              {
                name: "chittycases_legal_research",
                description:
                  "Perform legal research using ChittyCases database (OAuth managed)",
                inputSchema: {
                  type: "object",
                  properties: {
                    query: {
                      type: "string",
                      description: "Legal research query",
                    },
                    jurisdiction: {
                      type: "string",
                      description: "Legal jurisdiction",
                    },
                    case_number: {
                      type: "string",
                      description: "Specific case number (optional)",
                    },
                  },
                  required: ["query"],
                },
              },
              {
                name: "chittycases_case_insights",
                description:
                  "Generate strategic case insights using ChittyCases (OAuth managed)",
                inputSchema: {
                  type: "object",
                  properties: {
                    case_number: {
                      type: "string",
                      description: "Case number for insights",
                    },
                    insight_type: {
                      type: "string",
                      enum: [
                        "strategic",
                        "tactical",
                        "procedural",
                        "financial",
                      ],
                      description: "Type of insights to generate",
                    },
                  },
                  required: ["case_number"],
                },
              },
              {
                name: "session_sync_status",
                description:
                  "Get current session sync status and history (OAuth managed)",
                inputSchema: {
                  type: "object",
                  properties: {
                    include_history: {
                      type: "boolean",
                      description: "Include cross-session history",
                    },
                  },
                  required: [],
                },
              },
              {
                name: "mcp_project_register",
                description:
                  "Register new MCP project with ChittyAuth (OAuth managed)",
                inputSchema: {
                  type: "object",
                  properties: {
                    project_name: {
                      type: "string",
                      description: "Name of the MCP project",
                    },
                    description: {
                      type: "string",
                      description: "Project description",
                    },
                    capabilities: {
                      type: "array",
                      items: { type: "string" },
                      description: "Required capabilities for the project",
                    },
                  },
                  required: ["project_name"],
                },
              },
            ],
          };

        case "tools/call": {
          const { name, arguments: args } = params;
          const oauthToken = params.oauth_token || process.env.OAUTH_TOKEN;

          if (!oauthToken) {
            throw new Error("OAuth token required for tool execution");
          }

          const result = await this.handler.handleToolCall(
            name,
            args,
            oauthToken,
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case "ping":
          return { pong: true };

        case "health":
          return await this.handler.healthCheck();

        default:
          throw new Error(`Unknown method: ${method}`);
      }
    } catch (error) {
      throw {
        code: -1,
        message: error.message,
        data: {
          timestamp: new Date().toISOString(),
          oauth_managed: true,
          portal_mode: true,
        },
      };
    }
  }

  start() {
    console.log(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "server/ready",
        params: {
          name: "ChittyOS MCP Portal Server",
          version: "1.0.0",
          oauth_managed: true,
          portal_integration: "cloudflare",
          capabilities: {
            tools: 8,
            oauth_enabled: true,
            api_key_management: true,
            session_sync: true,
          },
        },
      }),
    );

    // Handle stdin messages
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", async (data) => {
      try {
        const lines = data.trim().split("\n");
        for (const line of lines) {
          if (line.trim()) {
            const message = JSON.parse(line);
            const response = await this.processMessage(message);

            console.log(
              JSON.stringify({
                jsonrpc: "2.0",
                id: message.id,
                result: response,
              }),
            );
          }
        }
      } catch (error) {
        console.log(
          JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: {
              code: -1,
              message: error.message,
            },
          }),
        );
      }
    });
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new MCPCloudflarePortalServer();
  server.start();
}

export { ChittyOSMCPPortalHandler, MCPCloudflarePortalServer };
