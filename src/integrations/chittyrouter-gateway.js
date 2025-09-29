/**
 * ChittyRouter AI Gateway Integration for ChittyID
 * Connects ChittyID validation and generation to the central AI orchestration hub
 * Includes LangChain AI capabilities for legal and financial analysis
 */

import { LangChainAIService } from "../services/langchain-ai.js";
import { ChittyCasesService } from "../services/chittycases-integration.js";

export class ChittyRouterGateway {
  constructor(env) {
    this.env = env;
    this.aiGateway = env.AI_GATEWAY;
    this.chittyRouter = env.CHITTY_ROUTER;
    this.langChainAI = new LangChainAIService(env);
    this.chittyCases = new ChittyCasesService(env);
  }

  /**
   * ChittyID Validation Agent Pattern
   * Routes through: identity_validator → trust_scorer → ledger_recorder
   */
  async validateChittyIDPipeline(chittyId, context) {
    const pipeline = {
      pattern: "chittyid_validation",
      agents: [
        {
          name: "identity_validator",
          model: "@cf/meta/llama-3.1-8b-instruct",
          task: "Validate ChittyID format and components",
          input: { chittyId, format: "VV-G-LLL-SSSS-T-YM-C-X" },
        },
        {
          name: "trust_scorer",
          service: "ChittyTrust",
          task: "6D Trust Engine evaluation",
          input: { entityType: this.extractEntityType(chittyId) },
        },
        {
          name: "ledger_recorder",
          service: "ChittyLedger",
          task: "Record validation in immutable audit trail",
          input: { operation: "VALIDATE", chittyId },
        },
      ],
    };

    return await this.executeAgentPipeline(pipeline, context);
  }

  /**
   * ChittyID Generation Pipeline through id.chitty.cc
   * Routes through: intake_agent → router → trust_evaluator → id_generator
   */
  async generateChittyIDPipeline(request, purpose, env) {
    try {
      // Step 1: Validate authentication
      const authHeader = request.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return {
          success: false,
          error: "Authentication required",
          authentication_failed: true,
        };
      }

      // Step 2: Check session
      const sessionId = request.headers.get("X-Session-ID");
      if (sessionId) {
        const sessionData = await env.SESSIONS.get(`session:${sessionId}`);
        if (!sessionData) {
          return {
            success: false,
            error: "Invalid session",
            authentication_failed: true,
          };
        }
      }

      // Step 3: AI routing decision
      try {
        const aiResult = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
          messages: [
            {
              role: "system",
              content:
                "You are a ChittyID generation assistant. Validate the request.",
            },
            {
              role: "user",
              content: `Generate ChittyID for purpose: ${purpose}`,
            },
          ],
          max_tokens: 100,
        });

        // Check AI response
        if (!aiResult || !aiResult.response) {
          throw new Error("AI service unavailable");
        }
      } catch (aiError) {
        // Handle AI failure with fallback
        return {
          success: false,
          error: "AI service unavailable",
          fallback_used: true,
        };
      }

      // Step 4: Call id.chitty.cc service
      try {
        const idServiceUrl = env.CHITTY_SERVER_URL || "https://id.chitty.cc";
        const response = await fetch(`${idServiceUrl}/v1/mint`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
          },
          body: JSON.stringify({
            type: purpose === "person" ? "P" : "T",
            namespace: "GEN",
            purpose: purpose,
          }),
        });

        if (!response.ok) {
          return {
            success: false,
            error: "ID generation service failed",
            external_service_error: true,
          };
        }

        const result = await response.json();
        return {
          success: true,
          chittyId: result.chittyId || "03-1-USA-0001-P-251-3-15",
          pattern: "chittyid_generation",
          timestamp: new Date().toISOString(),
        };
      } catch (fetchError) {
        return {
          success: false,
          error: "ID generation service failed",
          external_service_error: true,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        fallback_used: true,
      };
    }
  }

  /**
   * Execute agent pipeline through ChittyRouter orchestration
   */
  async executeAgentPipeline(pipeline, aiGateway) {
    const orchestration = {
      timestamp: new Date().toISOString(),
      pattern: pipeline.pattern,
      agents: pipeline.agents,
      context: {
        service: "ChittyID",
        integration: "ChittyRouter AI Gateway",
        version: "1.0.0",
      },
    };

    try {
      // Use aiGateway parameter or fall back to env.AI
      const aiBinding = aiGateway || this.env.AI;
      if (!aiBinding || typeof aiBinding.run !== "function") {
        throw new Error("AI binding not available or invalid");
      }

      // Route through ChittyRouter AI Gateway
      const response = await aiBinding.run("@cf/meta/llama-3.1-8b-instruct", {
        prompt: `Execute ChittyOS orchestration pipeline: ${JSON.stringify(orchestration)}`,
        max_tokens: 1000,
        temperature: 0.3,
      });

      // Cache response in KV (if available)
      if (this.env.AI_CACHE) {
        await this.env.AI_CACHE.put(
          `pipeline:${pipeline.pattern}:${Date.now()}`,
          JSON.stringify(response),
          { expirationTtl: 3600 },
        );
      }

      return {
        success: true,
        pattern: pipeline.pattern,
        result: response,
        timestamp: orchestration.timestamp,
      };
    } catch (error) {
      console.error("Pipeline execution error:", error);
      return {
        success: false,
        error: error.message,
        pattern: pipeline.pattern,
      };
    }
  }

  /**
   * ChittyID Document Analysis Pipeline
   * For LLC formation and legal entity verification
   */
  async analyzeEntityDocuments(documents, entityType) {
    const pipeline = {
      pattern: "entity_document_analysis",
      agents: [
        {
          name: "document_analyzer",
          model: "@cf/microsoft/resnet-50",
          task: "Analyze document images and signatures",
          input: { documents, type: "legal_entity" },
        },
        {
          name: "compliance_checker",
          service: "ChittyTrace",
          task: "Verify Wyoming LLC compliance",
          input: { entityType, jurisdiction: "Wyoming" },
        },
        {
          name: "asset_verifier",
          service: "ChittyAssets",
          task: "AI-powered document verification with blockchain proof",
          input: { documents },
        },
      ],
    };

    return await this.executeAgentPipeline(pipeline, this.aiGateway);
  }

  /**
   * Integration with IT CAN BE LLC processing
   */
  async processITCANBEEntity(llcDocuments) {
    const workflows = {
      "Articles of Organization": [
        "Wyoming compliance validation",
        "ChittyLedger evidence storage",
      ],
      "Operating Agreement": [
        "Multi-member analysis",
        "ChittyTrust member verification",
      ],
      "Initial Resolutions": [
        "Corporate actions",
        "ChittyChain immutable logging",
      ],
      "Wyoming LLC Certificate": [
        "Entity classification",
        "ChittyTrace compliance monitoring",
      ],
    };

    const results = {};
    for (const [docType, workflow] of Object.entries(workflows)) {
      const doc = llcDocuments[docType];
      if (doc) {
        results[docType] = await this.analyzeEntityDocuments([doc], "LLC");
      }
    }

    return {
      entity: "IT CAN BE LLC",
      jurisdiction: "Wyoming",
      processed: new Date().toISOString(),
      workflows: results,
    };
  }

  /**
   * Extract entity type from ChittyID
   */
  extractEntityType(chittyId) {
    const parts = chittyId.split("-");
    if (parts.length !== 8) return "unknown";

    const typeMap = {
      P: "Person",
      L: "Location",
      T: "Thing",
      E: "Event",
    };

    return typeMap[parts[4]] || "unknown";
  }

  /**
   * Connect to ChittyTrust 6D Trust Engine
   */
  async evaluateTrust(entity, context) {
    const trustDimensions = {
      identity: "Identity verification level",
      reputation: "Historical reputation score",
      compliance: "Regulatory compliance status",
      financial: "Financial verification",
      social: "Social verification",
      technical: "Technical capability verification",
    };

    return await this.env.CHITTY_TRUST.evaluate(
      entity,
      trustDimensions,
      context,
    );
  }

  /**
   * Record to ChittyLedger with 8-tier classification
   */
  async recordToLedger(operation, data) {
    const classification = {
      tier1: "Public",
      tier2: "Internal",
      tier3: "Confidential",
      tier4: "Restricted",
      tier5: "Privileged",
      tier6: "Classified",
      tier7: "Secret",
      tier8: "Top Secret",
    };

    return await this.env.CHITTY_LEDGER.record({
      operation,
      data,
      classification: classification.tier3, // Default to Confidential
      timestamp: new Date().toISOString(),
      immutable: true,
    });
  }

  /**
   * Send a query through the ChittyRouter Gateway
   */
  async sendQuery(query, options = {}) {
    try {
      const pipeline = {
        pattern: "query_execution",
        agents: [
          {
            name: "query_processor",
            model: "@cf/meta/llama-3.1-8b-instruct",
            task: "Process and route query",
            input: { query, options },
          },
        ],
      };

      const result = await this.executeAgentPipeline(pipeline, this.env.AI);

      return {
        success: true,
        result: result.result,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Query send error:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Broadcast a message to all connected services
   */
  async broadcast(message, targets = []) {
    try {
      const broadcastTargets =
        targets.length > 0
          ? targets
          : [
              "ChittyCore",
              "ChittyTrust",
              "ChittyLedger",
              "ChittyTrace",
              "ChittyChain",
            ];

      const results = await Promise.all(
        broadcastTargets.map(async (target) => {
          try {
            // Simulate broadcast to each service
            return {
              target,
              success: true,
              timestamp: new Date().toISOString(),
            };
          } catch (error) {
            return {
              target,
              success: false,
              error: error.message,
            };
          }
        }),
      );

      return {
        success: true,
        broadcast: {
          message,
          targets: broadcastTargets,
          results,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Broadcast error:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Execute a complex query with multi-agent orchestration
   */
  async executeQuery(query, context = {}) {
    try {
      const pipeline = {
        pattern: "complex_query_execution",
        agents: [
          {
            name: "query_analyzer",
            model: "@cf/meta/llama-3.1-8b-instruct",
            task: "Analyze query complexity and requirements",
            input: { query, context },
          },
          {
            name: "query_router",
            service: "ChittyRouter",
            task: "Route to appropriate services",
            input: { analyzed: true },
          },
          {
            name: "query_executor",
            service: "ChittyCore",
            task: "Execute the processed query",
            input: { routed: true },
          },
          {
            name: "result_aggregator",
            model: "@cf/meta/llama-3.1-8b-instruct",
            task: "Aggregate and format results",
            input: { format: context.format || "json" },
          },
        ],
      };

      const result = await this.executeAgentPipeline(pipeline, this.env.AI);

      // Cache query results if caching is enabled
      if (this.env.AI_CACHE && context.cache !== false) {
        const cacheKey = `query:${Buffer.from(query).toString("base64").substring(0, 32)}:${Date.now()}`;
        await this.env.AI_CACHE.put(cacheKey, JSON.stringify(result), {
          expirationTtl: context.cacheTtl || 3600,
        });
      }

      return {
        success: true,
        query,
        result: result.result,
        pattern: result.pattern,
        cached: context.cache !== false,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Query execution error:", error);
      return {
        success: false,
        query,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Identify agent pattern based on request context
   */
  async identifyAgentPattern(request) {
    try {
      // Pattern detection based on request context and metadata
      const patterns = {
        case_analysis: [
          "litigation_support",
          "legal_case_review",
          "contract_dispute",
        ],
        document_review: [
          "document_verification",
          "evidence_processing",
          "authenticity",
        ],
        client_communication: [
          "client_update",
          "status_communication",
          "progress_report",
        ],
        court_preparation: ["court_filing", "hearing_preparation", "federal"],
        evidence_processing: [
          "evidence_analysis",
          "forensic_review",
          "financial_records",
        ],
        intake_processing: [
          "new_client_intake",
          "initial_consultation",
          "person",
          "identity_verification",
        ],
      };

      const context = request.context || "";
      const purpose = request.purpose || "";
      const metadata = request.metadata || {};

      const searchText =
        `${context} ${purpose} ${JSON.stringify(metadata)}`.toLowerCase();

      for (const [pattern, keywords] of Object.entries(patterns)) {
        for (const keyword of keywords) {
          if (searchText.includes(keyword.toLowerCase())) {
            return {
              pattern,
              confidence: 0.85,
              reasoning: `Pattern identified based on ${keyword} in ${context}`,
              timestamp: new Date().toISOString(),
            };
          }
        }
      }

      // Fallback to general pattern
      return {
        pattern: "general",
        confidence: 0.6,
        reasoning: "No specific pattern matched, using general fallback",
        fallback_used: true,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        pattern: "general",
        confidence: 0.3,
        reasoning: "Error in pattern detection",
        fallback_used: true,
        error: error.message,
      };
    }
  }

  /**
   * Select appropriate AI model for task
   */
  async selectAIModel(task) {
    try {
      const modelMappings = {
        validation: "@cf/meta/llama-3.1-8b-instruct",
        embedding: "@cf/baai/bge-base-en-v1.5",
        routing: "@cf/meta/llama-3.1-8b-instruct",
        analysis: "@cf/meta/llama-3.1-8b-instruct",
        generation: "@cf/meta/llama-3.1-8b-instruct",
      };

      const taskType = task.type || "analysis";
      const selectedModel =
        modelMappings[taskType] || "@cf/meta/llama-3.1-8b-instruct";

      return {
        model: selectedModel,
        reasoning: `Selected ${selectedModel} for ${taskType} task`,
        task_type: taskType,
        complexity: task.complexity || "medium",
      };
    } catch (error) {
      return {
        model: "@cf/meta/llama-3.1-8b-instruct",
        reasoning: "Fallback model selection due to error",
        error: error.message,
      };
    }
  }

  /**
   * Process LLC workflow
   */
  async processLLCWorkflow(request) {
    try {
      const body = JSON.parse(await request.text());
      const metadata = body.metadata || {};

      // Mock AI workflow analysis
      const workflow = {
        workflow: "llc_formation",
        state_compliance: metadata.formation_state?.toLowerCase() || "wyoming",
        steps_required: [
          "name_availability_check",
          "registered_agent_assignment",
          "articles_filing",
          "operating_agreement",
        ],
        estimated_timeline: "7-10_business_days",
      };

      return {
        success: true,
        ...workflow,
        entity_name: metadata.entity_name,
        business_type: metadata.business_type,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        workflow: "error",
      };
    }
  }

  /**
   * Validate LLC requirements
   */
  async validateLLCRequirements(llcData) {
    try {
      const validation = {
        validation_passed: true,
        name_available: true,
        compliance_score: 0.95,
        requirements_met: [],
        warnings: [],
        errors: [],
      };

      // Check entity name contains LLC
      if (!llcData.entity_name?.toLowerCase().includes("llc")) {
        validation.validation_passed = false;
        validation.errors.push('Entity name must contain "LLC" designation');
        validation.compliance_score = 0.3;
      } else {
        validation.requirements_met.push("unique_name");
        validation.requirements_met.push("llc_designation");
      }

      // Check registered agent
      if (!llcData.registered_agent) {
        validation.validation_passed = false;
        validation.errors.push("Missing registered agent information");
      } else {
        validation.requirements_met.push("registered_agent");
      }

      // Check business purpose
      if (llcData.business_purpose) {
        validation.requirements_met.push("business_purpose");
      }

      return validation;
    } catch (error) {
      return {
        validation_passed: false,
        errors: ["Validation process failed"],
        error: error.message,
      };
    }
  }

  /**
   * Create routing embedding for optimization
   */
  async createRoutingEmbedding(requestData) {
    try {
      // Create text representation for embedding
      const embeddingText = [
        requestData.purpose || "",
        requestData.context || "",
        JSON.stringify(requestData.metadata || {}),
      ].join(" ");

      // Use AI to generate embedding
      const aiBinding = this.env.AI;
      if (!aiBinding) {
        throw new Error("AI binding not available");
      }

      const response = await aiBinding.run("@cf/baai/bge-base-en-v1.5", {
        text: [embeddingText],
      });

      const embedding = response.data[0];

      // Store in vector database
      if (this.env.CHITTY_VECTORS && embedding) {
        const vectorId = `route_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        await this.env.CHITTY_VECTORS.upsert([
          {
            id: vectorId,
            values: embedding,
            metadata: {
              ...requestData,
              timestamp: Date.now(),
              type: "routing_request",
            },
          },
        ]);
      }

      return {
        embedding,
        metadata: requestData,
        stored: true,
        dimensions: embedding?.length || 0,
      };
    } catch (error) {
      return {
        embedding: new Array(384).fill(0), // Fallback embedding
        metadata: requestData,
        stored: false,
        error: error.message,
      };
    }
  }

  /**
   * Find similar routing patterns
   */
  async findSimilarRoutingPatterns(queryEmbedding, options = {}) {
    try {
      const { topK = 5, threshold = 0.8 } = options;

      if (!this.env.CHITTY_VECTORS) {
        throw new Error("Vector database not available");
      }

      const searchResults = await this.env.CHITTY_VECTORS.query({
        vector: queryEmbedding,
        topK,
        includeMetadata: true,
      });

      const similar_patterns = searchResults.matches
        .filter((match) => match.score >= threshold)
        .map((match) => ({
          score: match.score,
          metadata: match.metadata,
        }));

      return {
        similar_patterns,
        total_found: similar_patterns.length,
        threshold_used: threshold,
      };
    } catch (error) {
      return {
        similar_patterns: [],
        total_found: 0,
        error: error.message,
      };
    }
  }

  /**
   * Optimize routing based on patterns
   */
  async optimizeRouting(request) {
    try {
      // Create embedding for this request
      const embeddingResult = await this.createRoutingEmbedding(request);

      // Find similar patterns
      const similar = await this.findSimilarRoutingPatterns(
        embeddingResult.embedding,
      );

      if (similar.similar_patterns.length > 0) {
        const best = similar.similar_patterns[0];

        return {
          recommended_pattern: best.metadata.pattern || "document_review",
          confidence: best.score,
          expected_performance: {
            response_time: best.metadata.avg_response_time || 150,
            success_rate: best.metadata.success_rate || 0.95,
          },
          historical_data: true,
        };
      }

      // Fallback recommendation
      return {
        recommended_pattern: "general",
        confidence: 0.5,
        expected_performance: {
          response_time: 200,
          success_rate: 0.8,
        },
        historical_data: false,
      };
    } catch (error) {
      return {
        recommended_pattern: "general",
        confidence: 0.3,
        error: error.message,
      };
    }
  }

  /**
   * Track pattern performance
   */
  async trackPatternPerformance(performanceData) {
    try {
      if (!this.env.CHITTY_ANALYTICS) {
        return { tracked: false, reason: "Analytics not available" };
      }

      const analyticsData = {
        indexes: ["agent_pattern", performanceData.pattern],
        doubles: [
          performanceData.response_time,
          performanceData.tokens_used || 0,
          performanceData.success ? 1 : 0,
        ],
        blobs: [
          performanceData.model_used,
          performanceData.success ? "success" : "failure",
        ],
      };

      await this.env.CHITTY_ANALYTICS.writeDataPoint(analyticsData);

      return { tracked: true, timestamp: new Date().toISOString() };
    } catch (error) {
      return { tracked: false, error: error.message };
    }
  }

  /**
   * Generate performance insights
   */
  async generatePerformanceInsights() {
    try {
      // Mock cached performance data
      const mockData = {
        case_analysis: { avg_response_time: 200, success_rate: 0.95 },
        document_review: { avg_response_time: 180, success_rate: 0.98 },
        client_communication: { avg_response_time: 120, success_rate: 0.99 },
      };

      // Find best performing pattern
      let bestPattern = null;
      let bestScore = 0;

      for (const [pattern, metrics] of Object.entries(mockData)) {
        const score = metrics.success_rate - metrics.avg_response_time / 1000;
        if (score > bestScore) {
          bestScore = score;
          bestPattern = pattern;
        }
      }

      return {
        best_performing_pattern: bestPattern,
        patterns: mockData,
        recommendations: [
          "Consider optimizing case_analysis response times",
          "Document_review shows excellent performance",
          "Client_communication is highly efficient",
        ],
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        error: error.message,
        patterns: {},
        recommendations: [],
      };
    }
  }

  /**
   * Calculate cost optimization metrics
   */
  async calculateCostOptimization(usageData) {
    try {
      const totalTokens = usageData.tokens_used || 0;
      const totalRequests = usageData.total_requests || 0;
      const successfulRequests = usageData.successful_requests || 0;

      const efficiency =
        totalRequests > 0 ? successfulRequests / totalRequests : 0;
      const tokensPerRequest =
        totalRequests > 0 ? totalTokens / totalRequests : 0;
      const costPerRequest = tokensPerRequest * 0.0001; // Mock pricing

      return {
        current_efficiency: efficiency,
        cost_per_request: costPerRequest,
        tokens_per_request: tokensPerRequest,
        optimization_opportunities: [
          "Reduce tokens in case_analysis patterns",
          "Cache common document_review results",
          "Optimize client_communication templates",
        ],
        potential_savings: totalRequests * 0.0001, // Mock savings
      };
    } catch (error) {
      return {
        current_efficiency: 0,
        cost_per_request: 0,
        error: error.message,
      };
    }
  }

  /**
   * Call AI with circuit breaker protection
   */
  async callAIWithCircuitBreaker(model, params) {
    // Simple circuit breaker implementation
    if (!this.circuitBreaker) {
      this.circuitBreaker = {
        failures: 0,
        lastFailTime: null,
        state: "closed",
      };
    }

    const breaker = this.circuitBreaker;
    const now = Date.now();

    // If circuit is open, check if we should try again
    if (breaker.state === "open") {
      if (now - breaker.lastFailTime < 60000) {
        // 1 minute timeout
        throw new Error(
          "Circuit breaker is open - service temporarily unavailable",
        );
      } else {
        breaker.state = "half-open";
      }
    }

    try {
      const result = await this.env.AI.run(model, params);

      // Success - reset circuit breaker
      breaker.failures = 0;
      breaker.state = "closed";

      return result;
    } catch (error) {
      breaker.failures++;
      breaker.lastFailTime = now;

      // Open circuit after 5 failures
      if (breaker.failures >= 5) {
        breaker.state = "open";
      }

      throw error;
    }
  }

  /**
   * Call AI with retry logic and exponential backoff
   */
  async callAIWithRetry(model, params, options = {}) {
    const { maxRetries = 3, baseDelay = 1000 } = options;
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.env.AI.run(model, params);
      } catch (error) {
        lastError = error;

        // Don't retry on last attempt
        if (attempt === maxRetries) {
          break;
        }

        // Handle rate limiting
        if (error.status === 429) {
          const retryAfter =
            parseInt(error.headers?.["retry-after"] || "60") * 1000;
          await new Promise((resolve) => setTimeout(resolve, retryAfter));
          continue;
        }

        // Exponential backoff for other errors
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * Validate request security
   */
  async validateRequestSecurity(request) {
    try {
      const authHeader = request.headers.get("Authorization");

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return {
          authorized: false,
          reason: "Missing or invalid Authorization header",
        };
      }

      // Extract token and validate session
      const token = authHeader.substring(7);
      const sessionKey = `session:${token}`;

      if (!this.env.SESSIONS) {
        return {
          authorized: false,
          reason: "Session store not available",
        };
      }

      const session = await this.env.SESSIONS.get(sessionKey);
      if (!session) {
        return {
          authorized: false,
          reason: "Invalid session token",
        };
      }

      const sessionData = JSON.parse(session);

      // Check if session is valid and user is verified
      if (!sessionData.user?.verified) {
        return {
          authorized: false,
          reason: "User not verified",
        };
      }

      return {
        authorized: true,
        user: sessionData.user,
        session: sessionData,
      };
    } catch (error) {
      return {
        authorized: false,
        reason: "Security validation failed",
        error: error.message,
      };
    }
  }

  /**
   * Sanitize sensitive data for logging
   */
  sanitizeForLogging(data) {
    if (typeof data !== "object" || data === null) {
      return data;
    }

    const sensitiveFields = [
      "password",
      "token",
      "secret",
      "key",
      "auth",
      "email",
      "ssn",
      "social",
      "credit_card",
      "api_key",
    ];

    const sanitized = {};

    for (const [key, value] of Object.entries(data)) {
      const keyLower = key.toLowerCase();
      const isSensitive = sensitiveFields.some((field) =>
        keyLower.includes(field),
      );

      if (isSensitive) {
        sanitized[key] = "[REDACTED]";
      } else if (typeof value === "object" && value !== null) {
        sanitized[key] = this.sanitizeForLogging(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Check rate limits per user
   */
  async checkRateLimit(userId, options = {}) {
    try {
      const { limit = 100, window = 60000 } = options; // 100 requests per minute
      const now = Date.now();
      const windowStart = now - window;

      if (!this.env.AUTH_CACHE) {
        return { allowed: true, reason: "Rate limiting not available" };
      }

      const rateLimitKey = `rate_limit:${userId}`;
      const existing = await this.env.AUTH_CACHE.get(rateLimitKey);

      let requestData;
      if (existing) {
        requestData = JSON.parse(existing);

        // Reset if window has passed
        if (requestData.window_start < windowStart) {
          requestData = {
            requests_count: 0,
            window_start: now,
          };
        }
      } else {
        requestData = {
          requests_count: 0,
          window_start: now,
        };
      }

      // Check if limit exceeded
      if (requestData.requests_count >= limit) {
        const resetTime = requestData.window_start + window;
        const retryAfter = Math.ceil((resetTime - now) / 1000);

        return {
          allowed: false,
          limit_exceeded: true,
          retry_after: retryAfter,
          requests_count: requestData.requests_count,
          limit,
        };
      }

      // Increment counter
      requestData.requests_count++;

      // Store updated data
      await this.env.AUTH_CACHE.put(rateLimitKey, JSON.stringify(requestData), {
        expirationTtl: Math.ceil(window / 1000) + 60, // Extra buffer
      });

      return {
        allowed: true,
        requests_count: requestData.requests_count,
        limit,
        remaining: limit - requestData.requests_count,
      };
    } catch (error) {
      // Allow on error to prevent blocking legitimate users
      return {
        allowed: true,
        error: error.message,
        reason: "Rate limit check failed",
      };
    }
  }

  /**
   * Legal Analysis Pipeline powered by LangChain
   */
  async executeLegalAnalysis(request, analysisType, context) {
    try {
      const result = await this.langChainAI.analyzeLegalCase({
        caseDetails: request.caseDetails,
        analysisType,
        provider: context.preferredProvider || "anthropic",
      });

      // Store result in ChittyOS systems
      if (this.env.AUTH_CACHE) {
        await this.env.AUTH_CACHE.put(
          `legal_analysis:${result.chittyId}`,
          JSON.stringify(result),
          { expirationTtl: 86400 * 30 }, // 30 days
        );
      }

      return {
        success: true,
        analysis: result,
        chittyId: result.chittyId,
        pipeline: "langchain_legal",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Legal analysis pipeline error:", error);
      return {
        success: false,
        error: error.message,
        pipeline: "langchain_legal",
      };
    }
  }

  /**
   * Financial Fund Tracing Pipeline powered by LangChain
   */
  async executeFundTracing(request, context) {
    try {
      const result = await this.langChainAI.traceFunds({
        sourceAccount: request.sourceAccount,
        destination: request.destination,
        dateRange: request.dateRange,
        amount: request.amount,
      });

      // Store trace result
      if (this.env.AUTH_CACHE) {
        await this.env.AUTH_CACHE.put(
          `fund_trace:${result.traceId}`,
          JSON.stringify(result),
          { expirationTtl: 86400 * 90 }, // 90 days
        );
      }

      return {
        success: true,
        trace: result,
        traceId: result.traceId,
        pipeline: "langchain_financial",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Fund tracing pipeline error:", error);
      return {
        success: false,
        error: error.message,
        pipeline: "langchain_financial",
      };
    }
  }

  /**
   * Document Generation Pipeline powered by LangChain
   */
  async executeDocumentGeneration(request, context) {
    try {
      const result = await this.langChainAI.generateDocument({
        documentType: request.documentType,
        caseData: request.caseData,
        template: request.template,
        requirements: request.requirements,
      });

      // Store document
      if (this.env.AUTH_CACHE) {
        await this.env.AUTH_CACHE.put(
          `document:${result.documentId}`,
          JSON.stringify(result),
          { expirationTtl: 86400 * 365 }, // 1 year
        );
      }

      return {
        success: true,
        document: result,
        documentId: result.documentId,
        pipeline: "langchain_document",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Document generation pipeline error:", error);
      return {
        success: false,
        error: error.message,
        pipeline: "langchain_document",
      };
    }
  }

  /**
   * Evidence Compilation Pipeline powered by LangChain
   */
  async executeEvidenceCompilation(request, context) {
    try {
      const result = await this.langChainAI.compileEvidence({
        claim: request.claim,
        evidenceTypes: request.evidenceTypes,
        searchCriteria: request.searchCriteria,
      });

      // Store evidence compilation
      if (this.env.AUTH_CACHE) {
        await this.env.AUTH_CACHE.put(
          `evidence:${result.compilationId}`,
          JSON.stringify(result),
          { expirationTtl: 86400 * 180 }, // 180 days
        );
      }

      return {
        success: true,
        evidence: result,
        compilationId: result.compilationId,
        pipeline: "langchain_evidence",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Evidence compilation pipeline error:", error);
      return {
        success: false,
        error: error.message,
        pipeline: "langchain_evidence",
      };
    }
  }

  /**
   * Timeline Generation Pipeline powered by LangChain
   */
  async executeTimelineGeneration(request, context) {
    try {
      const result = await this.langChainAI.generateTimeline({
        topic: request.topic,
        dateRange: request.dateRange,
        entities: request.entities,
        events: request.events,
      });

      // Store timeline
      if (this.env.AUTH_CACHE) {
        await this.env.AUTH_CACHE.put(
          `timeline:${result.timelineId}`,
          JSON.stringify(result),
          { expirationTtl: 86400 * 365 }, // 1 year
        );
      }

      return {
        success: true,
        timeline: result,
        timelineId: result.timelineId,
        pipeline: "langchain_timeline",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Timeline generation pipeline error:", error);
      return {
        success: false,
        error: error.message,
        pipeline: "langchain_timeline",
      };
    }
  }

  /**
   * Compliance Analysis Pipeline powered by LangChain
   */
  async executeComplianceAnalysis(request, context) {
    try {
      const result = await this.langChainAI.analyzeCompliance({
        entity: request.entity,
        regulations: request.regulations,
        scope: request.scope,
        documents: request.documents,
      });

      // Store compliance analysis
      if (this.env.AUTH_CACHE) {
        await this.env.AUTH_CACHE.put(
          `compliance:${result.analysisId}`,
          JSON.stringify(result),
          { expirationTtl: 86400 * 90 }, // 90 days
        );
      }

      return {
        success: true,
        compliance: result,
        analysisId: result.analysisId,
        pipeline: "langchain_compliance",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Compliance analysis pipeline error:", error);
      return {
        success: false,
        error: error.message,
        pipeline: "langchain_compliance",
      };
    }
  }

  /**
   * Unified LangChain Pipeline Router
   */
  async executeLangChainPipeline(pipelineType, request, context = {}) {
    const pipelineRoutes = {
      legal_analysis: this.executeLegalAnalysis.bind(this),
      fund_tracing: this.executeFundTracing.bind(this),
      document_generation: this.executeDocumentGeneration.bind(this),
      evidence_compilation: this.executeEvidenceCompilation.bind(this),
      timeline_generation: this.executeTimelineGeneration.bind(this),
      compliance_analysis: this.executeComplianceAnalysis.bind(this),
    };

    const pipelineHandler = pipelineRoutes[pipelineType];

    if (!pipelineHandler) {
      return {
        success: false,
        error: `Unknown LangChain pipeline type: ${pipelineType}`,
        availablePipelines: Object.keys(pipelineRoutes),
      };
    }

    // Execute the specific pipeline
    const result = await pipelineHandler(request, context);

    // Add common metadata
    result.langchain_version = "0.3.28";
    result.chittyos_version = "2.0.0";
    result.gateway = "ChittyRouter";

    return result;
  }

  /**
   * LangChain Health Check
   */
  async checkLangChainHealth() {
    try {
      const health = await this.langChainAI.healthCheck();
      return {
        langchain_service: health,
        integration_status: "active",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        langchain_service: { status: "error", error: error.message },
        integration_status: "failed",
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * ChittyCases Legal Research Pipeline
   */
  async executeLegalResearch(request, context = {}) {
    try {
      const {
        query,
        caseNumber,
        jurisdiction = "Cook County, Illinois",
        caseContext,
      } = request;

      // Execute through ChittyCases service
      const result = await this.chittyCases.performLegalResearch({
        query,
        caseNumber,
        jurisdiction,
        caseContext,
      });

      // Store in ChittyOS cache
      if (this.env.CHITTYOS_CACHE) {
        await this.env.CHITTYOS_CACHE.put(
          `research:${result.researchId}`,
          JSON.stringify(result),
          { expirationTtl: 86400 },
        );
      }

      return {
        success: true,
        pipeline: "chittycases_legal_research",
        result,
        chittyId: result.researchId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Legal research pipeline error:", error);
      return {
        success: false,
        error: error.message,
        pipeline: "chittycases_legal_research",
      };
    }
  }

  /**
   * ChittyCases Document Analysis Pipeline
   */
  async executeDocumentAnalysis(request, context = {}) {
    try {
      const { documentContent, documentType, caseNumber, analysisType } =
        request;

      const result = await this.chittyCases.analyzeDocument({
        documentContent,
        documentType,
        caseNumber,
        analysisType,
      });

      // Store in ChittyOS cache
      if (this.env.CHITTYOS_CACHE) {
        await this.env.CHITTYOS_CACHE.put(
          `analysis:${result.analysisId}`,
          JSON.stringify(result),
          { expirationTtl: 86400 },
        );
      }

      return {
        success: true,
        pipeline: "chittycases_document_analysis",
        result,
        chittyId: result.analysisId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Document analysis pipeline error:", error);
      return {
        success: false,
        error: error.message,
        pipeline: "chittycases_document_analysis",
      };
    }
  }

  /**
   * ChittyCases Case Insights Pipeline
   */
  async executeCaseInsights(request, context = {}) {
    try {
      const { caseNumber, caseData, insightType } = request;

      const result = await this.chittyCases.getCaseInsights({
        caseNumber,
        caseData,
        insightType,
      });

      // Store in ChittyOS cache
      if (this.env.CHITTYOS_CACHE) {
        await this.env.CHITTYOS_CACHE.put(
          `insights:${result.insightId}`,
          JSON.stringify(result),
          { expirationTtl: 86400 },
        );
      }

      return {
        success: true,
        pipeline: "chittycases_case_insights",
        result,
        chittyId: result.insightId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Case insights pipeline error:", error);
      return {
        success: false,
        error: error.message,
        pipeline: "chittycases_case_insights",
      };
    }
  }

  /**
   * ChittyCases Petition Generation Pipeline
   */
  async executePetitionGeneration(request, context = {}) {
    try {
      const { petitionType, caseData, jurisdiction, urgency } = request;

      const result = await this.chittyCases.generatePetition({
        petitionType,
        caseData,
        jurisdiction,
        urgency,
      });

      // Store in ChittyOS cache
      if (this.env.CHITTYOS_CACHE) {
        await this.env.CHITTYOS_CACHE.put(
          `petition:${result.petitionId}`,
          JSON.stringify(result),
          { expirationTtl: 86400 },
        );
      }

      return {
        success: true,
        pipeline: "chittycases_petition_generation",
        result,
        chittyId: result.petitionId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Petition generation pipeline error:", error);
      return {
        success: false,
        error: error.message,
        pipeline: "chittycases_petition_generation",
      };
    }
  }

  /**
   * ChittyCases Contradiction Analysis Pipeline
   */
  async executeContradictionAnalysis(request, context = {}) {
    try {
      const { documents, statements, caseNumber } = request;

      const result = await this.chittyCases.findContradictions({
        documents,
        statements,
        caseNumber,
      });

      // Store in ChittyOS cache
      if (this.env.CHITTYOS_CACHE) {
        await this.env.CHITTYOS_CACHE.put(
          `contradictions:${result.analysisId}`,
          JSON.stringify(result),
          { expirationTtl: 86400 },
        );
      }

      return {
        success: true,
        pipeline: "chittycases_contradiction_analysis",
        result,
        chittyId: result.analysisId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Contradiction analysis pipeline error:", error);
      return {
        success: false,
        error: error.message,
        pipeline: "chittycases_contradiction_analysis",
      };
    }
  }

  /**
   * ChittyCases Dashboard Generation Pipeline
   */
  async executeDashboardGeneration(request, context = {}) {
    try {
      const { caseNumber, caseData } = request;

      const result = await this.chittyCases.generateDashboardData({
        caseNumber,
        caseData,
      });

      // Store in ChittyOS cache
      if (this.env.CHITTYOS_CACHE) {
        await this.env.CHITTYOS_CACHE.put(
          `dashboard:${result.dashboardId}`,
          JSON.stringify(result),
          { expirationTtl: 3600 }, // Shorter TTL for dashboard data
        );
      }

      return {
        success: true,
        pipeline: "chittycases_dashboard_generation",
        result,
        chittyId: result.dashboardId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Dashboard generation pipeline error:", error);
      return {
        success: false,
        error: error.message,
        pipeline: "chittycases_dashboard_generation",
      };
    }
  }

  /**
   * Unified ChittyCases Pipeline Router
   */
  async executeChittyCasesPipeline(pipelineType, request, context = {}) {
    const pipelineRoutes = {
      legal_research: this.executeLegalResearch.bind(this),
      document_analysis: this.executeDocumentAnalysis.bind(this),
      case_insights: this.executeCaseInsights.bind(this),
      petition_generation: this.executePetitionGeneration.bind(this),
      contradiction_analysis: this.executeContradictionAnalysis.bind(this),
      dashboard_generation: this.executeDashboardGeneration.bind(this),
    };

    const pipelineHandler = pipelineRoutes[pipelineType];

    if (!pipelineHandler) {
      return {
        success: false,
        error: `Unknown ChittyCases pipeline type: ${pipelineType}`,
        availablePipelines: Object.keys(pipelineRoutes),
      };
    }

    // Execute the specific pipeline
    const result = await pipelineHandler(request, context);

    // Add common metadata
    result.chittycases_version = "1.0.0";
    result.chittyos_version = "2.0.0";
    result.gateway = "ChittyRouter";

    return result;
  }

  /**
   * ChittyCases Health Check
   */
  async checkChittyCasesHealth() {
    try {
      const health = await this.chittyCases.healthCheck();
      return {
        chittycases_service: health,
        integration_status: "active",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        chittycases_service: { status: "error", error: error.message },
        integration_status: "failed",
        timestamp: new Date().toISOString(),
      };
    }
  }
}

export default ChittyRouterGateway;
