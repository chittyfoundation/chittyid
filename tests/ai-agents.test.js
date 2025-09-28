/**
 * AI Agents Integration Tests
 * Tests for all ChittyID AI agent functionalities
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ValidatorAgent } from "../src/agents/validator.js";
import { SecurityAgent } from "../src/agents/security.js";
import { RoutingAgent } from "../src/agents/routing.js";
import { PerformanceAgent } from "../src/agents/performance.js";
import { DeduplicationAgent } from "../src/agents/deduplication.js";
import { VersioningAgent } from "../src/agents/versioning.js";

describe("AI Agents Integration", () => {
  let mockEnv;

  beforeEach(() => {
    mockEnv = {
      AI: {
        run: vi.fn(),
      },
      CHITTY_VECTORS: {
        query: vi.fn(),
        upsert: vi.fn(),
      },
      CHITTY_IDS: {
        get: vi.fn(),
        put: vi.fn(),
        list: vi.fn(),
      },
      AUTH_CACHE: {
        get: vi.fn(),
        put: vi.fn(),
      },
      CHITTY_ANALYTICS: {
        writeDataPoint: vi.fn(),
      },
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Validator Agent", () => {
    let validator;

    beforeEach(() => {
      validator = new ValidatorAgent(mockEnv);
    });

    it("should validate ChittyID format with AI assistance", async () => {
      const chittyId = "03-1-USA-0001-P-251-3-15";

      // Mock AI response for validation
      mockEnv.AI.run.mockResolvedValue({
        response: JSON.stringify({
          valid: true,
          format_check: "passed",
          checksum_valid: true,
          trust_level_appropriate: true,
          confidence: 0.98,
        }),
      });

      const result = await validator.validateWithAI(chittyId, {
        purpose: "person",
        context: "identity verification",
      });

      expect(result.valid).toBe(true);
      expect(result.confidence).toBe(0.98);
      expect(result.ai_validation).toBe(true);

      expect(mockEnv.AI.run).toHaveBeenCalledWith(
        "@cf/meta/llama-3.1-8b-instruct",
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: "user",
              content: expect.stringContaining(
                "ChittyID: 03-1-USA-0001-P-251-3-15",
              ),
            }),
          ]),
        }),
      );
    });

    it("should detect format anomalies", async () => {
      const invalidId = "03-1-USA-0001-P-251-9-99"; // Invalid trust level 9

      mockEnv.AI.run.mockResolvedValue({
        response: JSON.stringify({
          valid: false,
          format_check: "failed",
          errors: ["Invalid trust level: 9 exceeds maximum 5"],
          confidence: 0.95,
        }),
      });

      const result = await validator.validateWithAI(invalidId, {});

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Invalid trust level: 9 exceeds maximum 5",
      );
    });

    it("should validate checksum with high precision", async () => {
      const result = await validator.validateChecksum(
        "03-1-USA-0001-P-251-3-15",
      );

      expect(result).toHaveProperty("valid");
      expect(result).toHaveProperty("expected");
      expect(result).toHaveProperty("calculated");
      expect(typeof result.valid).toBe("boolean");
    });

    it("should analyze trust level consistency", async () => {
      mockEnv.AI.run.mockResolvedValue({
        response: JSON.stringify({
          trust_analysis: {
            level_appropriate: true,
            context_match: 0.9,
            recommendations: [],
          },
        }),
      });

      const result = await validator.analyzeTrustLevel("3", {
        purpose: "verified_document",
        user_verification: "L3",
      });

      expect(result.level_appropriate).toBe(true);
      expect(result.context_match).toBe(0.9);
    });
  });

  describe("Security Agent", () => {
    let security;

    beforeEach(() => {
      security = new SecurityAgent(mockEnv);
    });

    it("should analyze request security with AI", async () => {
      const request = new Request("https://id.chitty.cc/api/get-chittyid", {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          "X-Forwarded-For": "192.168.1.1",
          Authorization: "Bearer valid-token",
        },
      });

      mockEnv.AI.run.mockResolvedValue({
        response: JSON.stringify({
          threat_level: "low",
          risk_score: 0.1,
          indicators: [],
          recommendations: ["monitor_usage"],
        }),
      });

      const result = await security.analyzeRequest(request);

      expect(result.threat_level).toBe("low");
      expect(result.risk_score).toBe(0.1);
      expect(result.safe).toBe(true);
    });

    it("should detect suspicious patterns", async () => {
      mockEnv.AI.run.mockResolvedValue({
        response: JSON.stringify({
          threat_level: "high",
          risk_score: 0.8,
          indicators: ["rapid_requests", "unusual_headers"],
          blocked: true,
        }),
      });

      const result = await security.analyzeRequest(
        new Request("https://test.com"),
      );

      expect(result.threat_level).toBe("high");
      expect(result.blocked).toBe(true);
      expect(result.indicators).toContain("rapid_requests");
    });

    it("should validate JWT tokens", async () => {
      const token =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMTIzIiwiaWF0IjoxNjA5NDU5MjAwfQ.example";

      const result = await security.validateJWT(token);

      expect(result).toHaveProperty("valid");
      expect(result).toHaveProperty("payload");
      expect(result).toHaveProperty("expired");
    });

    it("should track and analyze abuse patterns", async () => {
      // Mock previous attempts data
      mockEnv.AUTH_CACHE.get.mockResolvedValue(
        JSON.stringify({
          attempts: 15,
          last_attempt: new Date(Date.now() - 1000).toISOString(),
          pattern_score: 0.7,
        }),
      );

      const result = await security.trackAbuse(
        "192.168.1.1",
        "multiple_requests",
      );

      expect(result.flagged).toBeDefined();
      expect(result.score).toBeGreaterThan(0);

      // Should update cache with new data
      expect(mockEnv.AUTH_CACHE.put).toHaveBeenCalled();
    });
  });

  describe("Routing Agent", () => {
    let routing;

    beforeEach(() => {
      routing = new RoutingAgent(mockEnv);
    });

    it("should optimize request routing with AI", async () => {
      const request = new Request("https://id.chitty.cc/api/get-chittyid", {
        headers: {
          "CF-IPCountry": "US",
          "CF-Ray": "test-ray-id",
        },
      });

      // Mock AI routing analysis
      mockEnv.AI.run.mockResolvedValue({
        response: JSON.stringify({
          optimal_path: "direct",
          priority: "high",
          estimated_latency: 150,
          confidence: 0.92,
        }),
      });

      const result = await routing.optimizeRoute(request, {
        purpose: "urgent_verification",
        user_tier: "premium",
      });

      expect(result.path).toBe("direct");
      expect(result.priority).toBe("high");
      expect(result.estimated_latency).toBe(150);
    });

    it("should handle load balancing decisions", async () => {
      // Mock service health data
      mockEnv.AUTH_CACHE.get.mockResolvedValue(
        JSON.stringify({
          chittyauth: { healthy: true, load: 0.3 },
          chittyverify: { healthy: true, load: 0.8 },
          chittytrust: { healthy: false, load: 0.9 },
        }),
      );

      const result = await routing.selectService([
        "chittyauth",
        "chittyverify",
        "chittytrust",
      ]);

      expect(result.selected).toBe("chittyauth"); // Lowest load
      expect(result.reason).toContain("load");
    });

    it("should create vector embeddings for routing optimization", async () => {
      // Mock embedding response
      mockEnv.AI.run.mockResolvedValue({
        data: [[0.1, 0.2, 0.3, 0.4]],
      });

      const requestData = {
        path: "/api/get-chittyid",
        method: "GET",
        purpose: "verification",
        region: "US",
      };

      const result = await routing.createRequestEmbedding(requestData);

      expect(result.embedding).toHaveLength(4);
      expect(result.embedding[0]).toBe(0.1);

      // Should store in vector database
      expect(mockEnv.CHITTY_VECTORS.upsert).toHaveBeenCalledWith([
        {
          id: expect.any(String),
          values: [0.1, 0.2, 0.3, 0.4],
          metadata: expect.objectContaining({
            path: "/api/get-chittyid",
          }),
        },
      ]);
    });
  });

  describe("Performance Agent", () => {
    let performance;

    beforeEach(() => {
      performance = new PerformanceAgent(mockEnv);
    });

    it("should analyze system performance metrics", async () => {
      // Mock performance data in cache
      mockEnv.AUTH_CACHE.get
        .mockResolvedValueOnce(JSON.stringify({ average: 180 })) // latency
        .mockResolvedValueOnce(JSON.stringify({ rate: 85 })) // cache hits
        .mockResolvedValueOnce(JSON.stringify({ rps: 350 })) // throughput
        .mockResolvedValueOnce(JSON.stringify({ rate: 2 })); // error rate

      // Mock AI analysis response
      mockEnv.AI.run.mockResolvedValue({
        response: JSON.stringify({
          health_score: 85,
          bottlenecks: ["database_queries", "cache_misses"],
          recommendations: ["Optimize database indexes", "Increase cache TTL"],
          priority: "medium",
        }),
      });

      const result = await performance.analyzeMetrics();

      expect(result.health_score).toBeGreaterThan(0);
      expect(result.recommendations).toBeDefined();
      expect(result.metrics).toHaveProperty("latency");
      expect(result.metrics).toHaveProperty("cache_hit_rate");
      expect(result.metrics).toHaveProperty("throughput");
      expect(result.metrics).toHaveProperty("error_rate");
    });

    it("should detect performance bottlenecks", async () => {
      mockEnv.AI.run.mockResolvedValue({
        response: JSON.stringify({
          bottlenecks: ["database_queries", "ai_processing"],
          severity: { database_queries: "medium", ai_processing: "high" },
          recommendations: ["query_caching", "batch_processing"],
        }),
      });

      const metrics = {
        response_times: [500, 800, 1200, 900],
        error_rate: 0.05,
        throughput: 50,
      };

      const result = await performance.detectBottlenecks(metrics);

      expect(result.bottlenecks).toContain("database_queries");
      expect(result.severity).toHaveProperty("database_queries", "medium");
      expect(result.recommendations).toContain("query_caching");
    });

    it("should optimize resource allocation", async () => {
      const current_allocation = {
        cpu: 50,
        memory: 128,
        connections: 10,
        cache_size: 64,
      };

      // Mock AI optimization response
      mockEnv.AI.run.mockResolvedValue({
        response: JSON.stringify({
          cpu: 75,
          memory: 256,
          connections: 20,
          cache_size: 128,
          estimated_performance: {
            latency: 180,
            throughput: 1500,
          },
        }),
      });

      const result = await performance.optimizeAllocation(current_allocation, {
        target_latency: 200,
        expected_load: "high",
      });

      expect(result.optimized_allocation).toBeDefined();
      expect(result.estimated_performance).toBeDefined();
      expect(result.optimized_allocation.cpu).toBeGreaterThan(
        current_allocation.cpu,
      );
      expect(result.estimated_performance.latency).toBe(180);
    });
  });

  describe("Deduplication Agent", () => {
    let dedup;

    beforeEach(() => {
      dedup = new DeduplicationAgent(mockEnv);
    });

    it("should detect exact duplicates", async () => {
      const chittyId = "03-1-USA-0001-P-251-3-15";

      // Mock existing ID
      mockEnv.CHITTY_IDS.get.mockResolvedValue(
        JSON.stringify({
          id: chittyId,
          created: "2023-10-01T12:00:00Z",
          purpose: "person",
        }),
      );

      const result = await dedup.checkExactMatch(chittyId);

      expect(result.duplicate).toBe(true);
      expect(result.strategy).toBe("exact_match");
      expect(result.existing_id).toBe(chittyId);
    });

    it("should detect sequential duplicates", async () => {
      const newRequest = {
        region: "1",
        jurisdiction: "USA",
        entityType: "P",
        purpose: "person",
      };

      // Mock recent IDs
      mockEnv.CHITTY_IDS.list.mockResolvedValue({
        keys: [
          { name: "03-1-USA-0001-P-251-3-15" },
          { name: "03-1-USA-0002-P-251-3-47" },
          { name: "03-1-USA-0003-P-251-3-79" },
        ],
      });

      const result = await dedup.checkSequentialDuplicate(newRequest);

      expect(result.sequential_pattern).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it("should perform semantic similarity detection", async () => {
      // Mock vector search results
      mockEnv.CHITTY_VECTORS.query.mockResolvedValue({
        matches: [
          {
            id: "03-1-USA-0001-P-251-3-15",
            score: 0.95,
            metadata: { purpose: "person_verification" },
          },
        ],
      });

      const requestEmbedding = new Array(384).fill(0.1);

      const result = await dedup.checkSemanticSimilarity(requestEmbedding, {
        purpose: "person_identity",
        context: "verification",
      });

      expect(result.similar).toBe(true);
      expect(result.confidence).toBe(0.95);
      expect(result.strategy).toBe("semantic_similarity");
    });

    it("should detect checksum collisions", async () => {
      const checksum = "15";

      // Mock IDs with same checksum
      mockEnv.CHITTY_IDS.list.mockResolvedValue({
        keys: [
          { name: "03-1-USA-0001-P-251-3-15" },
          { name: "03-2-CAN-0005-L-252-4-15" },
        ],
      });

      const result = await dedup.checkChecksumCollision(checksum, {
        exclude_same_sequential: true,
      });

      expect(result.collision_detected).toBeDefined();
      expect(result.colliding_ids).toBeDefined();
    });

    it("should analyze temporal proximity", async () => {
      const userId = "user123";
      const timeWindow = 300000; // 5 minutes

      // Mock recent requests
      mockEnv.AUTH_CACHE.get.mockResolvedValue(
        JSON.stringify([
          {
            id: "03-1-USA-0001-P-251-3-15",
            timestamp: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
            purpose: "person",
          },
        ]),
      );

      const result = await dedup.checkTemporalProximity(userId, {
        purpose: "person",
        timeWindow,
      });

      expect(result.recent_duplicate).toBe(true);
      expect(result.time_since_last).toBeLessThan(timeWindow);
    });

    it("should provide comprehensive deduplication analysis", async () => {
      // Mock all deduplication checks
      vi.spyOn(dedup, "checkExactMatch").mockResolvedValue({
        duplicate: false,
      });
      vi.spyOn(dedup, "checkSequentialDuplicate").mockResolvedValue({
        sequential_pattern: false,
        confidence: 0.1,
      });
      vi.spyOn(dedup, "checkSemanticSimilarity").mockResolvedValue({
        similar: false,
        confidence: 0.3,
      });
      vi.spyOn(dedup, "checkChecksumCollision").mockResolvedValue({
        collision_detected: false,
      });
      vi.spyOn(dedup, "checkTemporalProximity").mockResolvedValue({
        recent_duplicate: false,
      });

      const request = {
        chittyId: "03-1-USA-0001-P-251-3-15",
        userId: "user123",
        purpose: "person",
        embedding: new Array(384).fill(0.1),
      };

      const result = await dedup.analyzeRequest(request);

      expect(result.is_duplicate).toBe(false);
      expect(result.strategies_checked).toHaveLength(5);
      expect(result.confidence_score).toBeDefined();
      expect(result.recommendations).toBeDefined();
    });
  });

  describe("Versioning Agent", () => {
    let versioning;

    beforeEach(() => {
      versioning = new VersioningAgent(mockEnv);
    });

    it("should validate version compatibility", async () => {
      const result = await versioning.validateVersion("03", {
        target_version: "04",
        operation: "upgrade",
      });

      expect(result.compatible).toBeDefined();
      expect(result.migration_path).toBeDefined();
      expect(result.warnings).toBeDefined();
    });

    it("should generate migration plan", async () => {
      const legacyId = "01-1-USA-0001-P-25-3-15"; // v01 format

      const result = await versioning.generateMigrationPlan(legacyId, "03");

      expect(result.migration_plan).toBeDefined();
      expect(result.steps).toBeDefined();
      expect(result.estimated_duration).toBeDefined();
      expect(result.risk_level).toBeDefined();
    });

    it("should perform version upgrade", async () => {
      const oldId = "02-1-USA-0001-P-25-3-15";

      // Mock AI upgrade assistance
      mockEnv.AI.run.mockResolvedValue({
        response: JSON.stringify({
          upgraded_id: "03-1-USA-0001-P-251-3-15",
          changes: ["year_month_format", "checksum_algorithm"],
          success: true,
        }),
      });

      const result = await versioning.upgradeVersion(oldId, "03");

      expect(result.success).toBe(true);
      expect(result.new_id).toBe("03-1-USA-0001-P-251-3-15");
      expect(result.changes).toContain("year_month_format");
    });

    it("should handle deprecation warnings", async () => {
      const result = await versioning.checkDeprecation("01");

      expect(result.deprecated).toBe(true);
      expect(result.end_of_life).toBeDefined();
      expect(result.recommended_action).toBeDefined();
    });

    it("should validate cross-version compatibility", async () => {
      const ids = [
        "01-1-USA-0001-P-25-3-15",
        "02-1-USA-0002-P-25-3-47",
        "03-1-USA-0003-P-251-3-79",
      ];

      const result = await versioning.validateCrossCompatibility(ids);

      expect(result.compatible).toBeDefined();
      expect(result.conflicts).toBeDefined();
      expect(result.recommended_versions).toBeDefined();
    });
  });

  describe("Agent Coordination", () => {
    it("should coordinate multiple agents for comprehensive analysis", async () => {
      const validator = new ValidatorAgent(mockEnv);
      const security = new SecurityAgent(mockEnv);
      const dedup = new DeduplicationAgent(mockEnv);

      // Mock agent responses
      vi.spyOn(validator, "validateWithAI").mockResolvedValue({
        valid: true,
        confidence: 0.95,
      });
      vi.spyOn(security, "analyzeRequest").mockResolvedValue({
        safe: true,
        risk_score: 0.1,
      });
      vi.spyOn(dedup, "analyzeRequest").mockResolvedValue({
        is_duplicate: false,
        confidence_score: 0.9,
      });

      const request = new Request("https://id.chitty.cc/api/get-chittyid");
      const chittyId = "03-1-USA-0001-P-251-3-15";

      // Coordinate all agents
      const [validationResult, securityResult, dedupResult] = await Promise.all(
        [
          validator.validateWithAI(chittyId, {}),
          security.analyzeRequest(request),
          dedup.analyzeRequest({ chittyId, userId: "user123" }),
        ],
      );

      expect(validationResult.valid).toBe(true);
      expect(securityResult.safe).toBe(true);
      expect(dedupResult.is_duplicate).toBe(false);

      // All agents should have been called
      expect(validator.validateWithAI).toHaveBeenCalled();
      expect(security.analyzeRequest).toHaveBeenCalled();
      expect(dedup.analyzeRequest).toHaveBeenCalled();
    });

    it("should handle agent failures gracefully", async () => {
      const validator = new ValidatorAgent(mockEnv);

      // Mock AI failure
      mockEnv.AI.run.mockRejectedValue(new Error("AI service unavailable"));

      const result = await validator.validateWithAI(
        "03-1-USA-0001-P-251-3-15",
        {},
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain("AI service unavailable");
      expect(result.fallback_used).toBe(true);
    });
  });

  describe("Analytics Integration", () => {
    it("should track agent performance metrics", async () => {
      const validator = new ValidatorAgent(mockEnv);

      await validator.validateWithAI("03-1-USA-0001-P-251-3-15", {});

      // Should log analytics
      expect(mockEnv.CHITTY_ANALYTICS.writeDataPoint).toHaveBeenCalledWith({
        indexes: ["agent_validator", "validation_request"],
        doubles: [expect.any(Number), expect.any(Number)],
        blobs: ["ai_validation", "success"],
      });
    });
  });
});
