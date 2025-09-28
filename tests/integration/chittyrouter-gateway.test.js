/**
 * ChittyRouter AI Gateway Integration Tests
 * Tests for comprehensive AI gateway integration with ChittyID
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChittyRouterGateway } from '../../src/integrations/chittyrouter-gateway.js';

describe('ChittyRouter AI Gateway Integration', () => {
  let gateway;
  let mockEnv;

  beforeEach(() => {
    global.fetch = vi.fn();

    mockEnv = {
      AI: {
        run: vi.fn()
      },
      CHITTY_VECTORS: {
        query: vi.fn(),
        upsert: vi.fn()
      },
      SESSIONS: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn()
      },
      AUTH_CACHE: {
        get: vi.fn(),
        put: vi.fn()
      },
      CHITTY_IDS: {
        get: vi.fn(),
        put: vi.fn()
      },
      CHITTY_ANALYTICS: {
        writeDataPoint: vi.fn()
      }
    };

    gateway = new ChittyRouterGateway(mockEnv);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Agent Pattern Recognition', () => {
    it('should identify case_analysis pattern', async () => {
      const request = {
        purpose: 'legal_case_review',
        context: 'litigation_support',
        metadata: {
          case_type: 'contract_dispute',
          urgency: 'high'
        }
      };

      const pattern = await gateway.identifyAgentPattern(request);

      expect(pattern.pattern).toBe('case_analysis');
      expect(pattern.confidence).toBeGreaterThan(0.8);
      expect(pattern.reasoning).toContain('litigation_support');
    });

    it('should identify document_review pattern', async () => {
      const request = {
        purpose: 'document_verification',
        context: 'evidence_processing',
        metadata: {
          document_type: 'contract',
          review_type: 'authenticity'
        }
      };

      const pattern = await gateway.identifyAgentPattern(request);

      expect(pattern.pattern).toBe('document_review');
      expect(pattern.confidence).toBeGreaterThan(0.8);
    });

    it('should identify client_communication pattern', async () => {
      const request = {
        purpose: 'client_update',
        context: 'status_communication',
        metadata: {
          communication_type: 'progress_report',
          client_tier: 'premium'
        }
      };

      const pattern = await gateway.identifyAgentPattern(request);

      expect(pattern.pattern).toBe('client_communication');
      expect(pattern.confidence).toBeGreaterThan(0.8);
    });

    it('should identify court_preparation pattern', async () => {
      const request = {
        purpose: 'court_filing',
        context: 'hearing_preparation',
        metadata: {
          court_type: 'federal',
          filing_deadline: '2023-10-15'
        }
      };

      const pattern = await gateway.identifyAgentPattern(request);

      expect(pattern.pattern).toBe('court_preparation');
      expect(pattern.confidence).toBeGreaterThan(0.8);
    });

    it('should identify evidence_processing pattern', async () => {
      const request = {
        purpose: 'evidence_analysis',
        context: 'forensic_review',
        metadata: {
          evidence_type: 'financial_records',
          classification: 'confidential'
        }
      };

      const pattern = await gateway.identifyAgentPattern(request);

      expect(pattern.pattern).toBe('evidence_processing');
      expect(pattern.confidence).toBeGreaterThan(0.8);
    });

    it('should identify intake_processing pattern', async () => {
      const request = {
        purpose: 'new_client_intake',
        context: 'initial_consultation',
        metadata: {
          consultation_type: 'personal_injury',
          referral_source: 'web'
        }
      };

      const pattern = await gateway.identifyAgentPattern(request);

      expect(pattern.pattern).toBe('intake_processing');
      expect(pattern.confidence).toBeGreaterThan(0.8);
    });

    it('should fallback to general pattern for ambiguous requests', async () => {
      const request = {
        purpose: 'general_inquiry',
        context: 'unknown'
      };

      const pattern = await gateway.identifyAgentPattern(request);

      expect(pattern.pattern).toBe('general');
      expect(pattern.confidence).toBeLessThan(0.7);
    });
  });

  describe('AI Model Selection', () => {
    it('should select appropriate model for validation tasks', async () => {
      const task = {
        type: 'validation',
        complexity: 'medium',
        context: 'chittyid_verification'
      };

      const model = await gateway.selectAIModel(task);

      expect(model.model).toBe('@cf/meta/llama-3.1-8b-instruct');
      expect(model.reasoning).toContain('validation');
    });

    it('should select embedding model for similarity tasks', async () => {
      const task = {
        type: 'embedding',
        purpose: 'similarity_search',
        context: 'routing_optimization'
      };

      const model = await gateway.selectAIModel(task);

      expect(model.model).toBe('@cf/baai/bge-base-en-v1.5');
      expect(model.reasoning).toContain('embedding');
    });

    it('should select routing model for decision tasks', async () => {
      const task = {
        type: 'routing',
        complexity: 'high',
        context: 'service_selection'
      };

      const model = await gateway.selectAIModel(task);

      expect(model.model).toBe('@cf/meta/llama-3.1-8b-instruct');
      expect(model.reasoning).toContain('routing');
    });
  });

  describe('Pipeline Integration', () => {
    it('should execute complete ChittyID generation pipeline', async () => {
      const request = new Request('https://id.chitty.cc/api/get-chittyid', {
        headers: {
          'Authorization': 'Bearer test-token',
          'Content-Type': 'application/json'
        },
        method: 'POST',
        body: JSON.stringify({
          purpose: 'person',
          context: 'identity_verification'
        })
      });

      // Mock successful session
      mockEnv.SESSIONS.get.mockResolvedValue(JSON.stringify({
        user: { id: 'user123', verified: true },
        project: { id: 'proj456', registered: true, permissions: ['generate_id'] }
      }));

      // Mock AI responses
      mockEnv.AI.run
        .mockResolvedValueOnce({
          response: JSON.stringify({
            pattern: 'intake_processing',
            confidence: 0.9,
            routing_decision: 'proceed'
          })
        })
        .mockResolvedValueOnce({
          response: JSON.stringify({
            validation_passed: true,
            trust_level: 3,
            security_cleared: true
          })
        });

      // Mock external service call to id.chitty.cc
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          chittyId: '03-1-USA-0001-P-251-3-15',
          metadata: {
            purpose: 'person',
            generated_at: '2023-10-01T12:00:00Z'
          }
        })
      });

      const result = await gateway.generateChittyIDPipeline(request, 'person', mockEnv);

      expect(result.success).toBe(true);
      expect(result.chittyId).toBe('03-1-USA-0001-P-251-3-15');
      expect(result.agent_pattern).toBe('intake_processing');
      expect(result.ai_models_used).toContain('@cf/meta/llama-3.1-8b-instruct');

      // Verify external service call
      expect(global.fetch).toHaveBeenCalledWith(
        'https://id.chitty.cc/api/generate',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token'
          })
        })
      );
    });

    it('should handle authentication failures in pipeline', async () => {
      const request = new Request('https://id.chitty.cc/api/get-chittyid');

      mockEnv.SESSIONS.get.mockResolvedValue(null);

      const result = await gateway.generateChittyIDPipeline(request, 'person', mockEnv);

      expect(result.success).toBe(false);
      expect(result.error).toContain('authentication');
      expect(result.stage).toBe('router');
    });

    it('should handle AI model failures gracefully', async () => {
      const request = new Request('https://id.chitty.cc/api/get-chittyid', {
        headers: { 'Authorization': 'Bearer test-token' }
      });

      mockEnv.SESSIONS.get.mockResolvedValue(JSON.stringify({
        user: { id: 'user123', verified: true },
        project: { id: 'proj456', registered: true }
      }));

      // Mock AI failure
      mockEnv.AI.run.mockRejectedValue(new Error('AI service unavailable'));

      const result = await gateway.generateChittyIDPipeline(request, 'person', mockEnv);

      expect(result.success).toBe(false);
      expect(result.error).toContain('AI service unavailable');
      expect(result.fallback_used).toBe(true);
    });

    it('should handle id.chitty.cc service failures', async () => {
      const request = new Request('https://id.chitty.cc/api/get-chittyid', {
        headers: { 'Authorization': 'Bearer test-token' }
      });

      mockEnv.SESSIONS.get.mockResolvedValue(JSON.stringify({
        user: { id: 'user123', verified: true },
        project: { id: 'proj456', registered: true }
      }));

      mockEnv.AI.run.mockResolvedValue({
        response: JSON.stringify({ routing_decision: 'proceed' })
      });

      // Mock service failure
      global.fetch.mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable'
      });

      const result = await gateway.generateChittyIDPipeline(request, 'person', mockEnv);

      expect(result.success).toBe(false);
      expect(result.error).toContain('ID generation service failed');
      expect(result.external_service_error).toBe(true);
    });
  });

  describe('LLC Processing Workflows', () => {
    it('should handle Wyoming LLC formation workflow', async () => {
      const request = new Request('https://id.chitty.cc/api/get-chittyid', {
        method: 'POST',
        body: JSON.stringify({
          purpose: 'llc_formation',
          context: 'wyoming_incorporation',
          metadata: {
            entity_name: 'Test LLC',
            formation_state: 'Wyoming',
            business_type: 'technology'
          }
        })
      });

      // Mock AI workflow analysis
      mockEnv.AI.run.mockResolvedValue({
        response: JSON.stringify({
          workflow: 'llc_formation',
          state_compliance: 'wyoming',
          steps_required: [
            'name_availability_check',
            'registered_agent_assignment',
            'articles_filing',
            'operating_agreement'
          ],
          estimated_timeline: '7-10_business_days'
        })
      });

      const result = await gateway.processLLCWorkflow(request);

      expect(result.success).toBe(true);
      expect(result.workflow).toBe('llc_formation');
      expect(result.state_compliance).toBe('wyoming');
      expect(result.steps_required).toContain('name_availability_check');
      expect(result.estimated_timeline).toBe('7-10_business_days');
    });

    it('should validate LLC formation requirements', async () => {
      const llcData = {
        entity_name: 'Innovation Tech LLC',
        formation_state: 'Wyoming',
        registered_agent: {
          name: 'John Doe',
          address: '123 Main St, Cheyenne, WY 82001'
        },
        business_purpose: 'Technology consulting services'
      };

      mockEnv.AI.run.mockResolvedValue({
        response: JSON.stringify({
          validation_passed: true,
          name_available: true,
          compliance_score: 0.95,
          requirements_met: [
            'unique_name',
            'llc_designation',
            'registered_agent',
            'business_purpose'
          ],
          warnings: []
        })
      });

      const result = await gateway.validateLLCRequirements(llcData);

      expect(result.validation_passed).toBe(true);
      expect(result.name_available).toBe(true);
      expect(result.compliance_score).toBe(0.95);
      expect(result.requirements_met).toContain('unique_name');
    });

    it('should handle LLC formation errors', async () => {
      const llcData = {
        entity_name: 'Test Inc', // Invalid - LLC must contain "LLC"
        formation_state: 'Wyoming'
      };

      mockEnv.AI.run.mockResolvedValue({
        response: JSON.stringify({
          validation_passed: false,
          errors: [
            'Entity name must contain "LLC" designation',
            'Missing registered agent information'
          ],
          compliance_score: 0.3
        })
      });

      const result = await gateway.validateLLCRequirements(llcData);

      expect(result.validation_passed).toBe(false);
      expect(result.errors).toContain('Entity name must contain "LLC" designation');
      expect(result.compliance_score).toBe(0.3);
    });
  });

  describe('Vector Embeddings and Routing', () => {
    it('should create embeddings for routing optimization', async () => {
      const requestData = {
        purpose: 'document_verification',
        context: 'legal_review',
        metadata: {
          document_type: 'contract',
          urgency: 'high'
        }
      };

      // Mock embedding response
      mockEnv.AI.run.mockResolvedValue({
        data: [Array(384).fill(0).map(() => Math.random())]
      });

      const result = await gateway.createRoutingEmbedding(requestData);

      expect(result.embedding).toHaveLength(384);
      expect(result.metadata).toHaveProperty('purpose', 'document_verification');

      // Should store in vector database
      expect(mockEnv.CHITTY_VECTORS.upsert).toHaveBeenCalledWith([{
        id: expect.any(String),
        values: expect.any(Array),
        metadata: expect.objectContaining({
          purpose: 'document_verification'
        })
      }]);
    });

    it('should find similar routing patterns', async () => {
      const queryEmbedding = Array(384).fill(0.1);

      // Mock vector search results
      mockEnv.CHITTY_VECTORS.query.mockResolvedValue({
        matches: [
          {
            id: 'route-123',
            score: 0.92,
            metadata: {
              purpose: 'document_verification',
              pattern: 'document_review',
              success_rate: 0.95
            }
          },
          {
            id: 'route-456',
            score: 0.87,
            metadata: {
              purpose: 'evidence_analysis',
              pattern: 'evidence_processing',
              success_rate: 0.88
            }
          }
        ]
      });

      const result = await gateway.findSimilarRoutingPatterns(queryEmbedding, {
        topK: 5,
        threshold: 0.8
      });

      expect(result.similar_patterns).toHaveLength(2);
      expect(result.similar_patterns[0].score).toBe(0.92);
      expect(result.similar_patterns[0].metadata.pattern).toBe('document_review');
    });

    it('should optimize routing based on historical patterns', async () => {
      const request = {
        purpose: 'document_verification',
        context: 'contract_review'
      };

      // Mock similar patterns
      vi.spyOn(gateway, 'findSimilarRoutingPatterns').mockResolvedValue({
        similar_patterns: [
          {
            score: 0.93,
            metadata: {
              pattern: 'document_review',
              avg_response_time: 150,
              success_rate: 0.95,
              recommended_model: '@cf/meta/llama-3.1-8b-instruct'
            }
          }
        ]
      });

      const result = await gateway.optimizeRouting(request);

      expect(result.recommended_pattern).toBe('document_review');
      expect(result.confidence).toBe(0.93);
      expect(result.expected_performance.response_time).toBe(150);
      expect(result.expected_performance.success_rate).toBe(0.95);
    });
  });

  describe('Performance Analytics', () => {
    it('should track agent pattern performance', async () => {
      const performance_data = {
        pattern: 'case_analysis',
        response_time: 250,
        success: true,
        model_used: '@cf/meta/llama-3.1-8b-instruct',
        tokens_used: 1500
      };

      await gateway.trackPatternPerformance(performance_data);

      expect(mockEnv.CHITTY_ANALYTICS.writeDataPoint).toHaveBeenCalledWith({
        indexes: ['agent_pattern', 'case_analysis'],
        doubles: [250, 1500, 1], // response_time, tokens, success
        blobs: ['@cf/meta/llama-3.1-8b-instruct', 'success']
      });
    });

    it('should generate performance insights', async () => {
      // Mock analytics data
      mockEnv.AUTH_CACHE.get.mockResolvedValue(JSON.stringify({
        case_analysis: { avg_response_time: 200, success_rate: 0.95 },
        document_review: { avg_response_time: 180, success_rate: 0.98 },
        client_communication: { avg_response_time: 120, success_rate: 0.99 }
      }));

      const insights = await gateway.generatePerformanceInsights();

      expect(insights.best_performing_pattern).toBe('client_communication');
      expect(insights.patterns).toHaveProperty('case_analysis');
      expect(insights.recommendations).toBeDefined();
    });

    it('should calculate cost optimization metrics', async () => {
      const usage_data = {
        total_requests: 10000,
        tokens_used: 1500000,
        successful_requests: 9800,
        patterns: {
          case_analysis: { requests: 3000, tokens: 600000 },
          document_review: { requests: 4000, tokens: 500000 },
          client_communication: { requests: 3000, tokens: 400000 }
        }
      };

      const optimization = await gateway.calculateCostOptimization(usage_data);

      expect(optimization.current_efficiency).toBeDefined();
      expect(optimization.cost_per_request).toBeDefined();
      expect(optimization.optimization_opportunities).toBeDefined();
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should implement circuit breaker for AI services', async () => {
      // Simulate multiple AI failures
      mockEnv.AI.run.mockRejectedValue(new Error('AI service timeout'));

      // Multiple failed requests to trigger circuit breaker
      for (let i = 0; i < 6; i++) {
        try {
          await gateway.callAIWithCircuitBreaker('@cf/meta/llama-3.1-8b-instruct', {
            messages: [{ role: 'user', content: 'test' }]
          });
        } catch (e) {
          // Expected failures
        }
      }

      // Circuit breaker should be open, subsequent calls should fail fast
      const start = Date.now();
      try {
        await gateway.callAIWithCircuitBreaker('@cf/meta/llama-3.1-8b-instruct', {
          messages: [{ role: 'user', content: 'test' }]
        });
      } catch (e) {
        const duration = Date.now() - start;
        expect(duration).toBeLessThan(100); // Should fail fast
        expect(e.message).toContain('Circuit breaker');
      }
    });

    it('should retry transient failures with exponential backoff', async () => {
      let callCount = 0;
      mockEnv.AI.run.mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          throw new Error('Transient failure');
        }
        return Promise.resolve({ response: 'success' });
      });

      const result = await gateway.callAIWithRetry('@cf/meta/llama-3.1-8b-instruct', {
        messages: [{ role: 'user', content: 'test' }]
      }, { maxRetries: 3 });

      expect(result.response).toBe('success');
      expect(callCount).toBe(3);
    });

    it('should provide fallback responses when AI is unavailable', async () => {
      mockEnv.AI.run.mockRejectedValue(new Error('AI service unavailable'));

      const request = {
        purpose: 'person',
        context: 'identity_verification'
      };

      const result = await gateway.identifyAgentPattern(request);

      expect(result.pattern).toBe('general');
      expect(result.fallback_used).toBe(true);
      expect(result.confidence).toBeLessThan(0.7);
    });

    it('should handle rate limiting gracefully', async () => {
      // Mock rate limit response
      mockEnv.AI.run.mockRejectedValue(Object.assign(new Error('Rate limited'), {
        status: 429,
        headers: { 'retry-after': '60' }
      }));

      const start = Date.now();
      await expect(
        gateway.callAIWithRetry('@cf/meta/llama-3.1-8b-instruct', {
          messages: [{ role: 'user', content: 'test' }]
        })
      ).rejects.toThrow('Rate limited');

      // Should have waited for retry-after period
      const duration = Date.now() - start;
      expect(duration).toBeGreaterThan(50); // Some wait time
    });
  });

  describe('Security and Compliance', () => {
    it('should validate request authorization', async () => {
      const request = new Request('https://id.chitty.cc/api/get-chittyid', {
        headers: {
          'Authorization': 'Bearer invalid-token'
        }
      });

      mockEnv.SESSIONS.get.mockResolvedValue(null);

      const result = await gateway.validateRequestSecurity(request);

      expect(result.authorized).toBe(false);
      expect(result.reason).toContain('Invalid session');
    });

    it('should sanitize sensitive data in logs', () => {
      const sensitiveData = {
        user: {
          id: 'user123',
          email: 'user@example.com',
          ssn: '123-45-6789'
        },
        project: {
          api_key: 'secret-key-12345',
          name: 'Test Project'
        }
      };

      const sanitized = gateway.sanitizeForLogging(sensitiveData);

      expect(sanitized.user.id).toBe('user123');
      expect(sanitized.user.email).toBe('[REDACTED]');
      expect(sanitized.user.ssn).toBe('[REDACTED]');
      expect(sanitized.project.api_key).toBe('[REDACTED]');
      expect(sanitized.project.name).toBe('Test Project');
    });

    it('should enforce rate limits per user', async () => {
      const userId = 'user123';

      // Mock high usage
      mockEnv.AUTH_CACHE.get.mockResolvedValue(JSON.stringify({
        requests_count: 150,
        window_start: Date.now() - 30000 // 30 seconds ago
      }));

      const result = await gateway.checkRateLimit(userId, {
        limit: 100,
        window: 60000 // 1 minute
      });

      expect(result.allowed).toBe(false);
      expect(result.limit_exceeded).toBe(true);
      expect(result.retry_after).toBeGreaterThan(0);
    });
  });
});