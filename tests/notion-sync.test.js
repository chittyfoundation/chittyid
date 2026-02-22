/**
 * Notion Sync Tests
 * Tests for hardened Notion synchronization service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NotionSyncService } from '../src/services/notion-sync.js';

describe('Notion Sync Service', () => {
  let notionSync;
  let mockEnv;

  beforeEach(() => {
    global.fetch = vi.fn();

    mockEnv = {
      NOTION_TOKEN: 'secret_test_token',
      NOTION_DATABASE_ID_ATOMIC_FACTS: 'test-database-id',
      PLATFORM_CACHE: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn()
      },
      CHITTY_IDS: {
        put: vi.fn()
      },
      CHITTY_ANALYTICS: {
        writeDataPoint: vi.fn()
      }
    };

    notionSync = new NotionSyncService(mockEnv);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Configuration Validation', () => {
    it('should validate configuration successfully', async () => {
      // Mock Notion API response
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'test-database-id' })
      });

      const result = await notionSync.validateConfig();

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.notion.com/v1/databases/test-database-id',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer secret_test_token'
          })
        })
      );
    });

    it('should fail validation without token', async () => {
      notionSync.notion.token = null;

      const result = await notionSync.validateConfig();

      expect(result.success).toBe(false);
      expect(result.error).toContain('NOTION_TOKEN not configured');
    });

    it('should fail validation with invalid database', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 404
      });

      const result = await notionSync.validateConfig();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Notion API test failed');
    });
  });

  describe('Field Transformation', () => {
    it('should transform AtomicFact to Notion payload correctly', () => {
      const fact = {
        factId: 'FACT-123',
        parentArtifactId: 'DOC-456',
        factText: 'This is a test fact.',
        factType: 'ADMISSION',
        locationRef: 'Page 5, Line 10',
        classification: 'FACT',
        weight: 0.85,
        credibility: ['SWORN', 'DOCUMENTED'],
        chainStatus: 'Minted',
        verifiedAt: '2023-10-01T12:00:00Z',
        verificationMethod: 'AI Analysis'
      };

      const result = notionSync.transformToNotionPayload(fact);

      expect(result.valid).toBe(true);
      expect(result.properties).toHaveProperty('Fact ID');
      expect(result.properties['Fact ID'].title[0].text.content).toBe('FACT-123');
      expect(result.properties['Fact Type'].select.name).toBe('ADMISSION');
      expect(result.properties['Weight'].number).toBe(0.85);
      expect(result.properties['Credibility Factors'].multi_select).toHaveLength(2);
    });

    it('should handle missing required fields', () => {
      const incompleteFact = {
        factText: 'Missing fact ID'
      };

      const result = notionSync.transformToNotionPayload(incompleteFact);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Required field factId is missing');
    });

    it('should truncate long text fields', () => {
      const longText = 'x'.repeat(3000);
      const fact = {
        factId: 'FACT-123',
        factText: longText
      };

      const result = notionSync.transformToNotionPayload(fact);

      expect(result.valid).toBe(true);
      expect(result.properties['Fact Text'].rich_text[0].text.content).toHaveLength(2000);
    });

    it('should validate select options', () => {
      const fact = {
        factId: 'FACT-123',
        factType: 'INVALID_TYPE'
      };

      const result = notionSync.transformToNotionPayload(fact);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid select value: INVALID_TYPE');
    });

    it('should handle multi-select filtering', () => {
      const fact = {
        factId: 'FACT-123',
        credibility: ['SWORN', 'INVALID_OPTION', 'DOCUMENTED']
      };

      const result = notionSync.transformToNotionPayload(fact);

      expect(result.valid).toBe(true);
      expect(result.properties['Credibility Factors'].multi_select).toHaveLength(2);
      expect(result.properties['Credibility Factors'].multi_select.map(s => s.name))
        .toEqual(['SWORN', 'DOCUMENTED']);
    });
  });

  describe('Idempotent Upserts', () => {
    beforeEach(() => {
      vi.spyOn(notionSync, 'delay').mockResolvedValue();
    });

    it('should create new page when none exists', async () => {
      // Mock no existing page
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ results: [] })
        })
        // Mock successful creation
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'new-page-id' })
        });

      const fact = {
        factId: 'FACT-NEW',
        factText: 'New fact'
      };

      const result = await notionSync.upsertFact(fact);

      expect(result.created).toBe(true);
      expect(result.pageId).toBe('new-page-id');
    });

    it('should update existing page when content differs', async () => {
      const existingPage = {
        id: 'existing-page-id',
        properties: {
          'Fact Text': {
            rich_text: [{ text: { content: 'Old text' } }]
          }
        }
      };

      // Mock existing page found
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ results: [existingPage] })
        })
        // Mock successful update
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'existing-page-id' })
        });

      const fact = {
        factId: 'FACT-EXISTING',
        factText: 'Updated text'
      };

      const result = await notionSync.upsertFact(fact);

      expect(result.updated).toBe(true);
      expect(result.pageId).toBe('existing-page-id');
    });

    it('should skip update when no changes detected', async () => {
      // Build the fact and transform it to get the exact Notion payload
      const fact = {
        factId: 'FACT-SAME',
        factText: 'Same text'
      };
      const transformed = notionSync.transformToNotionPayload(fact);

      // Build existing page with matching properties (except system fields which are skipped)
      const existingPage = {
        id: 'existing-page-id',
        properties: { ...transformed.properties }
      };

      // Mock existing page found with same content
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [existingPage] })
      });

      const result = await notionSync.upsertFact(fact);

      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('No changes detected');
    });
  });

  describe('Retry Logic with Exponential Backoff', () => {
    beforeEach(() => {
      // Eliminate real delays so retry tests don't time out
      vi.spyOn(notionSync, 'delay').mockResolvedValue();
    });

    it('should retry on 429 rate limit', async () => {
      // Mock rate limit then success
      global.fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: { get: () => '2' } // Retry-After: 2 seconds
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ results: [] })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'created-id' })
        });

      const fact = { factId: 'FACT-RETRY', factText: 'Test retry' };

      const result = await notionSync.upsertFact(fact);

      expect(result.created).toBe(true);
      // Verify delay was called (retry happened)
      expect(notionSync.delay).toHaveBeenCalled();
      expect(notionSync.metrics.notion_429).toBe(1);
    });

    it('should retry on 5xx server errors', async () => {
      global.fetch
        .mockResolvedValueOnce({ ok: false, status: 500, text: () => Promise.resolve('Internal Server Error') })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ results: [] })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'created-id' })
        });

      const fact = { factId: 'FACT-SERVER-ERROR', factText: 'Test server error' };

      const result = await notionSync.upsertFact(fact);

      expect(result.created).toBe(true);
      expect(notionSync.metrics.notion_5xx).toBe(1);
    });

    it('should fail after max retries', async () => {
      global.fetch.mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('Internal Server Error') });

      const fact = { factId: 'FACT-MAX-RETRY', factText: 'Test max retry' };

      await expect(notionSync.upsertFact(fact)).rejects.toThrow('Notion API error 500');
    });
  });

  describe('Dead Letter Queue (DLQ)', () => {
    beforeEach(() => {
      vi.spyOn(notionSync, 'delay').mockResolvedValue();
      // Bypass config validation — it makes a fetch call that interferes with DLQ mocks
      vi.spyOn(notionSync, 'validateConfig').mockResolvedValue({ success: true });
    });

    it('should push failed items to DLQ', async () => {
      const facts = [
        { factId: 'FACT-1', factText: 'Good fact' },
        { factId: 'FACT-2', factText: 'Bad fact' }
      ];

      // Mock first fact: query (no existing) + create (success)
      // Then all subsequent calls fail (for FACT-2's retries)
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ results: [] })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'created-1' })
        })
        .mockRejectedValue(new Error('Network error'));

      const result = await notionSync.sync(facts);

      expect(result.success).toBe(true);
      expect(result.summary.created).toBe(1);
      expect(result.summary.failed).toBe(1);
      expect(result.metrics.dlq_pushed).toBe(1);

      // Verify DLQ entry
      expect(mockEnv.PLATFORM_CACHE.put).toHaveBeenCalledWith(
        'dlq:notion:FACT-2',
        expect.stringContaining('"factId":"FACT-2"'),
        { expirationTtl: 86400 }
      );
    });

    it('should process DLQ items on retry', async () => {
      // Mock DLQ items
      mockEnv.PLATFORM_CACHE.list.mockResolvedValue({
        keys: [{ name: 'dlq:notion:FACT-RETRY' }]
      });

      mockEnv.PLATFORM_CACHE.get.mockResolvedValue(JSON.stringify({
        fact: { factId: 'FACT-RETRY', factText: 'Retry fact' },
        attempts: 1,
        retryAt: new Date(Date.now() - 1000).toISOString()
      }));

      // Mock successful retry
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ results: [] })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'retry-success' })
        });

      const result = await notionSync.sync([], { processDlq: true });

      expect(result.success).toBe(true);
      expect(mockEnv.PLATFORM_CACHE.delete).toHaveBeenCalledWith('dlq:notion:FACT-RETRY');
    });

    it('should increment retry attempts on continued failure', async () => {
      mockEnv.PLATFORM_CACHE.list.mockResolvedValue({
        keys: [{ name: 'dlq:notion:FACT-PERSISTENT' }]
      });

      mockEnv.PLATFORM_CACHE.get.mockResolvedValue(JSON.stringify({
        fact: { factId: 'FACT-PERSISTENT', factText: 'Persistent failure' },
        attempts: 3,
        retryAt: new Date(Date.now() - 1000).toISOString()
      }));

      // Mock continued failure
      global.fetch.mockRejectedValue(new Error('Persistent error'));

      await notionSync.sync([], { processDlq: true });

      // Should update retry data with incremented attempts
      expect(mockEnv.PLATFORM_CACHE.put).toHaveBeenCalledWith(
        'dlq:notion:FACT-PERSISTENT',
        expect.stringContaining('"attempts":4')
      );
    });

    it('should remove items after max attempts', async () => {
      mockEnv.PLATFORM_CACHE.list.mockResolvedValue({
        keys: [{ name: 'dlq:notion:FACT-MAX-ATTEMPTS' }]
      });

      mockEnv.PLATFORM_CACHE.get.mockResolvedValue(JSON.stringify({
        fact: { factId: 'FACT-MAX-ATTEMPTS', factText: 'Max attempts reached' },
        attempts: 10,
        retryAt: new Date(Date.now() - 1000).toISOString()
      }));

      global.fetch.mockRejectedValue(new Error('Still failing'));

      await notionSync.sync([], { processDlq: true });

      expect(mockEnv.PLATFORM_CACHE.delete).toHaveBeenCalledWith('dlq:notion:FACT-MAX-ATTEMPTS');
    });
  });

  describe('Batch Processing', () => {
    it('should process facts in configurable batches', async () => {
      const facts = new Array(25).fill(null).map((_, i) => ({
        factId: `FACT-${i}`,
        factText: `Fact ${i}`
      }));

      // Mock all requests as successful
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [] })
      });
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'created' })
      });

      const startTime = Date.now();
      const result = await notionSync.sync(facts, { batchSize: 5 });
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.summary.created).toBe(25);

      // Should have taken time for batch delays (5 batches * 200ms = 1000ms)
      expect(duration).toBeGreaterThan(800);
    });
  });

  describe('Metrics and Observability', () => {
    beforeEach(() => {
      vi.spyOn(notionSync, 'delay').mockResolvedValue();
      vi.spyOn(notionSync, 'validateConfig').mockResolvedValue({ success: true });
    });

    it('should track comprehensive metrics', async () => {
      const facts = [
        { factId: 'FACT-SUCCESS', factText: 'Success' },
        { factId: 'FACT-SKIP', factText: 'Skip' }
      ];

      // For the skip case, force checkNeedsUpdate to return false
      const originalCheck = notionSync.checkNeedsUpdate.bind(notionSync);
      let callCount = 0;
      vi.spyOn(notionSync, 'checkNeedsUpdate').mockImplementation(async (...args) => {
        callCount++;
        if (callCount === 1) return false; // Skip the second fact
        return originalCheck(...args);
      });

      // Mock: FACT-SUCCESS (no existing → create), FACT-SKIP (existing → skip)
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ results: [] })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'success-id' })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            results: [{
              id: 'existing-id',
              properties: {}
            }]
          })
        });

      const result = await notionSync.sync(facts);

      expect(result.metrics.notion_ok).toBe(1);
      expect(result.metrics.upsert_skipped).toBe(1);

      // Verify metrics storage
      expect(mockEnv.PLATFORM_CACHE.put).toHaveBeenCalledWith(
        expect.stringMatching(/^metrics:notion:/),
        expect.stringContaining('"notion_ok":1'),
        { expirationTtl: 604800 }
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty fact array', async () => {
      const result = await notionSync.sync([]);

      expect(result.success).toBe(true);
      expect(result.summary.total).toBe(0);
    });

    it('should handle malformed fact data gracefully', async () => {
      const facts = [
        null,
        undefined,
        { factId: 'GOOD-FACT', factText: 'Good' },
        { badData: 'missing factId' }
      ];

      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [] })
      });
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'good-id' })
      });

      const result = await notionSync.sync(facts);

      expect(result.success).toBe(true);
      expect(result.summary.created).toBe(1);
      expect(result.summary.failed).toBe(3);
    });

    it('should handle Notion API inconsistencies', async () => {
      // Mock inconsistent responses
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ results: 'unexpected format' })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'recovered-id' })
        });

      const fact = { factId: 'FACT-INCONSISTENT', factText: 'Inconsistent response' };

      const result = await notionSync.upsertFact(fact);

      expect(result.created).toBe(true); // Should recover gracefully
    });
  });
});