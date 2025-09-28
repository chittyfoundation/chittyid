/**
 * Notion Webhook Tests
 * Tests for real-time webhook-based synchronization
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NotionWebhookService } from '../src/services/notion-webhook.js';
import crypto from 'crypto';

describe('Notion Webhook Service', () => {
  let webhookService;
  let mockEnv;

  beforeEach(() => {
    global.fetch = vi.fn();

    mockEnv = {
      NOTION_TOKEN: 'secret_test_token',
      NOTION_DATABASE_ID_ATOMIC_FACTS: 'test-database-id',
      NOTION_WEBHOOK_SECRET: 'test-webhook-secret',
      NOTION_WEBHOOK_VERIFICATION_TOKEN: 'test-verification-token',
      SERVICE_TOKEN: 'test-service-token',
      AUTH_CACHE: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn()
      },
      CHITTY_IDS: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn()
      }
    };

    webhookService = new NotionWebhookService(mockEnv);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Webhook Verification', () => {
    it('should verify valid webhook signature', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const body = JSON.stringify({ type: 'page.content_updated' });
      const message = `${timestamp}.${body}`;
      const signature = crypto
        .createHmac('sha256', 'test-webhook-secret')
        .update(message)
        .digest('hex');

      const request = new Request('https://test.com', {
        method: 'POST',
        headers: {
          'X-Notion-Signature': signature,
          'X-Notion-Timestamp': timestamp.toString()
        },
        body
      });

      const result = await webhookService.verifyWebhook(request);

      expect(result.valid).toBe(true);
      expect(result.body).toEqual({ type: 'page.content_updated' });
    });

    it('should reject webhooks with invalid signature', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const body = JSON.stringify({ type: 'page.content_updated' });

      const request = new Request('https://test.com', {
        method: 'POST',
        headers: {
          'X-Notion-Signature': 'invalid-signature',
          'X-Notion-Timestamp': timestamp.toString()
        },
        body
      });

      const result = await webhookService.verifyWebhook(request);

      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('should reject webhooks with old timestamp', async () => {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 400 seconds ago
      const body = JSON.stringify({ type: 'page.content_updated' });
      const message = `${oldTimestamp}.${body}`;
      const signature = crypto
        .createHmac('sha256', 'test-webhook-secret')
        .update(message)
        .digest('hex');

      const request = new Request('https://test.com', {
        method: 'POST',
        headers: {
          'X-Notion-Signature': signature,
          'X-Notion-Timestamp': oldTimestamp.toString()
        },
        body
      });

      const result = await webhookService.verifyWebhook(request);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Timestamp too old');
    });
  });

  describe('Page Update Events', () => {
    beforeEach(() => {
      // Mock fetchPageFromNotion
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'test-page-id',
          parent: { database_id: 'test-database-id' },
          properties: {
            'Fact ID': {
              type: 'title',
              title: [{ text: { content: 'FACT-123' } }]
            },
            'Fact Text': {
              type: 'rich_text',
              rich_text: [{ text: { content: 'Test fact content' } }]
            },
            'Fact Type': {
              type: 'select',
              select: { name: 'ADMISSION' }
            },
            'Weight': {
              type: 'number',
              number: 0.85
            }
          },
          last_edited_time: '2023-01-01T12:00:00Z'
        })
      });
    });

    it('should handle page content update for AtomicFact', async () => {
      const payload = {
        type: 'page.content_updated',
        data: { page_id: 'test-page-id' }
      };

      const result = await webhookService.handlePageUpdate(payload);

      expect(result.processed).toBe(true);
      expect(result.factId).toBe('FACT-123');
      expect(result.action).toBe('updated');

      // Verify fact was stored
      expect(mockEnv.CHITTY_IDS.put).toHaveBeenCalledWith(
        'fact:FACT-123',
        expect.stringContaining('syncedFromWebhook'),
        { expirationTtl: 86400 * 30 }
      );
    });

    it('should skip non-AtomicFact pages', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 'test-page-id',
          parent: { database_id: 'different-database-id' },
          properties: {}
        })
      });

      const payload = {
        type: 'page.content_updated',
        data: { page_id: 'test-page-id' }
      };

      const result = await webhookService.handlePageUpdate(payload);

      expect(result.processed).toBe(false);
      expect(result.reason).toBe('Not an AtomicFact');
    });
  });

  describe('Page Creation Events', () => {
    it('should handle new AtomicFact creation', async () => {
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            id: 'new-page-id',
            parent: { database_id: 'test-database-id' },
            properties: {
              'Fact ID': {
                type: 'title',
                title: [{ text: { content: 'FACT-NEW' } }]
              },
              'Fact Text': {
                type: 'rich_text',
                rich_text: [{ text: { content: 'New fact' } }]
              }
            }
          })
        })
        // Mock ChittyID request
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ chittyId: '03-1-USA-0001-P-241-3-47' })
        })
        // Mock Notion page update
        .mockResolvedValueOnce({ ok: true });

      const payload = {
        type: 'page.created',
        data: { page_id: 'new-page-id' }
      };

      const result = await webhookService.handlePageCreated(payload);

      expect(result.processed).toBe(true);
      expect(result.factId).toBe('FACT-NEW');
      expect(result.action).toBe('created');

      // Verify ChittyID was requested
      expect(global.fetch).toHaveBeenCalledWith(
        'https://id.chitty.cc/api/get-chittyid?for=atomic-fact',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-service-token'
          })
        })
      );
    });
  });

  describe('Page Deletion Events', () => {
    it('should handle page deletion', async () => {
      // Mock finding fact by page ID
      mockEnv.CHITTY_IDS.list.mockResolvedValue({
        keys: [{ name: 'fact:FACT-DELETE' }]
      });

      mockEnv.CHITTY_IDS.get.mockResolvedValue(JSON.stringify({
        factId: 'FACT-DELETE',
        notionPageId: 'deleted-page-id'
      }));

      const payload = {
        type: 'page.deleted',
        data: { page_id: 'deleted-page-id' }
      };

      const result = await webhookService.handlePageDeleted(payload);

      expect(result.processed).toBe(true);
      expect(result.factId).toBe('FACT-DELETE');
      expect(result.action).toBe('deleted');

      // Verify deletion was marked
      expect(mockEnv.CHITTY_IDS.put).toHaveBeenCalledWith(
        'fact:FACT-DELETE',
        expect.stringContaining('deleted'),
        undefined
      );
    });
  });

  describe('Schema Update Events', () => {
    it('should handle AtomicFacts database schema updates', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          properties: {
            'Fact ID': { type: 'title' },
            'Fact Text': { type: 'rich_text' },
            'New Field': { type: 'select' }
          }
        })
      });

      const payload = {
        type: 'data_source.schema_updated',
        data: { database_id: 'test-database-id' }
      };

      const result = await webhookService.handleSchemaUpdate(payload);

      expect(result.processed).toBe(true);
      expect(result.action).toBe('schema_updated');

      // Verify schema cache was cleared and updated
      expect(mockEnv.AUTH_CACHE.delete).toHaveBeenCalledWith(
        'notion:schema:atomic_facts'
      );
      expect(mockEnv.AUTH_CACHE.put).toHaveBeenCalledWith(
        'notion:schema:atomic_facts',
        expect.any(String),
        { expirationTtl: 86400 }
      );
    });
  });

  describe('Comment Events', () => {
    it('should handle comment with @sync trigger', async () => {
      const payload = {
        type: 'comment.created',
        data: {
          page_id: 'test-page-id',
          comment: {
            text: 'Please @sync this fact'
          }
        }
      };

      // Mock page fetch
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'test-page-id',
          parent: { database_id: 'test-database-id' },
          properties: {
            'Fact ID': {
              type: 'title',
              title: [{ text: { content: 'FACT-SYNC' } }]
            },
            'Fact Text': {
              type: 'rich_text',
              rich_text: [{ text: { content: 'Sync me' } }]
            }
          }
        })
      });

      const result = await webhookService.handleComment(payload);

      expect(result.processed).toBe(true);
      expect(result.action).toBe('comment_triggered');

      // Verify force sync was called
      expect(mockEnv.CHITTY_IDS.put).toHaveBeenCalled();
    });

    it('should handle comment with @chittyid trigger', async () => {
      const payload = {
        type: 'comment.created',
        data: {
          page_id: 'test-page-id',
          comment: {
            text: 'Generate @chittyid for this fact'
          }
        }
      };

      // Mock page fetch
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            id: 'test-page-id',
            parent: { database_id: 'test-database-id' },
            properties: {
              'Fact ID': {
                type: 'title',
                title: [{ text: { content: 'FACT-ID-REQ' } }]
              }
            }
          })
        })
        // Mock ChittyID request
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ chittyId: '03-1-USA-0002-P-241-3-48' })
        })
        // Mock Notion update
        .mockResolvedValueOnce({ ok: true });

      const result = await webhookService.handleComment(payload);

      expect(result.processed).toBe(true);
      expect(result.action).toBe('comment_triggered');
    });
  });

  describe('Property Value Extraction', () => {
    it('should extract title property correctly', () => {
      const property = {
        type: 'title',
        title: [{ text: { content: 'Test Title' } }]
      };

      const value = webhookService.getPropertyValue(property);
      expect(value).toBe('Test Title');
    });

    it('should extract multi-select property correctly', () => {
      const property = {
        type: 'multi_select',
        multi_select: [
          { name: 'SWORN' },
          { name: 'DOCUMENTED' }
        ]
      };

      const value = webhookService.getPropertyValue(property);
      expect(value).toEqual(['SWORN', 'DOCUMENTED']);
    });

    it('should handle empty properties', () => {
      const value = webhookService.getPropertyValue(null);
      expect(value).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should store failed webhooks in DLQ', async () => {
      const request = new Request('https://test.com', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ invalid: 'payload' })
      });

      // Mock verification failure
      vi.spyOn(webhookService, 'verifyWebhook').mockResolvedValue({
        valid: false,
        reason: 'Invalid signature'
      });

      const result = await webhookService.processWebhook(request);

      expect(result.success).toBe(false);
      expect(result.status).toBe(401);
    });

    it('should handle fetch errors gracefully', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));

      const payload = {
        type: 'page.content_updated',
        data: { page_id: 'test-page-id' }
      };

      const result = await webhookService.handlePageUpdate(payload);

      expect(result).toBeUndefined(); // Error should be caught
    });
  });

  describe('Metrics Tracking', () => {
    it('should track webhook metrics', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const body = JSON.stringify({
        type: 'page.content_updated',
        data: { page_id: 'test-page-id' }
      });
      const message = `${timestamp}.${body}`;
      const signature = crypto
        .createHmac('sha256', 'test-webhook-secret')
        .update(message)
        .digest('hex');

      const request = new Request('https://test.com', {
        method: 'POST',
        headers: {
          'X-Notion-Signature': signature,
          'X-Notion-Timestamp': timestamp.toString()
        },
        body
      });

      // Mock successful page fetch
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'test-page-id',
          parent: { database_id: 'test-database-id' },
          properties: {
            'Fact ID': {
              type: 'title',
              title: [{ text: { content: 'FACT-METRICS' } }]
            }
          }
        })
      });

      await webhookService.processWebhook(request);

      expect(webhookService.metrics.webhooks_received).toBe(1);
      expect(webhookService.metrics.webhooks_processed).toBe(1);
      expect(webhookService.metrics.events_by_type['page.content_updated']).toBe(1);

      // Verify metrics were stored
      expect(mockEnv.AUTH_CACHE.put).toHaveBeenCalledWith(
        'metrics:notion:webhooks',
        expect.stringContaining('webhooks_received'),
        { expirationTtl: 86400 * 7 }
      );
    });
  });
});