/**
 * Session Sync Integration Tests
 * Tests for distributed session synchronization
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionSyncService } from '../src/services/session-sync.js';

describe('Session Sync Service', () => {
  let sessionSync;
  let mockEnv;

  beforeEach(() => {
    global.fetch = vi.fn();

    mockEnv = {
      SESSIONS: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn()
      },
      NODE_ID: 'test-node-1'
    };

    sessionSync = new SessionSyncService(mockEnv);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Session Initialization', () => {
    it('should create new session successfully', async () => {
      const result = await sessionSync.initializeSession('user123', 'proj456', {
        userAgent: 'test-agent'
      });

      expect(result.success).toBe(true);
      expect(result.sessionId).toMatch(/^user123-proj456-/);
      expect(result.session.userId).toBe('user123');
      expect(result.session.projectId).toBe('proj456');
      expect(result.session.state).toBe('active');

      // Verify storage call
      expect(mockEnv.SESSIONS.put).toHaveBeenCalledWith(
        `session:${result.sessionId}`,
        expect.stringContaining('"userId":"user123"'),
        { expirationTtl: 3600 }
      );
    });

    it('should include metadata in session', async () => {
      const metadata = {
        userAgent: 'Mozilla/5.0',
        ip: '192.168.1.1',
        purpose: 'testing'
      };

      const result = await sessionSync.initializeSession('user123', 'proj456', metadata);

      expect(result.session.metadata).toMatchObject(metadata);
      expect(result.session.metadata.initiated).toBeDefined();
      expect(result.session.metadata.initiator).toBe('chittyid');
    });
  });

  describe('Session Synchronization', () => {
    it('should sync session across services successfully', async () => {
      // Mock existing session
      const session = {
        id: 'test-session-123',
        userId: 'user123',
        projectId: 'proj456',
        version: 1,
        state: 'active'
      };

      mockEnv.SESSIONS.get.mockResolvedValue(JSON.stringify(session));

      // Mock successful service responses
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          version: 2,
          checksum: 'abc123'
        })
      });

      const updates = { lastActivity: new Date().toISOString() };
      const result = await sessionSync.syncSession('test-session-123', updates);

      expect(result.success).toBe(true);
      expect(result.syncedNodes).toHaveLength(6); // All services
      expect(result.latency).toBeGreaterThan(0);
    });

    it('should handle service failures gracefully', async () => {
      const session = {
        id: 'test-session-123',
        userId: 'user123',
        version: 1
      };

      mockEnv.SESSIONS.get.mockResolvedValue(JSON.stringify(session));

      // Mock some services failing
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, version: 2, checksum: 'abc' })
        })
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: false,
          status: 500
        });

      const result = await sessionSync.syncSession('test-session-123', { test: 'update' });

      expect(result.success).toBe(true); // Should succeed with partial sync
      expect(result.syncedNodes.length).toBeLessThan(6);
    });

    it('should queue failed syncs for retry', async () => {
      mockEnv.SESSIONS.get.mockResolvedValue(null); // Session not found

      const result = await sessionSync.syncSession('non-existent', {});

      expect(result.success).toBe(false);
      expect(result.queued).toBe(true);

      // Verify retry queue entry
      expect(mockEnv.SESSIONS.put).toHaveBeenCalledWith(
        'retry:non-existent',
        expect.stringContaining('"sessionId":"non-existent"'),
        { expirationTtl: 3600 }
      );
    });
  });

  describe('Conflict Resolution', () => {
    it('should resolve conflicts using Last-Write-Wins', async () => {
      const session = {
        id: 'test-session',
        version: 1,
        data: 'original'
      };

      const updates = {
        data: 'updated',
        newField: 'new'
      };

      const resolved = await sessionSync.applyUpdates(session, updates);

      expect(resolved.data).toBe('updated');
      expect(resolved.newField).toBe('new');
      expect(resolved.version).toBe(2);
      expect(resolved.lastModified).toBeDefined();
    });

    it('should handle timestamp-based conflicts', async () => {
      const session = {
        id: 'test-session',
        version: 1,
        data: {
          value: 'old',
          _timestamp: '2023-01-01T00:00:00Z'
        }
      };

      const updates = {
        data: {
          value: 'new',
          _timestamp: '2023-01-02T00:00:00Z'
        }
      };

      const resolved = await sessionSync.applyUpdates(session, updates);

      expect(resolved.data.value).toBe('new'); // Newer timestamp wins
    });

    it('should store conflict records', async () => {
      const session = {
        id: 'test-session',
        version: 1,
        field1: 'original'
      };

      const updates = {
        field1: 'updated'
      };

      await sessionSync.applyUpdates(session, updates);

      // Verify conflict storage
      expect(mockEnv.SESSIONS.put).toHaveBeenCalledWith(
        expect.stringMatching(/^conflicts:test-session:/),
        expect.stringContaining('"field":"field1"'),
        { expirationTtl: 604800 }
      );
    });
  });

  describe('Service Health Tracking', () => {
    it('should track healthy service responses', async () => {
      await sessionSync.updateServiceHealth('chittyauth', true);

      expect(mockEnv.SESSIONS.put).toHaveBeenCalledWith(
        'health:chittyauth',
        expect.stringContaining('"healthy":true'),
        { expirationTtl: 3600 }
      );
    });

    it('should increment failure count for unhealthy services', async () => {
      // Mock existing health data
      mockEnv.SESSIONS.get.mockResolvedValue(JSON.stringify({
        service: 'chittyauth',
        healthy: false,
        consecutiveFailures: 2
      }));

      await sessionSync.updateServiceHealth('chittyauth', false);

      expect(mockEnv.SESSIONS.put).toHaveBeenCalledWith(
        'health:chittyauth',
        expect.stringContaining('"consecutiveFailures":3'),
        { expirationTtl: 3600 }
      );
    });
  });

  describe('Retry Processing', () => {
    it('should process retry queue', async () => {
      // Mock retry queue items
      mockEnv.SESSIONS.list.mockResolvedValue({
        keys: [
          { name: 'retry:session1' },
          { name: 'retry:session2' }
        ]
      });

      // Mock retry data
      mockEnv.SESSIONS.get
        .mockResolvedValueOnce(JSON.stringify({
          sessionId: 'session1',
          updates: { test: 'data' },
          attempts: 1,
          nextRetry: new Date(Date.now() - 1000).toISOString() // Past time
        }))
        .mockResolvedValueOnce(JSON.stringify({
          sessionId: 'session2',
          updates: { test: 'data2' },
          attempts: 1,
          nextRetry: new Date(Date.now() + 10000).toISOString() // Future time
        }));

      // Mock session data for retry
      mockEnv.SESSIONS.get.mockResolvedValue(JSON.stringify({
        id: 'session1',
        version: 1
      }));

      // Mock successful sync
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, version: 2, checksum: 'abc' })
      });

      await sessionSync.processRetryQueue();

      // Should only process session1 (past retry time)
      expect(mockEnv.SESSIONS.delete).toHaveBeenCalledWith('retry:session1');
      expect(mockEnv.SESSIONS.delete).not.toHaveBeenCalledWith('retry:session2');
    });

    it('should handle max retry attempts', async () => {
      mockEnv.SESSIONS.list.mockResolvedValue({
        keys: [{ name: 'retry:session1' }]
      });

      mockEnv.SESSIONS.get.mockResolvedValue(JSON.stringify({
        sessionId: 'session1',
        updates: { test: 'data' },
        attempts: 6, // Exceeds max
        nextRetry: new Date(Date.now() - 1000).toISOString()
      }));

      // Mock failed sync
      global.fetch.mockRejectedValue(new Error('Service unavailable'));

      await sessionSync.processRetryQueue();

      // Should delete after max attempts
      expect(mockEnv.SESSIONS.delete).toHaveBeenCalledWith('retry:session1');
    });
  });

  describe('Session Cleanup', () => {
    it('should clean up expired sessions', async () => {
      // Add expired session to local cache
      const expiredSession = {
        id: 'expired-session',
        initiated: new Date(Date.now() - 7200000).toISOString() // 2 hours ago
      };

      sessionSync.sessionState.local.set('expired-session', expiredSession);

      const result = await sessionSync.cleanupSessions();

      expect(result.cleaned).toBe(1);
      expect(sessionSync.sessionState.local.has('expired-session')).toBe(false);
      expect(mockEnv.SESSIONS.delete).toHaveBeenCalledWith('session:expired-session');
    });
  });

  describe('Vector Clocks', () => {
    it('should generate and update vector clocks', () => {
      const clock1 = sessionSync.getVectorClock('session1');
      const clock2 = sessionSync.getVectorClock('session1');

      expect(clock1['test-node-1']).toBe(1);
      expect(clock2['test-node-1']).toBe(2);
    });
  });

  describe('Checksum Calculation', () => {
    it('should generate consistent checksums', () => {
      const session = { id: 'test', data: 'value' };

      const checksum1 = sessionSync.calculateChecksum(session);
      const checksum2 = sessionSync.calculateChecksum(session);

      expect(checksum1).toBe(checksum2);
      expect(checksum1).toMatch(/^[0-9a-f]+$/);
    });

    it('should generate different checksums for different data', () => {
      const session1 = { id: 'test', data: 'value1' };
      const session2 = { id: 'test', data: 'value2' };

      const checksum1 = sessionSync.calculateChecksum(session1);
      const checksum2 = sessionSync.calculateChecksum(session2);

      expect(checksum1).not.toBe(checksum2);
    });
  });
});