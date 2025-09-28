/**
 * QA Test Suite for Pipeline Enforcement
 * Comprehensive testing of mandatory pipeline architecture
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPipelineEnforcer } from '../../src/middleware/pipeline-enforcer.js';
import { createRequestInterceptor } from '../../src/middleware/request-interceptor.js';
import { ComplianceMonitor } from '../../src/enforcement/compliance-monitor.js';

describe('Pipeline Enforcement QA Tests', () => {
  let mockEnv;
  let enforcer;
  let interceptor;
  let complianceMonitor;

  beforeEach(() => {
    mockEnv = {
      SESSIONS: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn()
      },
      AUTH_CACHE: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn()
      }
    };

    enforcer = createPipelineEnforcer(mockEnv);
    interceptor = createRequestInterceptor(mockEnv);
    complianceMonitor = new ComplianceMonitor(mockEnv);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Legacy Endpoint Blocking', () => {
    const legacyEndpoints = [
      '/api/generate',
      '/api/create',
      '/api/create-id',
      '/api/mint',
      '/api/issue',
      '/direct/generate',
      '/bypass/auth'
    ];

    legacyEndpoints.forEach(endpoint => {
      it(`should block legacy endpoint: ${endpoint}`, async () => {
        const request = new Request(`https://id.chitty.cc${endpoint}`, {
          method: 'GET'
        });

        const next = vi.fn();
        const result = await enforcer(request, next);

        expect(result.status).toBe(410);
        expect(next).not.toHaveBeenCalled();

        const body = await result.json();
        expect(body.success).toBe(false);
        expect(body.error).toBe('PIPELINE_REQUIRED');
        expect(body.title).toContain('Legacy Endpoint');
      });
    });

    it('should block any URL containing "generate"', async () => {
      const generateUrls = [
        '/api/user/generate-id',
        '/some/path/generate',
        '/api/quick-generate'
      ];

      for (const url of generateUrls) {
        const request = new Request(`https://id.chitty.cc${url}`);
        const result = await interceptor(request);

        expect(result).toBeTruthy();
        expect(result.status).toBe(403);
      }
    });
  });

  describe('Required Headers Validation', () => {
    it('should reject requests without Authorization header', async () => {
      const request = new Request('https://id.chitty.cc/api/get-chittyid', {
        method: 'GET'
      });

      const next = vi.fn();
      const result = await enforcer(request, next);

      expect(result.status).toBe(401);
      expect(next).not.toHaveBeenCalled();

      const body = await result.json();
      expect(body.reason).toBe('MISSING_AUTH_TOKEN');
    });

    it('should reject requests without Session ID', async () => {
      const request = new Request('https://id.chitty.cc/api/get-chittyid', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer valid-token'
        }
      });

      const next = vi.fn();
      const result = await enforcer(request, next);

      expect(result.status).toBe(400);
      const body = await result.json();
      expect(body.reason).toBe('MISSING_SESSION_ID');
    });

    it('should reject requests with invalid session', async () => {
      mockEnv.SESSIONS.get.mockResolvedValue(null);

      const request = new Request('https://id.chitty.cc/api/get-chittyid', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer valid-token',
          'X-Session-ID': 'invalid-session'
        }
      });

      const next = vi.fn();
      const result = await enforcer(request, next);

      expect(result.status).toBe(401);
      const body = await result.json();
      expect(body.reason).toBe('INVALID_SESSION');
    });
  });

  describe('Pipeline Stage Completion Validation', () => {
    it('should reject requests with incomplete pipeline stages', async () => {
      const incompleteSession = {
        userId: 'user123',
        pipeline: {
          completedStages: ['router', 'intake'], // Missing trust, authorization
          token: 'pipeline-token-123'
        }
      };

      mockEnv.SESSIONS.get.mockResolvedValue(JSON.stringify(incompleteSession));

      const request = new Request('https://id.chitty.cc/api/get-chittyid', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer valid-token',
          'X-Session-ID': 'session-123',
          'X-Pipeline-Token': 'pipeline-token-123'
        }
      });

      const next = vi.fn();
      const result = await enforcer(request, next);

      expect(result.status).toBe(403);
      const body = await result.json();
      expect(body.reason).toBe('INCOMPLETE_PIPELINE');
      expect(body.missingStages).toEqual(['trust', 'authorization']);
    });

    it('should allow requests with all stages completed', async () => {
      const completeSession = {
        userId: 'user123',
        pipeline: {
          completedStages: ['router', 'intake', 'trust', 'authorization', 'generation'],
          token: 'pipeline-token-123',
          trustLevel: 3
        }
      };

      mockEnv.SESSIONS.get.mockResolvedValue(JSON.stringify(completeSession));
      mockEnv.AUTH_CACHE.get.mockResolvedValue(JSON.stringify({
        userId: 'user123',
        expiresAt: new Date(Date.now() + 3600000).toISOString()
      }));

      const request = new Request('https://id.chitty.cc/api/get-chittyid', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer valid-token',
          'X-Session-ID': 'session-123',
          'X-Pipeline-Token': 'pipeline-token-123'
        }
      });

      const mockResponse = new Response(JSON.stringify({ success: true }));
      const next = vi.fn().mockResolvedValue(mockResponse);

      const result = await enforcer(request, next);

      expect(next).toHaveBeenCalled();
      expect(result.headers.get('X-Pipeline-Completed')).toBe('true');
    });
  });

  describe('Token Validation', () => {
    it('should reject mismatched pipeline tokens', async () => {
      const session = {
        userId: 'user123',
        pipeline: {
          completedStages: ['router', 'intake', 'trust', 'authorization'],
          token: 'correct-token'
        }
      };

      mockEnv.SESSIONS.get.mockResolvedValue(JSON.stringify(session));

      const request = new Request('https://id.chitty.cc/api/get-chittyid', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer valid-token',
          'X-Session-ID': 'session-123',
          'X-Pipeline-Token': 'wrong-token'
        }
      });

      const next = vi.fn();
      const result = await enforcer(request, next);

      expect(result.status).toBe(403);
      const body = await result.json();
      expect(body.reason).toBe('INVALID_PIPELINE_TOKEN');
    });

    it('should reject expired pipeline tokens', async () => {
      const session = {
        userId: 'user123',
        pipeline: {
          completedStages: ['router', 'intake', 'trust', 'authorization'],
          token: 'pipeline-token-123',
          tokenExpiry: new Date(Date.now() - 1000).toISOString() // Expired 1 second ago
        }
      };

      mockEnv.SESSIONS.get.mockResolvedValue(JSON.stringify(session));

      const request = new Request('https://id.chitty.cc/api/get-chittyid', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer valid-token',
          'X-Session-ID': 'session-123',
          'X-Pipeline-Token': 'pipeline-token-123'
        }
      });

      const next = vi.fn();
      const result = await enforcer(request, next);

      expect(result.status).toBe(403);
      const body = await result.json();
      expect(body.reason).toBe('EXPIRED_PIPELINE_TOKEN');
    });
  });

  describe('Bypass Attempt Detection', () => {
    const bypassHeaders = [
      'x-bypass-pipeline',
      'x-skip-auth',
      'x-admin-override',
      'x-emergency-access'
    ];

    bypassHeaders.forEach(header => {
      it(`should detect and block bypass header: ${header}`, async () => {
        const request = new Request('https://id.chitty.cc/api/get-chittyid', {
          method: 'GET',
          headers: {
            [header]: 'true'
          }
        });

        const result = await interceptor(request);

        expect(result).toBeTruthy();
        expect(result.status).toBe(403);

        const body = await result.json();
        expect(body.reason).toBe('BYPASS_ATTEMPT_DETECTED');
      });
    });

    it('should detect bypass keywords in URL parameters', async () => {
      const bypassUrls = [
        'https://id.chitty.cc/api/get-chittyid?bypass=true',
        'https://id.chitty.cc/api/get-chittyid?skip-pipeline=yes',
        'https://id.chitty.cc/api/get-chittyid?override=admin'
      ];

      for (const url of bypassUrls) {
        const request = new Request(url);
        const result = await interceptor(request);

        expect(result).toBeTruthy();
        expect(result.status).toBe(403);
      }
    });

    it('should detect bypass attempts in request body', async () => {
      const bypassBody = {
        bypassPipeline: true,
        skipAuth: true,
        action: 'generate'
      };

      const request = new Request('https://id.chitty.cc/api/get-chittyid', {
        method: 'POST',
        body: JSON.stringify(bypassBody),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const result = await interceptor(request);

      expect(result).toBeTruthy();
      expect(result.status).toBe(403);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits per IP', async () => {
      const ip = '192.168.1.100';

      // Simulate 101 requests (exceeding limit of 100)
      for (let i = 0; i < 101; i++) {
        const request = new Request('https://id.chitty.cc/api/get-chittyid', {
          headers: {
            'CF-Connecting-IP': ip
          }
        });

        const result = await interceptor(request);

        if (i < 100) {
          expect(result).toBeNull(); // Should pass
        } else {
          expect(result).toBeTruthy(); // Should be blocked
          expect(result.status).toBe(429);
        }
      }
    });
  });

  describe('Compliance Monitoring', () => {
    it('should monitor and record compliance violations', async () => {
      const request = new Request('https://id.chitty.cc/api/get-chittyid', {
        method: 'GET'
      });

      const result = await complianceMonitor.monitor(request, 'generation');

      expect(result.compliant).toBe(false);
      expect(result.violations).toBeDefined();
      expect(result.action).toBe('BLOCK');

      // Verify violation was recorded
      expect(mockEnv.AUTH_CACHE.put).toHaveBeenCalledWith(
        expect.stringMatching(/^compliance:violation:/),
        expect.any(String),
        expect.any(Object)
      );
    });

    it('should record successful compliance', async () => {
      const validRequest = new Request('https://id.chitty.cc/api/validate', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer valid-token',
          'X-Session-ID': 'session-123'
        }
      });

      // Mock valid session
      mockEnv.SESSIONS.get.mockResolvedValue(JSON.stringify({
        userId: 'user123',
        pipeline: {
          completedStages: ['router', 'intake', 'trust', 'authorization'],
          token: 'token-123'
        }
      }));

      const result = await complianceMonitor.monitor(validRequest, 'validation');

      expect(result.compliant).toBe(true);
      expect(result.action).toBe('ALLOW');
    });
  });

  describe('Error Response Validation', () => {
    it('should return standardized error responses', async () => {
      const request = new Request('https://id.chitty.cc/api/generate');

      const next = vi.fn();
      const result = await enforcer(request, next);

      const body = await result.json();

      // Verify error response structure
      expect(body).toHaveProperty('success', false);
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('reason');
      expect(body).toHaveProperty('pipeline');
      expect(body).toHaveProperty('enforcement');

      expect(body.pipeline.required).toBe(true);
      expect(body.enforcement.bypassable).toBe(false);
    });

    it('should include proper headers in blocked responses', async () => {
      const request = new Request('https://id.chitty.cc/api/generate');

      const next = vi.fn();
      const result = await enforcer(request, next);

      expect(result.headers.get('X-Pipeline-Required')).toBe('true');
      expect(result.headers.get('X-Pipeline-Enforcement')).toBe('MANDATORY');
      expect(result.headers.get('X-ChittyOS-Service')).toBe('chittyid-mothership');
    });
  });

  describe('Allowed Endpoints', () => {
    const allowedEndpoints = [
      '/api/validate',
      '/api/info/03-1-USA-0001-P-241-3-47',
      '/api/search',
      '/api/spec',
      '/api/health'
    ];

    allowedEndpoints.forEach(endpoint => {
      it(`should allow public endpoint: ${endpoint}`, async () => {
        const request = new Request(`https://id.chitty.cc${endpoint}`, {
          method: endpoint.includes('/info/') ? 'GET' : 'POST'
        });

        const result = await interceptor(request);
        expect(result).toBeNull(); // Should not be intercepted
      });
    });
  });

  describe('Security Event Logging', () => {
    it('should log security events for blocked requests', async () => {
      const request = new Request('https://id.chitty.cc/api/generate', {
        headers: {
          'CF-Connecting-IP': '192.168.1.100',
          'User-Agent': 'TestAgent/1.0'
        }
      });

      await interceptor(request);

      // Verify security event was logged
      expect(mockEnv.AUTH_CACHE.put).toHaveBeenCalledWith(
        expect.stringMatching(/^security:/),
        expect.stringContaining('192.168.1.100'),
        expect.any(Object)
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle malformed requests gracefully', async () => {
      const request = new Request('https://id.chitty.cc/api/get-chittyid', {
        method: 'GET',
        headers: {
          'Authorization': '', // Empty auth header
          'X-Session-ID': null
        }
      });

      const next = vi.fn();
      const result = await enforcer(request, next);

      expect(result).toBeDefined();
      expect(result.status).toBeGreaterThanOrEqual(400);
    });

    it('should handle KV storage failures gracefully', async () => {
      mockEnv.SESSIONS.get.mockRejectedValue(new Error('KV Error'));

      const request = new Request('https://id.chitty.cc/api/get-chittyid', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer valid-token',
          'X-Session-ID': 'session-123'
        }
      });

      const next = vi.fn();
      const result = await enforcer(request, next);

      expect(result).toBeDefined();
      expect(result.status).toBeGreaterThanOrEqual(500);
    });
  });
});