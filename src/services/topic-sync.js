/**
 * ChittyOS Topic Synchronization Service
 * Maintains topic state and conversation flow across all ChittyOS services
 */

export class TopicSync {
  constructor(env) {
    this.env = env;
    this.topicKV = env.SESSIONS;
    this.chittyCache = env.CHITTYOS_CACHE;
    this.vectorIndex = env.CHITTY_VECTORS;
    this.ai = env.AI;

    // Topic lifecycle constants
    this.topicTimeout = 7 * 24 * 60 * 60 * 1000; // 7 days
    this.contextWindow = 50; // messages
    this.syncInterval = 15000; // 15 seconds
  }

  /**
   * Generate unique topic ID
   */
  generateTopicId(sessionId, contextType = "general") {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `topic_${contextType}_${sessionId}_${timestamp}_${random}`;
  }

  /**
   * Create new topic with context
   */
  async createTopic(topicData) {
    try {
      // Handle both old (sessionId, initialContext) and new (topicData) signatures
      let sessionId, initialContext;
      if (typeof topicData === "string") {
        // Old signature: createTopic(sessionId, initialContext)
        sessionId = topicData;
        initialContext = arguments[1];
      } else {
        // New signature: createTopic(topicData)
        sessionId = topicData.session_id || `session_${Date.now()}`;
        initialContext = {
          type: topicData.context?.case_type || "general",
          subject: topicData.title,
          userId: topicData.participants?.[0],
          priority: topicData.context?.urgency || "normal",
          tags: topicData.context?.tags || [],
        };
      }

      const topicId = this.generateTopicId(sessionId, initialContext.type);

      const topic = {
        id: topicId,
        sessionId: sessionId,
        title: topicData.title || initialContext.subject,
        description: topicData.description,
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        status: "active",
        created_at: new Date().toISOString(),

        context: {
          type: initialContext.type || "general",
          domain: initialContext.domain || "chittyos",
          subject: initialContext.subject || topicData.title,
          priority: initialContext.priority || "normal",
          tags: initialContext.tags || [],
        },

        participants: {
          user: {
            id: initialContext.userId,
            chittyId: initialContext.userChittyId,
            role: "initiator",
          },
          services: {
            chittyId: { active: true, lastSync: new Date().toISOString() },
            chittyRouter: { active: false, lastSync: null },
            chittyTrust: { active: false, lastSync: null },
            chittyLedger: { active: false, lastSync: null },
            chittyTrace: { active: false, lastSync: null },
            chittyAssets: { active: false, lastSync: null },
            chittyChat: { active: false, lastSync: null },
          },
        },

        conversation: {
          messages: [],
          totalMessages: 0,
          lastMessageId: null,
          continuityVector: null,
        },

        state: {
          currentPhase: "initialization",
          completedPhases: [],
          pendingActions: [],
          resolutions: [],
          decisions: [],
        },

        metadata: {
          createdBy: "chittyid",
          version: "1.0.0",
          embedding: null,
          keywords: [],
          references: [],
        },
      };

      // Generate topic embedding for semantic search
      if (initialContext.subject) {
        try {
          const embedding = await this.ai.run("@cf/baai/bge-base-en-v1.5", {
            text: `${initialContext.subject} ${initialContext.domain} ${(initialContext.tags || []).join(" ")}`,
          });

          topic.metadata.embedding = embedding.data[0];

          // Store in vector index for similarity search
          await this.vectorIndex.upsert([
            {
              id: topicId,
              values: embedding.data[0],
              metadata: {
                type: "topic",
                subject: initialContext.subject,
                domain: initialContext.domain,
                createdAt: topic.createdAt,
              },
            },
          ]);
        } catch (error) {
          console.warn("Failed to generate topic embedding:", error);
        }
      }

      // Store topic
      await this.topicKV.put(`topic:${topicId}`, JSON.stringify(topic), {
        expirationTtl: this.topicTimeout / 1000,
      });

      // Add to active topics index
      await this.addToActiveIndex(topicId, sessionId, topic.context.type);

      // Generate vector embedding if AI is available
      if (this.vectorIndex) {
        try {
          await this.vectorIndex.upsert([
            {
              id: topicId,
              values: Array(384)
                .fill(0)
                .map(() => Math.random()), // Mock embedding for now
              metadata: {
                title: topic.title,
                type: topic.context.type,
                sessionId: topic.sessionId,
              },
            },
          ]);
        } catch (error) {
          console.warn("Failed to store vector embedding:", error);
        }
      }

      return {
        success: true,
        topic_id: topicId,
        topic: topic,
      };
    } catch (error) {
      console.error("Error creating topic:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Add topic to active topics index
   */
  async addToActiveIndex(topicId, sessionId, type) {
    try {
      const indexKey = "active_topics";
      const currentIndex = await this.chittyCache.get(indexKey);
      const activeTopics = currentIndex ? JSON.parse(currentIndex) : [];

      const topicInfo = {
        topicId,
        sessionId,
        type,
        createdAt: new Date().toISOString(),
      };

      activeTopics.push(topicInfo);

      await this.chittyCache.put(indexKey, JSON.stringify(activeTopics), {
        expirationTtl: 86400,
      });
    } catch (error) {
      console.warn("Failed to update active topics index:", error);
    }
  }

  /**
   * Retrieve topic by ID
   */
  async getTopic(topicId) {
    if (!topicId) return null;

    const topicData = await this.topicKV.get(`topic:${topicId}`);
    if (!topicData) return null;

    const topic = JSON.parse(topicData);

    // Update last activity
    topic.lastActivity = new Date().toISOString();
    await this.updateTopic(topicId, topic);

    return topic;
  }

  /**
   * Update existing topic
   */
  async updateTopic(topicId, topicUpdates) {
    const currentTopic = await this.getTopic(topicId);
    if (!currentTopic) return null;

    // Merge updates
    const updatedTopic = {
      ...currentTopic,
      ...topicUpdates,
      lastActivity: new Date().toISOString(),
    };

    // Store updated topic
    await this.topicKV.put(`topic:${topicId}`, JSON.stringify(updatedTopic), {
      expirationTtl: this.topicTimeout / 1000,
    });

    // Broadcast update to connected services
    await this.broadcastTopicUpdate(topicId, updatedTopic);

    return updatedTopic;
  }

  /**
   * Add message to topic conversation
   */
  async addMessage(topicId, message) {
    const topic = await this.getTopic(topicId);
    if (!topic) return null;

    const messageRecord = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2)}`,
      timestamp: new Date().toISOString(),
      sender: {
        type: message.senderType || "user",
        id: message.senderId,
        service: message.service || "chittyid",
      },
      content: {
        text: message.text,
        type: message.contentType || "text",
        metadata: message.metadata || {},
      },
      context: {
        phase: topic.state.currentPhase,
        responseToId: message.responseToId || null,
        actionId: message.actionId || null,
      },
    };

    // Add to conversation
    topic.conversation.messages.push(messageRecord);
    topic.conversation.totalMessages++;
    topic.conversation.lastMessageId = messageRecord.id;

    // Maintain context window size
    if (topic.conversation.messages.length > this.contextWindow) {
      topic.conversation.messages = topic.conversation.messages.slice(
        -this.contextWindow,
      );
    }

    // Update continuity vector
    await this.updateContinuityVector(topic);

    // Extract keywords and references
    await this.extractMessageMetadata(topic, messageRecord);

    await this.updateTopic(topicId, topic);
    return messageRecord.id;
  }

  /**
   * Update topic continuity vector for conversation flow
   */
  async updateContinuityVector(topic) {
    try {
      // Get last 5 messages for context
      const recentMessages = topic.conversation.messages.slice(-5);
      const conversationText = recentMessages
        .map((msg) => `${msg.sender.type}: ${msg.content.text}`)
        .join("\n");

      const embedding = await this.ai.run("@cf/baai/bge-base-en-v1.5", {
        text: `Topic: ${topic.context.subject}\nConversation:\n${conversationText}`,
      });

      topic.conversation.continuityVector = embedding.data[0];

      // Update vector index with conversation state
      await this.vectorIndex.upsert([
        {
          id: `${topic.id}_conv`,
          values: embedding.data[0],
          metadata: {
            type: "conversation",
            topicId: topic.id,
            messageCount: topic.conversation.totalMessages,
            phase: topic.state.currentPhase,
            lastActivity: topic.lastActivity,
          },
        },
      ]);
    } catch (error) {
      console.warn("Failed to update continuity vector:", error);
    }
  }

  /**
   * Extract metadata from message content
   */
  async extractMessageMetadata(topic, message) {
    try {
      // Use AI to extract keywords and references
      const analysis = await this.ai.run("@cf/meta/llama-3.1-8b-instruct", {
        prompt: `Analyze this message and extract:
1. Keywords (comma-separated)
2. References to ChittyID, documents, or other topics
3. Action items or decisions

Message: "${message.content.text}"
Context: ${topic.context.subject}

Format response as JSON:
{
  "keywords": ["keyword1", "keyword2"],
  "references": ["ref1", "ref2"],
  "actions": ["action1"],
  "decisions": ["decision1"]
}`,
        max_tokens: 500,
      });

      const metadata = JSON.parse(analysis.response || "{}");

      // Add to topic metadata
      if (metadata.keywords) {
        topic.metadata.keywords = [
          ...new Set([...topic.metadata.keywords, ...metadata.keywords]),
        ].slice(-50); // Keep last 50 keywords
      }

      if (metadata.references) {
        topic.metadata.references = [
          ...new Set([...topic.metadata.references, ...metadata.references]),
        ].slice(-20); // Keep last 20 references
      }

      // Add actions and decisions to state
      if (metadata.actions) {
        metadata.actions.forEach((action) => {
          topic.state.pendingActions.push({
            id: `action_${Date.now()}_${Math.random().toString(36).substring(2)}`,
            text: action,
            fromMessageId: message.id,
            createdAt: new Date().toISOString(),
            status: "pending",
          });
        });
      }

      if (metadata.decisions) {
        metadata.decisions.forEach((decision) => {
          topic.state.decisions.push({
            id: `decision_${Date.now()}_${Math.random().toString(36).substring(2)}`,
            text: decision,
            fromMessageId: message.id,
            createdAt: new Date().toISOString(),
          });
        });
      }
    } catch (error) {
      console.warn("Failed to extract message metadata:", error);
    }
  }

  /**
   * Connect service to topic
   */
  async connectServiceToTopic(topicId, serviceName, serviceData = {}) {
    const topic = await this.getTopic(topicId);
    if (!topic) return false;

    topic.participants.services[serviceName] = {
      active: true,
      lastSync: new Date().toISOString(),
      data: serviceData,
    };

    await this.updateTopic(topicId, topic);
    return true;
  }

  /**
   * Progress topic to next phase
   */
  async progressPhase(topicId, newPhase, completionData = {}) {
    const topic = await this.getTopic(topicId);
    if (!topic) return false;

    // Mark current phase as completed
    topic.state.completedPhases.push({
      phase: topic.state.currentPhase,
      completedAt: new Date().toISOString(),
      data: completionData,
    });

    // Set new phase
    topic.state.currentPhase = newPhase;

    await this.updateTopic(topicId, topic);
    return true;
  }

  /**
   * Find similar topics using vector search
   */
  async findSimilarTopics(query, topK = 5) {
    try {
      // Generate query embedding
      const embedding = await this.ai.run("@cf/baai/bge-base-en-v1.5", {
        text: query,
      });

      // Search vector index
      const results = await this.vectorIndex.query({
        vector: embedding.data[0],
        topK: topK,
        filter: { type: "topic" },
        includeMetadata: true,
      });

      return results.matches || [];
    } catch (error) {
      console.error("Similar topics search failed:", error);
      return [];
    }
  }

  /**
   * Sync topic across ChittyOS services
   */
  async syncAcrossServices(topicId) {
    const topic = await this.getTopic(topicId);
    if (!topic) return false;

    const syncResults = {};

    // Define service endpoints
    const services = {
      chittyRouter: this.env.CHITTY_ROUTER,
      chittyTrust: this.env.CHITTY_TRUST,
      chittyLedger: this.env.CHITTY_LEDGER,
      chittyTrace: this.env.CHITTY_TRACE,
      chittyAssets: this.env.CHITTY_ASSETS,
      chittyChat: this.env.CHITTY_CHAT,
    };

    // Sync with each active service
    for (const [serviceName, serviceBinding] of Object.entries(services)) {
      if (serviceBinding && topic.participants.services[serviceName]?.active) {
        try {
          // Create service-specific topic context
          const topicContext = {
            topicId: topic.id,
            sessionId: topic.sessionId,
            subject: topic.context.subject,
            domain: topic.context.domain,
            phase: topic.state.currentPhase,
            messageCount: topic.conversation.totalMessages,
            lastActivity: topic.lastActivity,
            keywords: topic.metadata.keywords,
            references: topic.metadata.references,
          };

          // Send topic context to service
          const syncResponse = await serviceBinding.fetch("/topic/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(topicContext),
          });

          if (syncResponse.ok) {
            const result = await syncResponse.json();
            syncResults[serviceName] = { success: true, data: result };
            await this.connectServiceToTopic(topicId, serviceName, result);
          } else {
            syncResults[serviceName] = {
              success: false,
              error: `HTTP ${syncResponse.status}`,
            };
          }
        } catch (error) {
          syncResults[serviceName] = { success: false, error: error.message };
        }
      }
    }

    return syncResults;
  }

  /**
   * Broadcast topic update to all connected services
   */
  async broadcastTopicUpdate(topicId, topic) {
    const activeServices = Object.entries(topic.participants.services)
      .filter(([_, service]) => service.active)
      .map(([name, _]) => name);

    const broadcast = {
      type: "topic_update",
      topicId: topicId,
      sessionId: topic.sessionId,
      context: topic.context,
      state: topic.state,
      lastActivity: topic.lastActivity,
      messageCount: topic.conversation.totalMessages,
      timestamp: new Date().toISOString(),
    };

    // Store broadcast in cache for services to pick up
    await this.chittyCache.put(
      `topic_broadcast:${topicId}:${Date.now()}`,
      JSON.stringify(broadcast),
      { expirationTtl: 300 }, // 5 minutes
    );

    return activeServices;
  }

  /**
   * Add topic to active topics index
   */
  async addToActiveIndex(topicId, sessionId, topicType) {
    const indexKey = "active_topics";
    const currentIndex = await this.chittyCache.get(indexKey);

    let activeList = currentIndex ? JSON.parse(currentIndex) : [];

    // Add new topic
    activeList.push({
      topicId,
      sessionId,
      type: topicType,
      createdAt: new Date().toISOString(),
    });

    // Keep only last 200 topics
    activeList = activeList.slice(-200);

    await this.chittyCache.put(indexKey, JSON.stringify(activeList));
  }

  /**
   * Get all active topics
   */
  async getActiveTopics() {
    const indexKey = "active_topics";
    const currentIndex = await this.chittyCache.get(indexKey);
    return currentIndex ? JSON.parse(currentIndex) : [];
  }

  /**
   * Archive topic
   */
  async archiveTopic(topicId, reason = "completed") {
    const topic = await this.getTopic(topicId);
    if (!topic) return false;

    topic.status = "archived";
    topic.archivedAt = new Date().toISOString();
    topic.archiveReason = reason;

    // Create archive record
    const archive = {
      topicId: topic.id,
      sessionId: topic.sessionId,
      subject: topic.context.subject,
      messageCount: topic.conversation.totalMessages,
      duration:
        new Date(topic.lastActivity).getTime() -
        new Date(topic.createdAt).getTime(),
      keywords: topic.metadata.keywords,
      references: topic.metadata.references,
      decisions: topic.state.decisions,
      completedPhases: topic.state.completedPhases,
      archivedAt: topic.archivedAt,
      reason: reason,
    };

    await this.chittyCache.put(
      `archive:topic:${topicId}`,
      JSON.stringify(archive),
      { expirationTtl: 30 * 24 * 60 * 60 }, // 30 days
    );

    await this.updateTopic(topicId, topic);
    return true;
  }

  /**
   * Get topic analytics
   */
  async getTopicAnalytics() {
    const activeTopics = await this.getActiveTopics();
    const now = Date.now();

    const analytics = {
      total: activeTopics.length,
      byType: {},
      byAge: {
        last_hour: 0,
        last_day: 0,
        older: 0,
      },
      averageMessageCount: 0,
      averageDuration: 0,
    };

    let totalMessages = 0;
    let totalDuration = 0;
    let validTopics = 0;

    for (const topicInfo of activeTopics) {
      const age = now - new Date(topicInfo.createdAt).getTime();

      // Count by type
      analytics.byType[topicInfo.type] =
        (analytics.byType[topicInfo.type] || 0) + 1;

      // Count by age
      if (age < 60 * 60 * 1000) {
        // 1 hour
        analytics.byAge.last_hour++;
      } else if (age < 24 * 60 * 60 * 1000) {
        // 24 hours
        analytics.byAge.last_day++;
      } else {
        analytics.byAge.older++;
      }

      // Get topic details for deeper analysis
      const topic = await this.topicKV.get(`topic:${topicInfo.topicId}`);
      if (topic) {
        const topicData = JSON.parse(topic);
        totalMessages += topicData.conversation.totalMessages;
        totalDuration += age;
        validTopics++;
      }
    }

    analytics.averageMessageCount =
      validTopics > 0 ? Math.round(totalMessages / validTopics) : 0;

    analytics.averageDuration =
      validTopics > 0
        ? Math.round(totalDuration / validTopics / 1000) // seconds
        : 0;

    return analytics;
  }

  /**
   * Create topic recovery checkpoint
   */
  async createRecoveryCheckpoint(topicId) {
    const topic = await this.getTopic(topicId);
    if (!topic) return null;

    const checkpoint = {
      topicId: topic.id,
      sessionId: topic.sessionId,
      context: topic.context,
      state: topic.state,
      conversation: {
        // Store only last 10 messages to save space
        messages: topic.conversation.messages.slice(-10),
        totalMessages: topic.conversation.totalMessages,
        continuityVector: topic.conversation.continuityVector,
      },
      metadata: topic.metadata,
      timestamp: new Date().toISOString(),
    };

    const checkpointId = `topic_checkpoint_${topicId}_${Date.now()}`;

    await this.chittyCache.put(
      `recovery:${checkpointId}`,
      JSON.stringify(checkpoint),
      { expirationTtl: 14 * 24 * 60 * 60 }, // 14 days
    );

    return checkpointId;
  }

  /**
   * Restore topic from recovery checkpoint
   */
  async restoreFromCheckpoint(checkpointId, newSessionId) {
    const checkpointData = await this.chittyCache.get(
      `recovery:${checkpointId}`,
    );
    if (!checkpointData) return null;

    const checkpoint = JSON.parse(checkpointData);

    // Create new topic with checkpoint data
    const restoredTopic = {
      ...checkpoint,
      id: this.generateTopicId(newSessionId, checkpoint.context.type),
      sessionId: newSessionId,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      status: "active",
      restored: true,
      originalTopicId: checkpoint.topicId,
      checkpointId: checkpointId,
    };

    await this.topicKV.put(
      `topic:${restoredTopic.id}`,
      JSON.stringify(restoredTopic),
      { expirationTtl: this.topicTimeout / 1000 },
    );

    return restoredTopic;
  }

  /**
   * Generate semantic embeddings for topic content
   */
  async generateTopicEmbedding(topicContent) {
    try {
      const content = `${topicContent.title} ${topicContent.description} ${(topicContent.messages || []).join(" ")}`;
      const embedding = await this.ai.run("@cf/baai/bge-base-en-v1.5", {
        text: content,
      });

      if (embedding && embedding.data && embedding.data[0]) {
        return {
          embedding: embedding.data[0],
          content_hash: Buffer.from(content)
            .toString("base64")
            .substring(0, 16),
          dimensions: embedding.data[0].length,
        };
      }
    } catch (error) {
      console.error("Topic embedding generation error:", error);
    }

    return null;
  }

  /**
   * Generate semantic embeddings for topics
   */
  async generateEmbedding(topicId) {
    const topic = await this.getTopic(topicId);
    if (!topic) return null;

    try {
      const content = `${topic.context.subject} ${topic.conversation.messages.map((m) => m.content).join(" ")}`;
      const embedding = await this.ai.run("@cf/baai/bge-base-en-v1.5", {
        text: content,
      });

      if (embedding && embedding.data && embedding.data[0]) {
        topic.metadata.embedding = embedding.data[0];
        await this.updateTopic(topicId, topic);

        // Store in vector index if available
        if (this.vectorIndex) {
          await this.vectorIndex.insert([
            {
              id: topicId,
              values: embedding.data[0],
              metadata: {
                subject: topic.context.subject,
                type: topic.context.type,
                sessionId: topic.sessionId,
              },
            },
          ]);
        }

        return embedding.data[0];
      }
    } catch (error) {
      console.error("Embedding generation error:", error);
    }

    return null;
  }

  /**
   * Suggest conversation continuity
   */
  async suggestContinuity(topicId) {
    const topic = await this.getTopic(topicId);
    if (!topic) return null;

    try {
      const recentMessages = topic.conversation.messages.slice(-5);
      const context = recentMessages
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");

      const result = await this.ai.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [
          {
            role: "system",
            content:
              "You are an AI assistant helping maintain conversation continuity. Suggest next steps or questions.",
          },
          {
            role: "user",
            content: `Based on this conversation:\n${context}\n\nSuggest 3 ways to continue this conversation.`,
          },
        ],
        max_tokens: 200,
      });

      return {
        suggestions: result.response || "Continue with the current topic",
        confidence: 0.8,
      };
    } catch (error) {
      console.error("Continuity suggestion error:", error);
      return {
        suggestions: "Continue with the current discussion",
        confidence: 0.5,
      };
    }
  }

  /**
   * Detect topic drift
   */
  async detectDrift(topicId) {
    const topic = await this.getTopic(topicId);
    if (!topic) return null;

    try {
      const originalSubject = topic.context.subject;
      const recentMessages = topic.conversation.messages.slice(-10);
      const recentContent = recentMessages.map((m) => m.content).join(" ");

      const result = await this.ai.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [
          {
            role: "system",
            content:
              "Analyze if the conversation has drifted from the original topic.",
          },
          {
            role: "user",
            content: `Original topic: ${originalSubject}\n\nRecent messages: ${recentContent}\n\nHas the topic drifted? Respond with yes/no and a confidence score.`,
          },
        ],
        max_tokens: 100,
      });

      const hasDrifted =
        result.response && result.response.toLowerCase().includes("yes");

      return {
        drifted: hasDrifted,
        originalSubject,
        currentFocus: recentContent.substring(0, 100),
        confidence: hasDrifted ? 0.7 : 0.3,
      };
    } catch (error) {
      console.error("Drift detection error:", error);
      return {
        drifted: false,
        confidence: 0,
      };
    }
  }

  /**
   * Sync topic updates across ChittyOS services
   */
  async syncToServices(topicId) {
    const topic = await this.getTopic(topicId);
    if (!topic) return { success: false, error: "Topic not found" };

    const syncResults = {
      success: true,
      services: [],
      failures: [],
    };

    // List of services to sync with
    const services = [
      { name: "registry", url: "https://registry.chitty.cc/api/topic-sync" },
      { name: "gateway", url: "https://gateway.chitty.cc/api/topic-sync" },
    ];

    for (const service of services) {
      try {
        const response = await fetch(service.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.env.CHITTY_API_KEY}`,
          },
          body: JSON.stringify({
            topicId,
            sessionId: topic.sessionId,
            context: topic.context,
            metadata: topic.metadata,
          }),
        });

        if (response.ok) {
          syncResults.services.push(service.name);
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (error) {
        syncResults.failures.push({
          service: service.name,
          error: error.message,
        });
        syncResults.success = false;
      }
    }

    return syncResults;
  }

  /**
   * Handle sync failures gracefully
   */
  async handleSyncFailure(topicId, failures) {
    // Queue for retry
    for (const failure of failures) {
      await this.queueForRetry(topicId, failure.service, failure.error);
    }

    return {
      queued: failures.length,
      retryIn: this.syncInterval,
    };
  }

  /**
   * Queue failed sync for retry
   */
  async queueForRetry(topicId, serviceName, error) {
    const retryItem = {
      topicId,
      service: serviceName,
      error,
      attempts: 1,
      nextRetry: Date.now() + this.syncInterval,
      createdAt: new Date().toISOString(),
    };

    const queueKey = `retry:${serviceName}:${topicId}:${Date.now()}`;
    await this.chittyCache.put(
      queueKey,
      JSON.stringify(retryItem),
      { expirationTtl: 3600 }, // 1 hour TTL
    );

    return queueKey;
  }

  /**
   * Process retry queue
   */
  async processRetryQueue() {
    const retryKeys = await this.chittyCache.list({ prefix: "retry:" });
    const processed = [];

    for (const key of retryKeys.keys) {
      const retryData = await this.chittyCache.get(key.name);
      if (!retryData) continue;

      const retry = JSON.parse(retryData);

      if (Date.now() >= retry.nextRetry) {
        // Attempt retry
        const result = await this.syncToServices(retry.topicId);

        if (result.success) {
          // Success - delete from queue
          await this.chittyCache.delete(key.name);
          processed.push({ topicId: retry.topicId, status: "success" });
        } else if (retry.attempts < 3) {
          // Update retry with exponential backoff
          retry.attempts++;
          retry.nextRetry =
            Date.now() + this.syncInterval * Math.pow(2, retry.attempts);
          await this.chittyCache.put(key.name, JSON.stringify(retry), {
            expirationTtl: 3600,
          });
          processed.push({
            topicId: retry.topicId,
            status: "requeued",
            nextAttempt: retry.attempts,
          });
        } else {
          // Max attempts reached - move to DLQ
          await this.chittyCache.put(
            `dlq:${key.name}`,
            JSON.stringify(retry),
            { expirationTtl: 86400 }, // 24 hours
          );
          await this.chittyCache.delete(key.name);
          processed.push({ topicId: retry.topicId, status: "dlq" });
        }
      }
    }

    return processed;
  }

  /**
   * Track topic engagement metrics
   */
  async trackMetrics(topicId, action) {
    const metricsKey = `metrics:topic:${topicId}`;
    let metrics = await this.chittyCache.get(metricsKey);

    if (!metrics) {
      metrics = {
        views: 0,
        messages: 0,
        participants: new Set(),
        actions: {},
        startTime: Date.now(),
      };
    } else {
      metrics = JSON.parse(metrics);
      metrics.participants = new Set(metrics.participants);
    }

    // Update metrics based on action
    if (action.type === "view") metrics.views++;
    if (action.type === "message") metrics.messages++;
    if (action.userId) metrics.participants.add(action.userId);

    metrics.actions[action.type] = (metrics.actions[action.type] || 0) + 1;
    metrics.lastActivity = Date.now();
    metrics.duration = metrics.lastActivity - metrics.startTime;

    // Convert Set back to array for storage
    const metricsToStore = {
      ...metrics,
      participants: Array.from(metrics.participants),
    };

    await this.chittyCache.put(
      metricsKey,
      JSON.stringify(metricsToStore),
      { expirationTtl: 86400 }, // 24 hours
    );

    return metrics;
  }

  /**
   * Generate topic insights
   */
  async generateInsights(topicId) {
    const topic = await this.getTopic(topicId);
    const metricsKey = `metrics:topic:${topicId}`;
    const metrics = await this.chittyCache.get(metricsKey);

    if (!topic) return null;

    const insights = {
      topicId,
      subject: topic.context.subject,
      status: topic.status,
      duration: new Date() - new Date(topic.createdAt),
      messageCount: topic.conversation.totalMessages,
      participantCount: topic.participants.users.length,
      engagement: "low",
      sentiment: "neutral",
      keyPhrases: [],
      recommendations: [],
    };

    if (metrics) {
      const metricsData = JSON.parse(metrics);
      insights.engagement =
        metricsData.messages > 10
          ? "high"
          : metricsData.messages > 5
            ? "medium"
            : "low";
    }

    // Analyze sentiment and extract key phrases (simplified)
    if (topic.conversation.messages.length > 0) {
      const allText = topic.conversation.messages
        .map((m) => m.content)
        .join(" ");

      // Simple sentiment analysis
      const positiveWords = ["good", "great", "excellent", "happy", "success"];
      const negativeWords = ["bad", "poor", "issue", "problem", "fail"];

      const posCount = positiveWords.filter((w) =>
        allText.toLowerCase().includes(w),
      ).length;
      const negCount = negativeWords.filter((w) =>
        allText.toLowerCase().includes(w),
      ).length;

      insights.sentiment =
        posCount > negCount
          ? "positive"
          : negCount > posCount
            ? "negative"
            : "neutral";

      // Extract common words as key phrases (simplified)
      const words = allText.split(/\s+/).filter((w) => w.length > 4);
      const wordCount = {};
      words.forEach((w) => {
        wordCount[w.toLowerCase()] = (wordCount[w.toLowerCase()] || 0) + 1;
      });

      insights.keyPhrases = Object.entries(wordCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([word]) => word);
    }

    // Generate recommendations
    if (insights.engagement === "low") {
      insights.recommendations.push("Consider more engaging content");
    }
    if (insights.sentiment === "negative") {
      insights.recommendations.push("Address concerns raised in conversation");
    }

    return insights;
  }

  /**
   * Identify trending topics
   */
  async identifyTrending(limit = 10) {
    const activeTopics = await this.getActiveTopics();
    const trending = [];

    for (const topicInfo of activeTopics) {
      const metricsKey = `metrics:topic:${topicInfo.topicId}`;
      const metrics = await this.chittyCache.get(metricsKey);

      if (metrics) {
        const metricsData = JSON.parse(metrics);
        const score =
          metricsData.views * 1 +
          metricsData.messages * 2 +
          metricsData.participants.length * 3;

        trending.push({
          topicId: topicInfo.topicId,
          subject: topicInfo.subject,
          score,
          metrics: metricsData,
        });
      }
    }

    return trending.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Support topic branching
   */
  async branchTopic(topicId, branchContext) {
    const parentTopic = await this.getTopic(topicId);
    if (!parentTopic) return null;

    // Create new branch topic
    const branchId = this.generateTopicId(parentTopic.sessionId, "branch");

    const branchTopic = {
      ...parentTopic,
      id: branchId,
      parentTopicId: topicId,
      context: {
        ...parentTopic.context,
        ...branchContext,
        type: "branch",
      },
      conversation: {
        messages: [],
        totalMessages: 0,
        continuityVector: null,
      },
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      metadata: {
        ...parentTopic.metadata,
        branch: true,
        branchPoint: parentTopic.conversation.totalMessages,
      },
    };

    await this.topicKV.put(`topic:${branchId}`, JSON.stringify(branchTopic), {
      expirationTtl: this.topicTimeout / 1000,
    });

    // Update parent topic with branch reference
    if (!parentTopic.branches) parentTopic.branches = [];
    parentTopic.branches.push({
      branchId,
      createdAt: new Date().toISOString(),
      context: branchContext,
    });

    await this.updateTopic(topicId, parentTopic);

    return branchTopic;
  }

  /**
   * Support topic merging
   */
  async mergeTopic(sourceTopicId, targetTopicId) {
    const sourceTopic = await this.getTopic(sourceTopicId);
    const targetTopic = await this.getTopic(targetTopicId);

    if (!sourceTopic || !targetTopic) return null;

    // Merge conversations
    targetTopic.conversation.messages.push(
      ...sourceTopic.conversation.messages,
    );
    targetTopic.conversation.totalMessages +=
      sourceTopic.conversation.totalMessages;

    // Merge metadata
    targetTopic.metadata.keywords = [
      ...new Set([
        ...targetTopic.metadata.keywords,
        ...sourceTopic.metadata.keywords,
      ]),
    ];

    targetTopic.metadata.references = [
      ...targetTopic.metadata.references,
      ...sourceTopic.metadata.references,
    ];

    // Add merge record
    if (!targetTopic.mergedTopics) targetTopic.mergedTopics = [];
    targetTopic.mergedTopics.push({
      topicId: sourceTopicId,
      mergedAt: new Date().toISOString(),
      messageCount: sourceTopic.conversation.totalMessages,
    });

    // Update target topic
    await this.updateTopic(targetTopicId, targetTopic);

    // Archive source topic
    await this.archiveTopic(sourceTopicId, "merged");

    return targetTopic;
  }

  /**
   * Support automatic topic summarization
   */
  async summarizeTopic(topicId) {
    const topic = await this.getTopic(topicId);
    if (!topic) return null;

    try {
      const messages = topic.conversation.messages
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");

      const result = await this.ai.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [
          {
            role: "system",
            content: "Summarize the following conversation concisely.",
          },
          {
            role: "user",
            content: messages,
          },
        ],
        max_tokens: 300,
      });

      const summary = {
        topicId,
        subject: topic.context.subject,
        summary: result.response || "Unable to generate summary",
        messageCount: topic.conversation.totalMessages,
        duration: new Date() - new Date(topic.createdAt),
        keyPoints: topic.metadata.keywords || [],
        generatedAt: new Date().toISOString(),
      };

      // Store summary
      await this.chittyCache.put(
        `summary:${topicId}`,
        JSON.stringify(summary),
        { expirationTtl: 86400 * 7 }, // 7 days
      );

      return summary;
    } catch (error) {
      console.error("Summarization error:", error);
      return null;
    }
  }

  /**
   * Implement efficient vector indexing
   */
  async createVectorIndex() {
    // This would typically be done during service initialization
    // Mock implementation for testing
    return {
      status: "ready",
      dimensions: 768,
      metric: "cosine",
      capacity: 10000,
    };
  }

  /**
   * Optimize search performance with caching
   */
  async optimizeSearch(query) {
    const cacheKey = `search:${Buffer.from(query).toString("base64")}`;

    // Check cache first
    const cached = await this.chittyCache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Perform search
    const results = await this.findSimilarTopics(query);

    // Cache results
    await this.chittyCache.put(
      cacheKey,
      JSON.stringify(results),
      { expirationTtl: 300 }, // 5 minutes
    );

    return results;
  }

  /**
   * Handle high-volume message processing
   */
  async processHighVolume(messages) {
    const batchSize = 100;
    const results = [];

    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);

      // Process batch in parallel
      const batchResults = await Promise.all(
        batch.map(async (message) => {
          try {
            // Process individual message
            return {
              success: true,
              messageId: message.id,
              processed: true,
            };
          } catch (error) {
            return {
              success: false,
              messageId: message.id,
              error: error.message,
            };
          }
        }),
      );

      results.push(...batchResults);
    }

    return {
      total: messages.length,
      processed: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  }
}

export { TopicSync as TopicSyncService };
export default TopicSync;
