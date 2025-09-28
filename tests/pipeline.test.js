/**
 * Pipeline System Tests
 * Comprehensive testing for ChittyID generation pipeline
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChittyPipeline } from '../src/pipeline/index.js';

describe('ChittyID Pipeline', () => {
  let pipeline;
  let mockEnv;

  beforeEach(() => {
    // Mock Cloudflare environment
    mockEnv = {
      SESSIONS: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn()
      },
      AUTH_CACHE: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn()
      },
      CHITTY_IDS: {
        get: vi.fn(),
        put: vi.fn()
      },
      CHITTY_ANALYTICS: {
        writeDataPoint: vi.fn()
      },
      NODE_ID: 'test-node'
    };

    pipeline = new ChittyPipeline(mockEnv);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Pipeline Flow', () => {
    it('should complete full pipeline successfully', async () => {
      // Mock successful session
      mockEnv.SESSIONS.get.mockResolvedValue(JSON.stringify({
        user: { id: 'user123', country: 'US', verified: true },
        project: { id: 'proj456', registered: true, permissions: ['generate_id'] }
      }));

      // Mock compliance data
      mockEnv.AUTH_CACHE.get.mockResolvedValue(JSON.stringify({
        score: 0.9
      }));

      const request = new Request('https://id.chitty.cc/api/get-chittyid', {
        headers: {
          'Authorization': 'Bearer test-token',
          'CF-IPCountry': 'US'
        }
      });

      const result = await pipeline.process(request, 'work-item');

      expect(result.success).toBe(true);
      expect(result.chittyId).toMatch(/^03-1-USA-\d{4}-T-\d{4}-\d{1}-\d{2}$/);
      expect(result.metadata.stages).toHaveLength(5);
    });

    it('should fail without authentication', async () => {
      const request = new Request('https://id.chitty.cc/api/get-chittyid');

      const result = await pipeline.process(request, 'general');

      expect(result.success).toBe(false);
      expect(result.error).toContain('router');
      expect(result.stage).toBe('router');
    });

    it('should fail with invalid session', async () => {
      mockEnv.SESSIONS.get.mockResolvedValue(null);

      const request = new Request('https://id.chitty.cc/api/get-chittyid', {
        headers: { 'Authorization': 'Bearer invalid-token' }
      });

      const result = await pipeline.process(request, 'general');

      expect(result.success).toBe(false);
      expect(result.error).toContain('intake');
    });

    it('should fail without project registration', async () => {
      mockEnv.SESSIONS.get.mockResolvedValue(JSON.stringify({
        user: { id: 'user123', verified: true },
        project: { id: 'proj456', registered: false }
      }));

      const request = new Request('https://id.chitty.cc/api/get-chittyid', {
        headers: { 'Authorization': 'Bearer test-token' }
      });

      const result = await pipeline.process(request, 'general');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Project not registered');
    });

    it('should respect rate limits', async () => {
      // Mock high usage
      mockEnv.AUTH_CACHE.get.mockResolvedValue('999');

      mockEnv.SESSIONS.get.mockResolvedValue(JSON.stringify({
        user: { id: 'user123', verified: true },
        project: { id: 'proj456', registered: true, permissions: ['generate_id'] }
      }));

      const request = new Request('https://id.chitty.cc/api/get-chittyid', {
        headers: { 'Authorization': 'Bearer test-token' }
      });

      const result = await pipeline.process(request, 'general');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Rate limit exceeded');
    });
  });

  describe('Trust Level Calculation', () => {
    it('should calculate trust level correctly', async () => {
      const trustStage = pipeline.stages.trust;

      const context = {
        stages: {
          intake: {
            user: { id: 'user123', verified: true, twoFactorEnabled: true },
            project: { registered: true, verified: true }
          }
        }
      };

      // Mock high compliance
      mockEnv.AUTH_CACHE.get.mockResolvedValue(JSON.stringify({ score: 0.9 }));

      const result = await trustStage.process(context);

      expect(result.success).toBe(true);
      expect(result.trustLevel).toBe(5); // Max trust level
      expect(result.factors).toContain('user_verified');
      expect(result.factors).toContain('project_registered');
      expect(result.factors).toContain('high_compliance');
      expect(result.factors).toContain('2fa_enabled');
      expect(result.factors).toContain('project_verified');
    });

    it('should assign minimum trust for unverified users', async () => {
      const trustStage = pipeline.stages.trust;

      const context = {
        stages: {
          intake: {
            user: { id: 'user123', verified: false },
            project: { registered: false }
          }
        }
      };

      mockEnv.AUTH_CACHE.get.mockResolvedValue(null);

      const result = await trustStage.process(context);

      expect(result.success).toBe(true);
      expect(result.trustLevel).toBe(0);
      expect(result.factors).toHaveLength(0);
    });
  });

  describe('Generation Stage', () => {
    it('should generate valid ChittyID format', async () => {
      const generationStage = pipeline.stages.generation;

      const context = {
        purpose: 'work-item',
        timestamp: new Date().toISOString(),
        stages: {
          intake: {
            user: { id: 'user123', country: 'US' },
            project: { id: 'proj456', name: 'Test Project' }
          },
          trust: {
            trustLevel: 3
          }
        }
      };

      const result = await generationStage.process(context);

      expect(result.success).toBe(true);
      expect(result.chittyId).toMatch(/^03-1-USA-\d{4}-T-\d{4}-3-\d{2}$/);

      // Verify storage call
      expect(mockEnv.CHITTY_IDS.put).toHaveBeenCalledWith(
        result.chittyId,
        expect.stringContaining('"pipeline":"v2"')
      );
    });

    it('should map purposes to entity types correctly', () => {
      const generationStage = pipeline.stages.generation;

      expect(generationStage.mapPurposeToEntityType('person')).toBe('P');
      expect(generationStage.mapPurposeToEntityType('location')).toBe('L');
      expect(generationStage.mapPurposeToEntityType('work-item')).toBe('T');
      expect(generationStage.mapPurposeToEntityType('event')).toBe('E');
      expect(generationStage.mapPurposeToEntityType('unknown')).toBe('T');
    });

    it('should calculate correct checksum', () => {
      const generationStage = pipeline.stages.generation;
      const baseId = '03-1-USA-0001-T-2509-3';

      const checksum = generationStage.calculateChecksum(baseId);

      expect(checksum).toMatch(/^\d{2}$/);
      expect(checksum.length).toBe(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle stage failures gracefully', async () => {
      // Mock stage failure
      vi.spyOn(pipeline.stages.router, 'process').mockRejectedValue(new Error('Router failure'));

      const request = new Request('https://id.chitty.cc/api/get-chittyid');

      const result = await pipeline.process(request, 'general');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Router failure');
    });

    it('should provide detailed error context', async () => {
      const request = new Request('https://id.chitty.cc/api/get-chittyid');

      const result = await pipeline.process(request, 'general');

      expect(result).toHaveProperty('stage');
      expect(result).toHaveProperty('timestamp');
      expect(result.error).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should complete pipeline within timeout', async () => {
      mockEnv.SESSIONS.get.mockResolvedValue(JSON.stringify({
        user: { id: 'user123', country: 'US', verified: true },
        project: { id: 'proj456', registered: true, permissions: ['generate_id'] }
      }));

      const request = new Request('https://id.chitty.cc/api/get-chittyid', {
        headers: { 'Authorization': 'Bearer test-token' }
      });

      const startTime = Date.now();
      const result = await pipeline.process(request, 'general');
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe('Analytics Integration', () => {
    it('should track analytics for successful generation', async () => {
      mockEnv.SESSIONS.get.mockResolvedValue(JSON.stringify({
        user: { id: 'user123', country: 'US', verified: true },
        project: { id: 'proj456', registered: true, permissions: ['generate_id'] }
      }));

      const request = new Request('https://id.chitty.cc/api/get-chittyid', {
        headers: { 'Authorization': 'Bearer test-token' }
      });

      await pipeline.process(request, 'work-item');

      expect(mockEnv.CHITTY_ANALYTICS.writeDataPoint).toHaveBeenCalledWith({
        indexes: ['chittyid_generated', 'proj456'],
        doubles: [expect.any(Number), expect.any(Number)],
        blobs: [expect.any(String), 'work-item']
      });
    });
  });
});