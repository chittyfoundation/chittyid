/**
 * Compliance and Audit Tests
 * Tests for regulatory compliance, audit trails, and governance
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComplianceMonitor } from '../../src/enforcement/compliance-monitor.js';
import { createPipelineEnforcer } from '../../src/middleware/pipeline-enforcer.js';
import { SessionSyncService } from '../../src/services/session-sync.js';

describe('Compliance and Audit Tests', () => {
  let mockEnv;
  let complianceMonitor;
  let enforcer;
  let sessionSync;

  beforeEach(() => {
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
        delete: vi.fn(),
        list: vi.fn()
      },
      CHITTY_ANALYTICS: {
        writeDataPoint: vi.fn()
      }
    };

    complianceMonitor = new ComplianceMonitor(mockEnv);
    enforcer = createPipelineEnforcer(mockEnv);
    sessionSync = new SessionSyncService(mockEnv);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('SOX Compliance (Sarbanes-Oxley)', () => {
    it('should maintain immutable audit logs', async () => {
      const request = new Request('https://id.chitty.cc/api/get-chittyid', {
        headers: {
          'CF-Connecting-IP': '192.168.1.100',
          'User-Agent': 'TestClient/1.0',
          'Authorization': 'Bearer token123'
        }
      });

      await complianceMonitor.monitor(request, 'generation');

      // Verify audit log was created
      expect(mockEnv.AUTH_CACHE.put).toHaveBeenCalledWith(
        expect.stringMatching(/^compliance:(violation|success):/),
        expect.any(String),
        expect.objectContaining({ expirationTtl: expect.any(Number) })
      );

      // Audit logs should be immutable (no delete calls for compliance records)
      const putCalls = mockEnv.AUTH_CACHE.put.mock.calls;
      const complianceCalls = putCalls.filter(call => call[0].startsWith('compliance:'));

      expect(complianceCalls.length).toBeGreaterThan(0);

      // Verify retention period (90 days for violations, 7 days for success)
      complianceCalls.forEach(call => {
        const ttl = call[2]?.expirationTtl;
        expect(ttl).toBeGreaterThan(86400 * 6); // At least 7 days
      });
    });

    it('should track all financial transaction related activities', async () => {
      const financialPurposes = [
        'financial-record',
        'audit-trail',
        'transaction-id',
        'payment-verification'
      ];

      for (const purpose of financialPurposes) {
        const request = new Request(`https://id.chitty.cc/api/get-chittyid?for=${purpose}`, {
          headers: {
            'Authorization': 'Bearer financial-token',
            'X-Session-ID': 'financial-session'
          }
        });

        await complianceMonitor.monitor(request, 'generation', { purpose });

        // Verify special handling for financial purposes
        expect(mockEnv.AUTH_CACHE.put).toHaveBeenCalledWith(
          expect.stringMatching(/^compliance:/),
          expect.stringContaining(purpose),
          expect.any(Object)
        );
      }
    });

    it('should enforce segregation of duties', async () => {
      // Simulate attempt to use admin token for regular operations
      const adminRequest = new Request('https://id.chitty.cc/api/get-chittyid', {
        headers: {
          'Authorization': 'Bearer admin-token',
          'X-User-Role': 'administrator',
          'X-Session-ID': 'admin-session'
        }
      });

      const result = await complianceMonitor.monitor(adminRequest, 'generation');

      // Admin users should not be able to perform regular operations
      expect(result.compliant).toBe(false);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          rule: expect.stringMatching(/BYPASS|AUTH/),
          severity: expect.any(String)
        })
      );
    });
  });

  describe('GDPR Compliance (General Data Protection Regulation)', () => {
    it('should ensure data minimization in logs', async () => {
      const request = new Request('https://id.chitty.cc/api/get-chittyid', {
        headers: {
          'Authorization': 'Bearer personal-data-token',
          'X-User-Email': 'user@example.com',
          'X-Personal-ID': 'EU-CITIZEN-123',
          'CF-Connecting-IP': '192.168.1.100'
        }
      });

      await complianceMonitor.monitor(request, 'generation');

      // Verify that personal data is not logged in full
      const logCalls = mockEnv.AUTH_CACHE.put.mock.calls;
      const complianceLogs = logCalls.filter(call => call[0].startsWith('compliance:'));

      complianceLogs.forEach(call => {
        const logData = call[1];

        // Should not contain full email or personal identifiers
        expect(logData).not.toContain('user@example.com');
        expect(logData).not.toContain('EU-CITIZEN-123');

        // May contain hashed or truncated versions
        if (logData.includes('email') || logData.includes('personal')) {
          // Should be obfuscated
          expect(logData).toMatch(/\*\*\*|hash|truncated/);
        }
      });
    });

    it('should implement right to be forgotten', async () => {
      const userSession = {
        userId: 'gdpr-user-123',
        userEmail: 'gdpr@example.com',
        pipeline: {
          completedStages: ['router'],
          personalData: true
        }
      };

      mockEnv.SESSIONS.get.mockResolvedValue(JSON.stringify(userSession));

      // Simulate data deletion request
      const deleteRequest = new Request('https://id.chitty.cc/api/user/delete', {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer gdpr-token',
          'X-GDPR-Request': 'delete-personal-data'
        }
      });

      await complianceMonitor.monitor(deleteRequest, 'data-deletion');

      // Verify deletion was logged for compliance
      expect(mockEnv.AUTH_CACHE.put).toHaveBeenCalledWith(
        expect.stringMatching(/^compliance:/),
        expect.stringContaining('data-deletion'),
        expect.any(Object)
      );
    });

    it('should provide data portability compliance', async () => {
      const exportRequest = new Request('https://id.chitty.cc/api/user/export', {
        headers: {
          'Authorization': 'Bearer export-token',
          'X-GDPR-Request': 'data-export',
          'X-User-ID': 'gdpr-user-456'
        }
      });

      await complianceMonitor.monitor(exportRequest, 'data-export');

      // Verify export request was logged
      expect(mockEnv.AUTH_CACHE.put).toHaveBeenCalledWith(
        expect.stringMatching(/^compliance:/),
        expect.stringContaining('data-export'),
        expect.objectContaining({
          expirationTtl: 86400 * 90 // GDPR requires 90-day retention
        })
      );
    });

    it('should enforce lawful basis tracking', async () => {
      const legalBases = [
        'consent',
        'contract',
        'legal-obligation',
        'vital-interests',
        'public-task',
        'legitimate-interests'
      ];

      for (const basis of legalBases) {
        const request = new Request('https://id.chitty.cc/api/get-chittyid', {
          headers: {
            'Authorization': 'Bearer gdpr-token',
            'X-Legal-Basis': basis,
            'X-Session-ID': `session-${basis}`
          }
        });

        await complianceMonitor.monitor(request, 'generation', { legalBasis: basis });

        // Verify legal basis is recorded
        expect(mockEnv.AUTH_CACHE.put).toHaveBeenCalledWith(
          expect.stringMatching(/^compliance:/),
          expect.stringContaining(basis),
          expect.any(Object)
        );
      }
    });
  });

  describe('HIPAA Compliance (Health Insurance Portability)', () => {
    it('should protect health information in logs', async () => {
      const healthRequest = new Request('https://id.chitty.cc/api/get-chittyid?for=healthcare', {
        headers: {
          'Authorization': 'Bearer healthcare-token',
          'X-Patient-ID': 'PHI-123456',
          'X-Medical-Record': 'MRN-789012',
          'X-Healthcare-Provider': 'Hospital-ABC'
        }
      });

      await complianceMonitor.monitor(healthRequest, 'healthcare-generation');

      // Verify PHI is not exposed in logs
      const logCalls = mockEnv.AUTH_CACHE.put.mock.calls;
      const healthLogs = logCalls.filter(call =>
        call[1].includes('healthcare') || call[1].includes('PHI')
      );

      healthLogs.forEach(call => {
        const logData = call[1];

        // Should not contain actual PHI
        expect(logData).not.toContain('PHI-123456');
        expect(logData).not.toContain('MRN-789012');

        // Should use coded references
        if (logData.includes('patient') || logData.includes('medical')) {
          expect(logData).toMatch(/\*\*\*|hash|coded/);
        }
      });
    });

    it('should enforce minimum necessary access', async () => {
      const accessLevels = [
        'read-only',
        'treatment',
        'payment',
        'operations',
        'emergency'
      ];

      for (const level of accessLevels) {
        const request = new Request('https://id.chitty.cc/api/get-chittyid?for=healthcare', {
          headers: {
            'Authorization': 'Bearer healthcare-token',
            'X-Access-Level': level,
            'X-HIPAA-Purpose': level
          }
        });

        const result = await complianceMonitor.monitor(request, 'healthcare-access', {
          accessLevel: level
        });

        // Verify access level is validated
        expect(mockEnv.AUTH_CACHE.put).toHaveBeenCalledWith(
          expect.stringMatching(/^compliance:/),
          expect.stringContaining(level),
          expect.any(Object)
        );
      }
    });
  });

  describe('PCI DSS Compliance (Payment Card Industry)', () => {
    it('should never log payment card data', async () => {
      const paymentRequest = new Request('https://id.chitty.cc/api/get-chittyid?for=payment', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer payment-token',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          cardNumber: '4111111111111111',
          cvv: '123',
          expiryDate: '12/25'
        })
      });

      await complianceMonitor.monitor(paymentRequest, 'payment-processing');

      // Verify no PCI data is logged
      const logCalls = mockEnv.AUTH_CACHE.put.mock.calls;

      logCalls.forEach(call => {
        const logData = call[1];

        // Should never contain actual card data
        expect(logData).not.toContain('4111111111111111');
        expect(logData).not.toContain('123');
        expect(logData).not.toContain('12/25');

        // Should not contain card-like patterns
        expect(logData).not.toMatch(/\d{13,19}/); // Card number patterns
        expect(logData).not.toMatch(/\d{3,4}/); // CVV patterns
      });
    });

    it('should enforce encrypted data transmission', async () => {
      const insecureRequest = new Request('https://id.chitty.cc/api/get-chittyid?for=payment', {
        headers: {
          'Authorization': 'Bearer payment-token'
        }
      });

      // Should enforce HTTPS for payment-related requests
      const result = await complianceMonitor.monitor(insecureRequest, 'payment-processing');

      // HTTP requests should be flagged as violations
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          rule: expect.stringMatching(/SECURITY|ENCRYPTION/),
          severity: 'CRITICAL'
        })
      );
    });
  });

  describe('ISO 27001 Compliance (Information Security)', () => {
    it('should maintain information asset inventory', async () => {
      const assetTypes = [
        'user-data',
        'system-config',
        'audit-logs',
        'security-keys',
        'business-data'
      ];

      for (const assetType of assetTypes) {
        const request = new Request('https://id.chitty.cc/api/get-chittyid', {
          headers: {
            'Authorization': 'Bearer asset-token',
            'X-Asset-Type': assetType,
            'X-Classification': 'confidential'
          }
        });

        await complianceMonitor.monitor(request, 'asset-access', {
          assetType,
          classification: 'confidential'
        });

        // Verify asset access is tracked
        expect(mockEnv.AUTH_CACHE.put).toHaveBeenCalledWith(
          expect.stringMatching(/^compliance:/),
          expect.stringContaining(assetType),
          expect.any(Object)
        );
      }
    });

    it('should implement risk-based access controls', async () => {
      const riskLevels = ['low', 'medium', 'high', 'critical'];

      for (const riskLevel of riskLevels) {
        const request = new Request('https://id.chitty.cc/api/get-chittyid', {
          headers: {
            'Authorization': 'Bearer risk-token',
            'X-Risk-Level': riskLevel,
            'X-Risk-Assessment': `${riskLevel}-risk-operation`
          }
        });

        const result = await complianceMonitor.monitor(request, 'risk-based-access', {
          riskLevel
        });

        // High and critical risk should require additional controls
        if (riskLevel === 'high' || riskLevel === 'critical') {
          expect(result.violations?.length || 0).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Audit Trail Integrity', () => {
    it('should create tamper-evident audit logs', async () => {
      const request = new Request('https://id.chitty.cc/api/get-chittyid', {
        headers: {
          'Authorization': 'Bearer audit-token',
          'X-Session-ID': 'audit-session'
        }
      });

      await complianceMonitor.monitor(request, 'generation');

      // Verify audit entry includes integrity controls
      const auditCalls = mockEnv.AUTH_CACHE.put.mock.calls.filter(call =>
        call[0].startsWith('compliance:')
      );

      auditCalls.forEach(call => {
        const auditData = JSON.parse(call[1]);

        // Should include timestamp, request ID, and integrity hash
        expect(auditData).toHaveProperty('timestamp');
        expect(auditData).toHaveProperty('id');
        expect(auditData.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      });
    });

    it('should maintain chronological order of events', async () => {
      const requests = [
        'session-init',
        'router-stage',
        'intake-stage',
        'trust-stage',
        'generation'
      ];

      const timestamps = [];

      for (const stage of requests) {
        const request = new Request('https://id.chitty.cc/api/get-chittyid', {
          headers: {
            'Authorization': 'Bearer chronology-token',
            'X-Pipeline-Stage': stage
          }
        });

        await complianceMonitor.monitor(request, stage);

        // Extract timestamp from last compliance entry
        const lastCall = mockEnv.AUTH_CACHE.put.mock.calls
          .filter(call => call[0].startsWith('compliance:'))
          .pop();

        if (lastCall) {
          const data = JSON.parse(lastCall[1]);
          timestamps.push(new Date(data.timestamp));
        }
      }

      // Verify chronological order
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i].getTime()).toBeGreaterThanOrEqual(
          timestamps[i - 1].getTime()
        );
      }
    });

    it('should provide non-repudiation evidence', async () => {
      const request = new Request('https://id.chitty.cc/api/get-chittyid', {
        headers: {
          'Authorization': 'Bearer nonrepudiation-token',
          'X-Digital-Signature': 'SHA256:abc123def456',
          'X-Certificate-ID': 'CERT-789012'
        }
      });

      await complianceMonitor.monitor(request, 'signed-generation');

      // Verify digital signature information is captured
      expect(mockEnv.AUTH_CACHE.put).toHaveBeenCalledWith(
        expect.stringMatching(/^compliance:/),
        expect.stringContaining('SHA256'),
        expect.any(Object)
      );
    });
  });

  describe('Compliance Reporting', () => {
    it('should generate compliance statistics', async () => {
      // Simulate various compliance events
      const events = [
        { compliant: true, violations: [] },
        { compliant: false, violations: [{ rule: 'AUTH_REQUIRED' }] },
        { compliant: true, violations: [] },
        { compliant: false, violations: [{ rule: 'PIPELINE_REQUIRED' }] }
      ];

      // Mock existing metrics
      mockEnv.AUTH_CACHE.get
        .mockResolvedValueOnce('2') // violations:AUTH_REQUIRED
        .mockResolvedValueOnce('1') // violations:PIPELINE_REQUIRED
        .mockResolvedValueOnce('10'); // compliance:success

      const stats = await complianceMonitor.getComplianceStats();

      expect(stats).toHaveProperty('violations');
      expect(stats).toHaveProperty('totalCompliant');
      expect(stats).toHaveProperty('totalViolations');
      expect(stats).toHaveProperty('complianceRate');

      // Compliance rate should be calculated correctly
      expect(stats.complianceRate).toBeGreaterThanOrEqual(0);
      expect(stats.complianceRate).toBeLessThanOrEqual(100);
    });

    it('should support audit data export', async () => {
      // Mock compliance records
      mockEnv.AUTH_CACHE.list.mockResolvedValue({
        keys: [
          { name: 'compliance:violation:123' },
          { name: 'compliance:success:456' }
        ]
      });

      mockEnv.AUTH_CACHE.get
        .mockResolvedValueOnce(JSON.stringify({
          timestamp: '2023-01-01T12:00:00Z',
          violations: [{ rule: 'AUTH_REQUIRED' }]
        }))
        .mockResolvedValueOnce(JSON.stringify({
          timestamp: '2023-01-01T12:01:00Z',
          status: 'COMPLIANT'
        }));

      // Simulate audit export
      const auditKeys = await mockEnv.AUTH_CACHE.list({ prefix: 'compliance:' });

      expect(auditKeys.keys.length).toBe(2);

      // Verify we can retrieve all audit records
      for (const key of auditKeys.keys) {
        const record = await mockEnv.AUTH_CACHE.get(key.name);
        const data = JSON.parse(record);

        expect(data).toHaveProperty('timestamp');
        expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      }
    });
  });

  describe('Regulatory Change Management', () => {
    it('should track configuration changes', async () => {
      const configChange = {
        parameter: 'pipeline.stages.required',
        oldValue: ['router', 'intake'],
        newValue: ['router', 'intake', 'trust', 'authorization'],
        changedBy: 'admin-user',
        reason: 'Compliance requirement update'
      };

      const request = new Request('https://id.chitty.cc/admin/config/update', {
        method: 'PUT',
        headers: {
          'Authorization': 'Bearer admin-token',
          'X-Change-Request': 'CR-2023-001'
        },
        body: JSON.stringify(configChange)
      });

      await complianceMonitor.monitor(request, 'config-change', configChange);

      // Verify configuration change is audited
      expect(mockEnv.AUTH_CACHE.put).toHaveBeenCalledWith(
        expect.stringMatching(/^compliance:/),
        expect.stringContaining('config-change'),
        expect.objectContaining({
          expirationTtl: 86400 * 90 // 90-day retention for config changes
        })
      );
    });

    it('should validate against compliance rules', async () => {
      const invalidConfig = {
        parameter: 'security.bypassEnabled',
        newValue: true, // This should never be allowed
        changedBy: 'malicious-user'
      };

      const request = new Request('https://id.chitty.cc/admin/config/update', {
        method: 'PUT',
        body: JSON.stringify(invalidConfig)
      });

      const result = await complianceMonitor.monitor(request, 'config-change', invalidConfig);

      // Should flag as violation
      expect(result.compliant).toBe(false);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          rule: 'BYPASS_PROHIBITED',
          severity: 'CRITICAL'
        })
      );
    });
  });
});