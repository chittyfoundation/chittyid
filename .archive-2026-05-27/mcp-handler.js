#!/usr/bin/env node

/**
 * ChittyID MCP Tool Handler
 * Provides Model Context Protocol integration for ChittyID CLI
 *
 * This handler bridges the MCP protocol with the ChittyID CLI,
 * enforcing central service minting and validation only.
 */

import { spawn } from "child_process";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { LangChainAIService } from "./src/services/langchain-ai.js";
import { ChittyCasesService } from "./src/services/chittycases-integration.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

class ChittyIDMCPHandler {
  constructor() {
    this.manifest = this.loadManifest();
    this.cliPath = join(__dirname, "chitty-cli.ts");

    // Initialize LangChain AI service
    this.langChainAI = new LangChainAIService({
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      CHITTY_SERVER_URL:
        process.env.CHITTY_SERVER_URL || "https://id.chitty.cc",
      CHITTY_API_KEY: process.env.CHITTY_API_KEY,
    });

    // Initialize ChittyCases service
    this.chittyCases = new ChittyCasesService({
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      CHITTY_SERVER_URL:
        process.env.CHITTY_SERVER_URL || "https://id.chitty.cc",
      CHITTY_API_KEY: process.env.CHITTY_API_KEY,
    });
  }

  /**
   * Load MCP manifest
   */
  loadManifest() {
    try {
      const manifestPath = join(__dirname, "manifest.json");
      return JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch (error) {
      throw new Error(`Failed to load manifest: ${error.message}`);
    }
  }

  /**
   * Handle MCP tool call
   */
  async handleToolCall(toolName, parameters) {
    // Handle LangChain AI operations
    if (toolName.startsWith("ai_")) {
      return this.handleAIOperation(toolName, parameters);
    }

    // Handle ChittyCases operations
    if (toolName.startsWith("cases_")) {
      return this.handleChittyCasesOperation(toolName, parameters);
    }

    if (toolName !== "chittyid") {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    // Validate required parameters
    if (!parameters.command) {
      throw new Error("Command parameter is required");
    }

    // Validate command
    const validCommands = [
      "gen",
      "generate",
      "register",
      "validate",
      "soft-mint",
      "hard-mint",
    ];
    if (!validCommands.includes(parameters.command)) {
      throw new Error(
        `Invalid command: ${parameters.command}. Valid commands: ${validCommands.join(", ")}`,
      );
    }

    // Build CLI arguments
    const args = [this.cliPath, parameters.command];

    // Add command-specific arguments
    switch (parameters.command) {
      case "gen":
      case "generate":
        if (parameters.type) args.push(parameters.type);
        break;

      case "register":
        if (parameters.type) args.push(parameters.type);
        if (parameters.payload) args.push(parameters.payload);
        break;

      case "validate":
        if (!parameters.id) {
          throw new Error("ID parameter is required for validate command");
        }
        args.push(parameters.id);
        break;

      case "soft-mint":
        if (!parameters.id) {
          throw new Error("ID parameter is required for soft-mint command");
        }
        args.push(parameters.id);
        break;

      case "hard-mint":
        if (!parameters.id) {
          throw new Error("ID parameter is required for hard-mint command");
        }
        args.push(parameters.id);
        if (parameters.maxGas) args.push(parameters.maxGas);
        break;
    }

    // Execute CLI command
    return this.executeCLI(args);
  }

  /**
   * Execute CLI command
   */
  async executeCLI(args) {
    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";

      // Check required environment variables
      if (!process.env.CHITTY_API_KEY) {
        reject(new Error("CHITTY_API_KEY environment variable is required"));
        return;
      }

      const child = spawn("npx", ["tsx", ...args], {
        env: {
          ...process.env,
          CHITTY_BASE_URL:
            process.env.CHITTY_BASE_URL || "https://id.chitty.cc",
          CHITTY_STORAGE:
            process.env.CHITTY_STORAGE ||
            join(process.env.HOME || ".", ".chitty"),
        },
        stdio: ["pipe", "pipe", "pipe"],
      });

      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        try {
          // Parse JSON output from CLI
          const result = JSON.parse(stdout);

          if (code === 0) {
            resolve({
              success: true,
              data: result,
              command: args[1],
              timestamp: new Date().toISOString(),
            });
          } else {
            reject(
              new Error(
                `CLI command failed with code ${code}: ${stderr || result.error}`,
              ),
            );
          }
        } catch (_parseError) {
          if (code === 0) {
            // Non-JSON output but successful
            resolve({
              success: true,
              output: stdout,
              command: args[1],
              timestamp: new Date().toISOString(),
            });
          } else {
            reject(
              new Error(
                `CLI command failed: ${stderr || stdout || "Unknown error"}`,
              ),
            );
          }
        }
      });

      child.on("error", (error) => {
        reject(new Error(`Failed to execute CLI: ${error.message}`));
      });
    });
  }

  /**
   * Handle AI operations via LangChain
   */
  async handleAIOperation(toolName, parameters) {
    const operation = toolName.replace("ai_", "");

    try {
      switch (operation) {
        case "legal_analysis":
          if (!parameters.caseDetails || !parameters.analysisType) {
            throw new Error(
              "caseDetails and analysisType parameters are required",
            );
          }
          return await this.langChainAI.analyzeLegalCase({
            caseDetails: parameters.caseDetails,
            analysisType: parameters.analysisType,
            provider: parameters.provider || "anthropic",
          });

        case "fund_tracing":
          if (!parameters.sourceAccount || !parameters.destination) {
            throw new Error(
              "sourceAccount and destination parameters are required",
            );
          }
          return await this.langChainAI.traceFunds({
            sourceAccount: parameters.sourceAccount,
            destination: parameters.destination,
            dateRange: parameters.dateRange,
            amount: parameters.amount,
          });

        case "document_generation":
          if (!parameters.documentType || !parameters.caseData) {
            throw new Error(
              "documentType and caseData parameters are required",
            );
          }
          return await this.langChainAI.generateDocument({
            documentType: parameters.documentType,
            caseData: parameters.caseData,
            template: parameters.template,
            requirements: parameters.requirements,
          });

        case "evidence_compilation":
          if (!parameters.claim || !parameters.evidenceTypes) {
            throw new Error("claim and evidenceTypes parameters are required");
          }
          return await this.langChainAI.compileEvidence({
            claim: parameters.claim,
            evidenceTypes: parameters.evidenceTypes,
            searchCriteria: parameters.searchCriteria,
          });

        case "timeline_generation":
          if (!parameters.topic || !parameters.dateRange) {
            throw new Error("topic and dateRange parameters are required");
          }
          return await this.langChainAI.generateTimeline({
            topic: parameters.topic,
            dateRange: parameters.dateRange,
            entities: parameters.entities,
            events: parameters.events,
          });

        case "compliance_analysis":
          if (!parameters.entity || !parameters.regulations) {
            throw new Error("entity and regulations parameters are required");
          }
          return await this.langChainAI.analyzeCompliance({
            entity: parameters.entity,
            regulations: parameters.regulations,
            scope: parameters.scope,
            documents: parameters.documents,
          });

        case "health_check":
          return await this.langChainAI.healthCheck();

        default:
          throw new Error(`Unknown AI operation: ${operation}`);
      }
    } catch (error) {
      return {
        error: true,
        message: error.message,
        operation,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Handle ChittyCases operations
   */
  async handleChittyCasesOperation(toolName, parameters) {
    const operation = toolName.replace("cases_", "");

    try {
      switch (operation) {
        case "legal_research":
          if (!parameters.query) {
            throw new Error("query parameter is required");
          }
          return await this.chittyCases.performLegalResearch({
            query: parameters.query,
            caseNumber: parameters.caseNumber,
            jurisdiction: parameters.jurisdiction,
            caseContext: parameters.caseContext,
          });

        case "document_analysis":
          if (!parameters.documentContent) {
            throw new Error("documentContent parameter is required");
          }
          return await this.chittyCases.analyzeDocument({
            documentContent: parameters.documentContent,
            documentType: parameters.documentType,
            caseNumber: parameters.caseNumber,
            analysisType: parameters.analysisType,
          });

        case "case_insights":
          if (!parameters.caseNumber && !parameters.caseData) {
            throw new Error("caseNumber or caseData parameter is required");
          }
          return await this.chittyCases.getCaseInsights({
            caseNumber: parameters.caseNumber,
            caseData: parameters.caseData,
            insightType: parameters.insightType,
          });

        case "petition_generation":
          if (!parameters.petitionType || !parameters.caseData) {
            throw new Error(
              "petitionType and caseData parameters are required",
            );
          }
          return await this.chittyCases.generatePetition({
            petitionType: parameters.petitionType,
            caseData: parameters.caseData,
            jurisdiction: parameters.jurisdiction,
            urgency: parameters.urgency,
          });

        case "contradiction_analysis":
          if (!parameters.documents && !parameters.statements) {
            throw new Error("documents or statements parameter is required");
          }
          return await this.chittyCases.findContradictions({
            documents: parameters.documents,
            statements: parameters.statements,
            caseNumber: parameters.caseNumber,
          });

        case "dashboard_generation":
          if (!parameters.caseNumber) {
            throw new Error("caseNumber parameter is required");
          }
          return await this.chittyCases.generateDashboardData({
            caseNumber: parameters.caseNumber,
            caseData: parameters.caseData,
          });

        case "health_check":
          return await this.chittyCases.healthCheck();

        default:
          throw new Error(`Unknown ChittyCases operation: ${operation}`);
      }
    } catch (error) {
      return {
        error: true,
        message: error.message,
        operation,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get tool capabilities
   */
  getCapabilities() {
    return this.manifest.capabilities;
  }

  /**
   * Get tool documentation
   */
  getDocumentation() {
    return this.manifest.documentation;
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      // Test basic CLI availability
      const _result = await this.executeCLI([this.cliPath]);

      // Test LangChain AI availability
      const aiHealth = await this.langChainAI.healthCheck();

      return {
        healthy: true,
        cli_available: true,
        ai_services: aiHealth,
        environment: {
          api_key_configured: !!process.env.CHITTY_API_KEY,
          openai_configured: !!process.env.OPENAI_API_KEY,
          anthropic_configured: !!process.env.ANTHROPIC_API_KEY,
          base_url: process.env.CHITTY_BASE_URL || "https://id.chitty.cc",
          storage_dir:
            process.env.CHITTY_STORAGE ||
            join(process.env.HOME || ".", ".chitty"),
        },
        manifest_version: this.manifest.version,
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

// MCP Protocol Handler
class MCPServer {
  constructor() {
    this.handler = new ChittyIDMCPHandler();
  }

  async processMessage(message) {
    try {
      const { method, params } = message;

      switch (method) {
        case "tools/list":
          return {
            tools: [
              {
                name: "chittyid",
                description: this.handler.manifest.description,
                inputSchema:
                  this.handler.manifest.capabilities.tools.chittyid.inputSchema,
              },
              {
                name: "ai_legal_analysis",
                description: "Analyze legal cases using LangChain AI",
                inputSchema: {
                  type: "object",
                  properties: {
                    caseDetails: {
                      type: "string",
                      description: "Legal case details and context",
                    },
                    analysisType: {
                      type: "string",
                      enum: ["risk", "strategy", "summary", "precedent"],
                      description: "Type of legal analysis to perform",
                    },
                    provider: {
                      type: "string",
                      enum: ["anthropic", "openai"],
                      description: "AI provider to use (default: anthropic)",
                    },
                  },
                  required: ["caseDetails", "analysisType"],
                },
              },
              {
                name: "ai_fund_tracing",
                description: "Trace financial fund flows using AI analysis",
                inputSchema: {
                  type: "object",
                  properties: {
                    sourceAccount: {
                      type: "string",
                      description: "Source account identifier",
                    },
                    destination: {
                      type: "string",
                      description: "Destination account or entity",
                    },
                    dateRange: {
                      type: "object",
                      description: "Date range for analysis",
                    },
                    amount: {
                      type: "string",
                      description: "Amount being traced",
                    },
                  },
                  required: ["sourceAccount", "destination"],
                },
              },
              {
                name: "ai_document_generation",
                description: "Generate legal documents using AI",
                inputSchema: {
                  type: "object",
                  properties: {
                    documentType: {
                      type: "string",
                      description: "Type of document to generate",
                    },
                    caseData: {
                      type: "object",
                      description: "Case data and context",
                    },
                    template: {
                      type: "object",
                      description: "Document template requirements",
                    },
                    requirements: {
                      type: "object",
                      description: "Special requirements",
                    },
                  },
                  required: ["documentType", "caseData"],
                },
              },
              {
                name: "ai_evidence_compilation",
                description: "Compile and analyze evidence using AI",
                inputSchema: {
                  type: "object",
                  properties: {
                    claim: {
                      type: "string",
                      description: "Legal claim or assertion",
                    },
                    evidenceTypes: {
                      type: "array",
                      description: "Types of evidence to analyze",
                    },
                    searchCriteria: {
                      type: "object",
                      description: "Search criteria for evidence",
                    },
                  },
                  required: ["claim", "evidenceTypes"],
                },
              },
              {
                name: "ai_timeline_generation",
                description: "Generate chronological timelines using AI",
                inputSchema: {
                  type: "object",
                  properties: {
                    topic: {
                      type: "string",
                      description: "Topic or subject for timeline",
                    },
                    dateRange: {
                      type: "object",
                      description: "Date range for timeline",
                    },
                    entities: {
                      type: "array",
                      description: "Key entities involved",
                    },
                    events: {
                      type: "array",
                      description: "Known events to include",
                    },
                  },
                  required: ["topic", "dateRange"],
                },
              },
              {
                name: "ai_compliance_analysis",
                description: "Analyze regulatory compliance using AI",
                inputSchema: {
                  type: "object",
                  properties: {
                    entity: {
                      type: "string",
                      description: "Entity being analyzed",
                    },
                    regulations: {
                      type: "array",
                      description: "Applicable regulations",
                    },
                    scope: { type: "object", description: "Compliance scope" },
                    documents: {
                      type: "array",
                      description: "Supporting documents",
                    },
                  },
                  required: ["entity", "regulations"],
                },
              },
              {
                name: "ai_health_check",
                description: "Check AI service health and capabilities",
                inputSchema: {
                  type: "object",
                  properties: {},
                  required: [],
                },
              },
              {
                name: "cases_legal_research",
                description:
                  "Perform enhanced legal research using ChittyCases",
                inputSchema: {
                  type: "object",
                  properties: {
                    query: {
                      type: "string",
                      description: "Legal research query",
                    },
                    caseNumber: {
                      type: "string",
                      description: "Case number (optional)",
                    },
                    jurisdiction: {
                      type: "string",
                      description:
                        "Legal jurisdiction (default: Cook County, Illinois)",
                    },
                    caseContext: {
                      type: "string",
                      description: "Additional case context (optional)",
                    },
                  },
                  required: ["query"],
                },
              },
              {
                name: "cases_document_analysis",
                description: "Analyze legal documents using ChittyCases",
                inputSchema: {
                  type: "object",
                  properties: {
                    documentContent: {
                      type: "string",
                      description: "Document content to analyze",
                    },
                    documentType: {
                      type: "string",
                      description: "Type of document (optional)",
                    },
                    caseNumber: {
                      type: "string",
                      description: "Associated case number (optional)",
                    },
                    analysisType: {
                      type: "string",
                      description: "Type of analysis (default: comprehensive)",
                    },
                  },
                  required: ["documentContent"],
                },
              },
              {
                name: "cases_case_insights",
                description:
                  "Generate strategic case insights using ChittyCases",
                inputSchema: {
                  type: "object",
                  properties: {
                    caseNumber: { type: "string", description: "Case number" },
                    caseData: {
                      type: "object",
                      description: "Case data and context",
                    },
                    insightType: {
                      type: "string",
                      description: "Type of insights (default: strategic)",
                    },
                  },
                  required: [],
                },
              },
              {
                name: "cases_petition_generation",
                description: "Generate legal petitions using ChittyCases",
                inputSchema: {
                  type: "object",
                  properties: {
                    petitionType: {
                      type: "string",
                      description: "Type of petition to generate",
                    },
                    caseData: {
                      type: "object",
                      description: "Case data and information",
                    },
                    jurisdiction: {
                      type: "string",
                      description: "Legal jurisdiction (optional)",
                    },
                    urgency: {
                      type: "string",
                      description: "Urgency level (default: normal)",
                    },
                  },
                  required: ["petitionType", "caseData"],
                },
              },
              {
                name: "cases_contradiction_analysis",
                description:
                  "Find contradictions and inconsistencies using ChittyCases",
                inputSchema: {
                  type: "object",
                  properties: {
                    documents: {
                      type: "array",
                      description: "Documents to analyze",
                    },
                    statements: {
                      type: "array",
                      description: "Statements to analyze",
                    },
                    caseNumber: {
                      type: "string",
                      description: "Associated case number (optional)",
                    },
                  },
                  required: [],
                },
              },
              {
                name: "cases_dashboard_generation",
                description:
                  "Generate comprehensive case dashboard using ChittyCases",
                inputSchema: {
                  type: "object",
                  properties: {
                    caseNumber: { type: "string", description: "Case number" },
                    caseData: {
                      type: "object",
                      description: "Case data and context (optional)",
                    },
                  },
                  required: ["caseNumber"],
                },
              },
              {
                name: "cases_health_check",
                description:
                  "Check ChittyCases service health and capabilities",
                inputSchema: {
                  type: "object",
                  properties: {},
                  required: [],
                },
              },
            ],
          };

        case "tools/call": {
          const { name, arguments: args } = params;
          const result = await this.handler.handleToolCall(name, args);
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
        data: { timestamp: new Date().toISOString() },
      };
    }
  }

  start() {
    console.log(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "server/ready",
        params: {
          name: this.handler.manifest.name,
          version: this.handler.manifest.version,
          capabilities: this.handler.getCapabilities(),
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
  const server = new MCPServer();
  server.start();
}

export { ChittyIDMCPHandler, MCPServer };
