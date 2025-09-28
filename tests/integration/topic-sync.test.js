/**
 * Topic Sync Integration Tests
 * Tests for conversation flow and topic synchronization
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TopicSyncService } from '../../src/services/topic-sync.js';

describe('Topic Sync Integration', () => {
  let topicSync;
  let mockEnv;

  beforeEach(() => {
    global.fetch = vi.fn();

    mockEnv = {
      AI: {
        run: vi.fn()
      },
      CHITTY_VECTORS: {
        query: vi.fn(),
        upsert: vi.fn(),
        deleteByIds: vi.fn()
      },
      SESSIONS: {
        get: vi.fn(),
        put: vi.fn(),
        list: vi.fn(),
        delete: vi.fn()
      },
      CHITTY_ANALYTICS: {
        writeDataPoint: vi.fn()
      }
    };

    topicSync = new TopicSyncService(mockEnv);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Topic Creation and Management', () => {
    it('should create new topic successfully', async () => {
      const topicData = {
        title: 'Contract Review Discussion',
        description: 'Review of employment contract for client ABC',
        participants: ['user123', 'lawyer456'],
        project_id: 'proj789',
        context: {
          case_type: 'employment_law',
          urgency: 'medium'
        }
      };

      // Mock embedding generation
      mockEnv.AI.run.mockResolvedValue({
        data: [Array(384).fill(0).map(() => Math.random())]
      });

      const result = await topicSync.createTopic(topicData);

      expect(result.success).toBe(true);
      expect(result.topic_id).toBeDefined();
      expect(result.topic.title).toBe('Contract Review Discussion');
      expect(result.topic.status).toBe('active');
      expect(result.topic.created_at).toBeDefined();

      // Should store topic
      expect(mockEnv.SESSIONS.put).toHaveBeenCalledWith(
        `topic:${result.topic_id}`,
        expect.stringContaining('"title":"Contract Review Discussion"'),
        { expirationTtl: 86400 }
      );

      // Should create vector embedding
      expect(mockEnv.CHITTY_VECTORS.upsert).toHaveBeenCalled();
    });

    it('should generate semantic embeddings for topics', async () => {
      const topicContent = {
        title: 'Patent Application Review',
        description: 'Reviewing patent application for AI technology',
        messages: [
          'Can you review the claims section?',
          'The prior art analysis needs updating',
          'We should strengthen claim 1'
        ]
      };

      // Mock embedding response
      const mockEmbedding = Array(384).fill(0).map(() => Math.random());
      mockEnv.AI.run.mockResolvedValue({
        data: [mockEmbedding]
      });

      const result = await topicSync.generateTopicEmbedding(topicContent);

      expect(result.embedding).toHaveLength(384);
      expect(result.content_hash).toBeDefined();

      expect(mockEnv.AI.run).toHaveBeenCalledWith(
        '@cf/baai/bge-base-en-v1.5',
        expect.objectContaining({
          text: expect.stringContaining('Patent Application Review')
        })
      );
    });

    it('should update topic with new messages', async () => {
      const topicId = 'topic-123';

      // Mock existing topic
      mockEnv.SESSIONS.get.mockResolvedValue(JSON.stringify({
        id: topicId,
        title: 'Existing Topic',
        messages: [
          { id: 'msg1', content: 'First message', timestamp: '2023-10-01T10:00:00Z' }
        ],
        updated_at: '2023-10-01T10:00:00Z'
      }));

      const newMessage = {
        content: 'Second message in conversation',
        author: 'user123',
        message_type: 'response'
      };

      const result = await topicSync.addMessage(topicId, newMessage);

      expect(result.success).toBe(true);
      expect(result.message_id).toBeDefined();
      expect(result.topic.messages).toHaveLength(2);
      expect(result.topic.messages[1].content).toBe('Second message in conversation');

      // Should update topic storage
      expect(mockEnv.SESSIONS.put).toHaveBeenCalledWith(
        `topic:${topicId}`,
        expect.stringContaining('"messages":['),
        { expirationTtl: 86400 }
      );
    });

    it('should handle topic archival', async () => {
      const topicId = 'topic-archive-123';

      mockEnv.SESSIONS.get.mockResolvedValue(JSON.stringify({
        id: topicId,
        title: 'Completed Topic',
        status: 'active',
        messages: [{ id: 'msg1', content: 'Message' }]
      }));

      const result = await topicSync.archiveTopic(topicId, {
        reason: 'case_closed',
        archive_location: 'long_term_storage'
      });

      expect(result.success).toBe(true);
      expect(result.archived_at).toBeDefined();

      // Should update status
      expect(mockEnv.SESSIONS.put).toHaveBeenCalledWith(
        `topic:${topicId}`,
        expect.stringContaining('"status":"archived"'),
        { expirationTtl: 2592000 } // 30 days
      );
    });
  });

  describe('Semantic Search and Similarity', () => {
    it('should find similar topics using vector search', async () => {
      const query = 'patent application review process';

      // Mock embedding for query
      const queryEmbedding = Array(384).fill(0.1);
      mockEnv.AI.run.mockResolvedValue({
        data: [queryEmbedding]
      });

      // Mock vector search results
      mockEnv.CHITTY_VECTORS.query.mockResolvedValue({
        matches: [
          {
            id: 'topic-456',
            score: 0.92,
            metadata: {
              title: 'Patent Claims Analysis',
              project_id: 'proj789',
              participants: ['user123', 'lawyer456']
            }
          },
          {
            id: 'topic-789',
            score: 0.87,
            metadata: {
              title: 'IP Strategy Discussion',
              project_id: 'proj789',
              participants: ['user123', 'counsel789']
            }
          }
        ]
      });

      const result = await topicSync.findSimilarTopics(query, {
        limit: 5,
        threshold: 0.8,
        project_id: 'proj789'
      });

      expect(result.similar_topics).toHaveLength(2);
      expect(result.similar_topics[0].score).toBe(0.92);
      expect(result.similar_topics[0].title).toBe('Patent Claims Analysis');
      expect(result.query_embedding).toEqual(queryEmbedding);
    });

    it('should provide conversation continuity suggestions', async () => {
      const currentTopic = {
        id: 'topic-current',
        title: 'Contract Negotiation',
        messages: [
          { content: 'We need to review clause 15', timestamp: '2023-10-01T10:00:00Z' },
          { content: 'The termination conditions need clarification', timestamp: '2023-10-01T10:15:00Z' }
        ],
        context: {
          case_type: 'contract_law',
          urgency: 'high'
        }
      };

      // Mock AI analysis
      mockEnv.AI.run.mockResolvedValue({
        response: JSON.stringify({
          conversation_flow: {
            current_focus: 'contract_termination_clause',
            suggested_topics: [
              'Review notice period requirements',
              'Clarify termination for cause vs without cause',
              'Define material breach conditions'
            ],
            related_precedents: ['case_abc_v_xyz', 'contract_template_v2']
          },
          confidence: 0.88
        })
      });

      const result = await topicSync.suggestContinuity(currentTopic);

      expect(result.success).toBe(true);
      expect(result.suggestions.current_focus).toBe('contract_termination_clause');
      expect(result.suggestions.suggested_topics).toHaveLength(3);
      expect(result.suggestions.related_precedents).toContain('case_abc_v_xyz');
    });

    it('should detect topic drift and suggest refocus', async () => {
      const topic = {
        id: 'topic-drift',
        title: 'Employment Contract Review',
        messages: [
          { content: 'Let\'s review the compensation section', timestamp: '2023-10-01T10:00:00Z' },
          { content: 'The benefits package looks standard', timestamp: '2023-10-01T10:15:00Z' },
          { content: 'By the way, how was your weekend?', timestamp: '2023-10-01T10:20:00Z' },
          { content: 'Did you see the game last night?', timestamp: '2023-10-01T10:25:00Z' }
        ]
      };

      // Mock drift analysis
      mockEnv.AI.run.mockResolvedValue({
        response: JSON.stringify({
          drift_detected: true,
          drift_score: 0.75,
          original_topic_relevance: 0.3,
          suggested_action: 'refocus_conversation',
          refocus_suggestion: 'Return to discussion of employment contract terms'
        })
      });

      const result = await topicSync.analyzeDrift(topic);

      expect(result.drift_detected).toBe(true);
      expect(result.drift_score).toBe(0.75);
      expect(result.suggested_action).toBe('refocus_conversation');
      expect(result.refocus_suggestion).toContain('employment contract');
    });
  });

  describe('Cross-Service Synchronization', () => {
    it('should sync topic updates across ChittyOS services', async () => {
      const topicUpdate = {
        topic_id: 'topic-sync-123',
        action: 'message_added',
        data: {
          message_id: 'msg-456',
          content: 'New message content',
          timestamp: '2023-10-01T12:00:00Z'
        }
      };

      // Mock successful service responses
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, synced: true })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, synced: true })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, synced: true })
        });

      const result = await topicSync.syncAcrossServices(topicUpdate);

      expect(result.success).toBe(true);
      expect(result.synced_services).toHaveLength(3);
      expect(result.failed_services).toHaveLength(0);

      // Should call ChittyChat, ChittyLedger, and ChittyAssets
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should handle partial sync failures gracefully', async () => {
      const topicUpdate = {
        topic_id: 'topic-partial-sync',
        action: 'status_changed',
        data: { status: 'archived' }
      };

      // Mock mixed responses
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true })
        })
        .mockRejectedValueOnce(new Error('Service unavailable'))
        .mockResolvedValueOnce({
          ok: false,
          status: 503
        });

      const result = await topicSync.syncAcrossServices(topicUpdate);

      expect(result.success).toBe(true); // Partial success
      expect(result.synced_services).toHaveLength(1);
      expect(result.failed_services).toHaveLength(2);
      expect(result.retry_queue).toHaveLength(2);
    });

    it('should queue failed syncs for retry', async () => {
      const failedSync = {
        topic_id: 'topic-retry',
        service: 'chittychat',
        update: { action: 'message_added' },
        attempts: 0
      };

      await topicSync.queueFailedSync(failedSync);

      expect(mockEnv.SESSIONS.put).toHaveBeenCalledWith(
        'sync_retry:topic-retry:chittychat',
        expect.stringContaining('"attempts":0'),
        { expirationTtl: 3600 }
      );
    });

    it('should process retry queue', async () => {
      // Mock retry queue items
      mockEnv.SESSIONS.list.mockResolvedValue({
        keys: [
          { name: 'sync_retry:topic-123:chittychat' },
          { name: 'sync_retry:topic-456:chittyledger' }
        ]
      });

      // Mock retry data
      mockEnv.SESSIONS.get
        .mockResolvedValueOnce(JSON.stringify({
          topic_id: 'topic-123',
          service: 'chittychat',
          update: { action: 'message_added' },
          attempts: 2,
          next_retry: new Date(Date.now() - 1000).toISOString()
        }))
        .mockResolvedValueOnce(JSON.stringify({
          topic_id: 'topic-456',
          service: 'chittyledger',
          update: { action: 'archived' },
          attempts: 1,
          next_retry: new Date(Date.now() + 30000).toISOString()
        }));

      // Mock successful retry
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true })
      });

      const result = await topicSync.processRetryQueue();

      expect(result.processed).toBe(1); // Only topic-123 (past retry time)
      expect(result.skipped).toBe(1); // topic-456 (future retry time)

      // Should delete successful retry
      expect(mockEnv.SESSIONS.delete).toHaveBeenCalledWith('sync_retry:topic-123:chittychat');
    });
  });

  describe('Analytics and Insights', () => {
    it('should track topic engagement metrics', async () => {
      const metrics = {
        topic_id: 'topic-metrics',
        action: 'message_added',
        participant: 'user123',
        timestamp: new Date().toISOString(),
        metadata: {
          message_length: 150,
          response_time: 5000,
          topic_age: 3600
        }
      };

      await topicSync.trackEngagement(metrics);

      expect(mockEnv.CHITTY_ANALYTICS.writeDataPoint).toHaveBeenCalledWith({
        indexes: ['topic_engagement', 'topic-metrics'],
        doubles: [150, 5000, 3600], // message_length, response_time, topic_age
        blobs: ['message_added', 'user123']
      });
    });

    it('should generate topic insights', async () => {
      const topicId = 'topic-insights';

      // Mock topic data
      mockEnv.SESSIONS.get.mockResolvedValue(JSON.stringify({
        id: topicId,
        title: 'Legal Research Discussion',
        participants: ['user123', 'lawyer456'],
        messages: [
          { timestamp: '2023-10-01T10:00:00Z', author: 'user123' },
          { timestamp: '2023-10-01T10:15:00Z', author: 'lawyer456' },
          { timestamp: '2023-10-01T10:30:00Z', author: 'user123' }
        ],
        created_at: '2023-10-01T10:00:00Z'
      }));

      // Mock AI insights
      mockEnv.AI.run.mockResolvedValue({
        response: JSON.stringify({
          engagement_level: 'high',
          participation_balance: 0.67, // user123: 2, lawyer456: 1
          conversation_health: 'good',
          key_topics: ['legal_research', 'case_precedents'],
          sentiment_trend: 'positive',
          recommendations: [
            'Continue current engagement pattern',
            'Consider scheduling follow-up discussion'
          ]
        })
      });

      const insights = await topicSync.generateInsights(topicId);

      expect(insights.success).toBe(true);
      expect(insights.engagement_level).toBe('high');
      expect(insights.participation_balance).toBe(0.67);
      expect(insights.key_topics).toContain('legal_research');
      expect(insights.recommendations).toHaveLength(2);
    });

    it('should identify trending topics', async () => {
      // Mock topic activity data
      mockEnv.SESSIONS.list.mockResolvedValue({
        keys: Array(20).fill(null).map((_, i) => ({ name: `topic:topic-${i}` }))
      });

      // Mock topic data for trend analysis
      const mockTopics = Array(20).fill(null).map((_, i) => ({
        id: `topic-${i}`,
        title: `Topic ${i}`,
        messages: Array(Math.floor(Math.random() * 10) + 1).fill(null).map((_, j) => ({
          timestamp: new Date(Date.now() - Math.random() * 86400000).toISOString()
        })),
        participants: ['user123', 'lawyer456']
      }));

      let callCount = 0;
      mockEnv.SESSIONS.get.mockImplementation(() => {
        return Promise.resolve(JSON.stringify(mockTopics[callCount++]));
      });

      const trends = await topicSync.identifyTrends({
        timeWindow: 86400000, // 24 hours
        minMessages: 3
      });

      expect(trends.trending_topics).toBeDefined();
      expect(trends.analysis_period).toBeDefined();
      expect(trends.total_analyzed).toBe(20);
    });
  });

  describe('Advanced Features', () => {
    it('should support topic branching', async () => {
      const parentTopicId = 'topic-parent';
      const branchPoint = {
        message_id: 'msg-branch-point',
        new_direction: 'alternative_legal_strategy'
      };

      // Mock parent topic
      mockEnv.SESSIONS.get.mockResolvedValue(JSON.stringify({
        id: parentTopicId,
        title: 'Original Legal Strategy',
        messages: [
          { id: 'msg-1', content: 'Initial strategy discussion' },
          { id: 'msg-branch-point', content: 'What about trying a different approach?' },
          { id: 'msg-3', content: 'Continuing original strategy' }
        ]
      }));

      const result = await topicSync.createBranch(parentTopicId, branchPoint);

      expect(result.success).toBe(true);
      expect(result.branch_topic_id).toBeDefined();
      expect(result.branch_topic.title).toContain('alternative_legal_strategy');
      expect(result.branch_point).toBe('msg-branch-point');

      // Should link parent and branch
      expect(result.branch_topic.parent_topic_id).toBe(parentTopicId);
    });

    it('should support topic merging', async () => {
      const topicIds = ['topic-merge-1', 'topic-merge-2'];

      // Mock topics to merge
      mockEnv.SESSIONS.get
        .mockResolvedValueOnce(JSON.stringify({
          id: 'topic-merge-1',
          title: 'Contract Terms A',
          messages: [{ content: 'Message 1A' }, { content: 'Message 2A' }]
        }))
        .mockResolvedValueOnce(JSON.stringify({
          id: 'topic-merge-2',
          title: 'Contract Terms B',
          messages: [{ content: 'Message 1B' }, { content: 'Message 2B' }]
        }));

      const result = await topicSync.mergeTopics(topicIds, {
        merged_title: 'Combined Contract Terms Discussion',
        merge_strategy: 'chronological'
      });

      expect(result.success).toBe(true);
      expect(result.merged_topic_id).toBeDefined();
      expect(result.merged_topic.title).toBe('Combined Contract Terms Discussion');
      expect(result.merged_topic.messages).toHaveLength(4);

      // Original topics should be archived
      expect(result.archived_topics).toEqual(topicIds);
    });

    it('should support automatic topic summarization', async () => {
      const topicId = 'topic-summarize';

      // Mock topic with many messages
      const longTopic = {
        id: topicId,
        title: 'Extended Legal Discussion',
        messages: Array(50).fill(null).map((_, i) => ({
          id: `msg-${i}`,
          content: `Message content ${i} about various legal matters`,
          timestamp: new Date(Date.now() - (50 - i) * 60000).toISOString()
        }))
      };

      mockEnv.SESSIONS.get.mockResolvedValue(JSON.stringify(longTopic));

      // Mock AI summarization
      mockEnv.AI.run.mockResolvedValue({
        response: JSON.stringify({
          summary: 'Discussion covered contract terms, liability clauses, and termination conditions. Key decisions made regarding clause 15 modifications.',
          key_points: [
            'Modified clause 15 for better termination conditions',
            'Agreed on liability cap at $100k',
            'Established 30-day notice period'
          ],
          participants_summary: {
            'user123': 'Focused on business implications',
            'lawyer456': 'Provided legal guidance and precedents'
          },
          confidence: 0.92
        })
      });

      const result = await topicSync.summarizeTopic(topicId, {
        summary_type: 'comprehensive',
        include_decisions: true
      });

      expect(result.success).toBe(true);
      expect(result.summary).toContain('contract terms');
      expect(result.key_points).toHaveLength(3);
      expect(result.participants_summary).toHaveProperty('user123');
      expect(result.confidence).toBe(0.92);
    });
  });

  describe('Performance and Optimization', () => {
    it('should implement efficient vector indexing', async () => {
      const topics = Array(100).fill(null).map((_, i) => ({
        id: `topic-${i}`,
        title: `Topic ${i}`,
        content: `Content for topic ${i} with various keywords and context`
      }));

      // Mock batch embedding generation
      mockEnv.AI.run.mockResolvedValue({
        data: topics.map(() => Array(384).fill(0).map(() => Math.random()))
      });

      const result = await topicSync.batchIndexTopics(topics);

      expect(result.success).toBe(true);
      expect(result.indexed_count).toBe(100);

      // Should use batch upsert for efficiency
      expect(mockEnv.CHITTY_VECTORS.upsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: expect.stringMatching(/^topic-\d+$/),
            values: expect.any(Array)
          })
        ])
      );
    });

    it('should optimize search performance with caching', async () => {
      const query = 'contract review legal analysis';

      // Mock cached result
      mockEnv.SESSIONS.get.mockResolvedValue(JSON.stringify({
        query_hash: 'hash123',
        results: [
          { id: 'topic-1', score: 0.95, title: 'Contract Analysis' }
        ],
        cached_at: new Date(Date.now() - 30000).toISOString() // 30 seconds ago
      }));

      const result = await topicSync.searchWithCache(query, {
        cache_ttl: 300000 // 5 minutes
      });

      expect(result.cache_hit).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].title).toBe('Contract Analysis');

      // Should not call AI or vector search
      expect(mockEnv.AI.run).not.toHaveBeenCalled();
      expect(mockEnv.CHITTY_VECTORS.query).not.toHaveBeenCalled();
    });

    it('should handle high-volume message processing', async () => {
      const topicId = 'topic-high-volume';
      const messages = Array(1000).fill(null).map((_, i) => ({
        content: `Message ${i}`,
        author: `user${i % 10}`,
        timestamp: new Date(Date.now() + i * 1000).toISOString()
      }));

      // Mock existing topic
      mockEnv.SESSIONS.get.mockResolvedValue(JSON.stringify({
        id: topicId,
        title: 'High Volume Topic',
        messages: []
      }));

      const result = await topicSync.batchAddMessages(topicId, messages);

      expect(result.success).toBe(true);
      expect(result.added_count).toBe(1000);
      expect(result.processing_time).toBeDefined();

      // Should use efficient batching
      expect(result.batches_processed).toBeGreaterThan(1);
    });
  });
});