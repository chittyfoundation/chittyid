/**
 * Notion Webhook Service
 * Handles real-time synchronization through Notion webhooks
 */

import crypto from 'crypto';

export class NotionWebhookService {
  constructor(env) {
    this.env = env;
    this.verificationToken = env.NOTION_WEBHOOK_VERIFICATION_TOKEN;
    this.webhookSecret = env.NOTION_WEBHOOK_SECRET;

    // Event handlers
    this.eventHandlers = {
      'page.content_updated': this.handlePageUpdate.bind(this),
      'page.created': this.handlePageCreated.bind(this),
      'page.deleted': this.handlePageDeleted.bind(this),
      'data_source.schema_updated': this.handleSchemaUpdate.bind(this),
      'comment.created': this.handleComment.bind(this)
    };

    // Metrics
    this.metrics = {
      webhooks_received: 0,
      webhooks_processed: 0,
      webhooks_failed: 0,
      events_by_type: {}
    };
  }

  /**
   * Process incoming webhook from Notion
   */
  async processWebhook(request) {
    try {
      // Verify webhook authenticity
      const verification = await this.verifyWebhook(request);
      if (!verification.valid) {
        return {
          success: false,
          error: 'Invalid webhook signature',
          status: 401
        };
      }

      const payload = await request.json();
      this.metrics.webhooks_received++;

      // Log webhook event
      await this.logWebhookEvent(payload);

      // Handle based on event type
      const eventType = payload.type || payload.event_type;
      const handler = this.eventHandlers[eventType];

      if (!handler) {
        console.warn(`Unhandled webhook event type: ${eventType}`);
        return {
          success: true,
          message: `Event type ${eventType} acknowledged but not processed`
        };
      }

      // Process the event
      const result = await handler(payload);

      // Track metrics
      this.metrics.webhooks_processed++;
      this.metrics.events_by_type[eventType] = (this.metrics.events_by_type[eventType] || 0) + 1;

      // Store metrics
      await this.storeMetrics();

      return {
        success: true,
        eventType,
        result
      };

    } catch (error) {
      console.error('Webhook processing error:', error);
      this.metrics.webhooks_failed++;

      // Store error in DLQ for retry
      await this.storeInDLQ(request, error);

      return {
        success: false,
        error: error.message,
        status: 500
      };
    }
  }

  /**
   * Verify webhook signature using HMAC-SHA256
   */
  async verifyWebhook(request) {
    // Get signature from headers
    const signature = request.headers.get('X-Notion-Signature');
    const timestamp = request.headers.get('X-Notion-Timestamp');

    if (!signature || !timestamp) {
      return { valid: false, reason: 'Missing signature headers' };
    }

    // Check timestamp to prevent replay attacks (within 5 minutes)
    const currentTime = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTime - parseInt(timestamp)) > 300) {
      return { valid: false, reason: 'Timestamp too old' };
    }

    // Get request body
    const body = await request.text();

    // Calculate expected signature
    const message = `${timestamp}.${body}`;
    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(message)
      .digest('hex');

    // Compare signatures
    const valid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );

    return { valid, body: JSON.parse(body) };
  }

  /**
   * Handle page content update events
   */
  async handlePageUpdate(payload) {
    const pageId = payload.data?.page_id || payload.page?.id;

    if (!pageId) {
      throw new Error('Page ID missing from webhook payload');
    }

    // Get the updated page from Notion
    const updatedPage = await this.fetchPageFromNotion(pageId);

    // Check if it's an AtomicFact
    if (this.isAtomicFact(updatedPage)) {
      // Extract fact data
      const fact = this.extractFactFromPage(updatedPage);

      // Update in KV store
      await this.env.CHITTY_IDS.put(
        `fact:${fact.factId}`,
        JSON.stringify({
          ...fact,
          lastUpdated: new Date().toISOString(),
          syncedFromWebhook: true
        }),
        { expirationTtl: 86400 * 30 } // 30 days
      );

      // Trigger downstream processing
      await this.triggerFactProcessing(fact);

      return {
        processed: true,
        factId: fact.factId,
        action: 'updated'
      };
    }

    return {
      processed: false,
      reason: 'Not an AtomicFact'
    };
  }

  /**
   * Handle page creation events
   */
  async handlePageCreated(payload) {
    const pageId = payload.data?.page_id || payload.page?.id;

    // Fetch the new page
    const newPage = await this.fetchPageFromNotion(pageId);

    if (this.isAtomicFact(newPage)) {
      const fact = this.extractFactFromPage(newPage);

      // Store new fact
      await this.env.CHITTY_IDS.put(
        `fact:${fact.factId}`,
        JSON.stringify({
          ...fact,
          createdAt: new Date().toISOString(),
          syncedFromWebhook: true
        })
      );

      // Generate ChittyID if needed
      if (!fact.chittyId) {
        await this.requestChittyIdForFact(fact);
      }

      return {
        processed: true,
        factId: fact.factId,
        action: 'created'
      };
    }

    return {
      processed: false,
      reason: 'Not an AtomicFact'
    };
  }

  /**
   * Handle page deletion events
   */
  async handlePageDeleted(payload) {
    const pageId = payload.data?.page_id || payload.page?.id;

    // Mark as deleted in KV (don't actually delete for audit trail)
    const factKey = await this.findFactKeyByPageId(pageId);

    if (factKey) {
      const fact = await this.env.CHITTY_IDS.get(factKey);
      if (fact) {
        const factData = JSON.parse(fact);
        await this.env.CHITTY_IDS.put(
          factKey,
          JSON.stringify({
            ...factData,
            deleted: true,
            deletedAt: new Date().toISOString()
          })
        );

        return {
          processed: true,
          factId: factData.factId,
          action: 'deleted'
        };
      }
    }

    return {
      processed: false,
      reason: 'Fact not found'
    };
  }

  /**
   * Handle database schema updates
   */
  async handleSchemaUpdate(payload) {
    const databaseId = payload.data?.database_id;

    if (databaseId === this.env.NOTION_DATABASE_ID_ATOMIC_FACTS) {
      // Schema changed for AtomicFacts database
      console.log('AtomicFacts database schema updated');

      // Clear any cached schema information
      await this.env.PLATFORM_CACHE.delete('notion:schema:atomic_facts');

      // Refetch and cache new schema
      const schema = await this.fetchDatabaseSchema(databaseId);
      await this.env.PLATFORM_CACHE.put(
        'notion:schema:atomic_facts',
        JSON.stringify(schema),
        { expirationTtl: 86400 }
      );

      return {
        processed: true,
        action: 'schema_updated',
        databaseId
      };
    }

    return {
      processed: false,
      reason: 'Not AtomicFacts database'
    };
  }

  /**
   * Handle comment creation events
   */
  async handleComment(payload) {
    const pageId = payload.data?.page_id;
    const comment = payload.data?.comment;

    if (!pageId || !comment) {
      return { processed: false, reason: 'Missing data' };
    }

    // Check if comment mentions specific keywords
    const triggers = ['@sync', '@validate', '@chittyid'];
    const shouldProcess = triggers.some(trigger =>
      comment.text?.toLowerCase().includes(trigger)
    );

    if (shouldProcess) {
      // Trigger appropriate action based on comment
      if (comment.text.includes('@sync')) {
        await this.forceSyncPage(pageId);
      }
      if (comment.text.includes('@validate')) {
        await this.validateFactData(pageId);
      }
      if (comment.text.includes('@chittyid')) {
        await this.requestChittyIdForPage(pageId);
      }

      return {
        processed: true,
        action: 'comment_triggered',
        pageId
      };
    }

    return {
      processed: false,
      reason: 'No trigger keywords'
    };
  }

  /**
   * Fetch page from Notion API
   */
  async fetchPageFromNotion(pageId) {
    const response = await fetch(
      `https://api.notion.com/v1/pages/${pageId}`,
      {
        headers: {
          'Authorization': `Bearer ${this.env.NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch page: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Fetch database schema
   */
  async fetchDatabaseSchema(databaseId) {
    const response = await fetch(
      `https://api.notion.com/v1/databases/${databaseId}`,
      {
        headers: {
          'Authorization': `Bearer ${this.env.NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch database schema: ${response.status}`);
    }

    const data = await response.json();
    return data.properties;
  }

  /**
   * Check if a Notion page is an AtomicFact
   */
  isAtomicFact(page) {
    // Check if page belongs to AtomicFacts database
    const databaseId = page.parent?.database_id;
    if (databaseId !== this.env.NOTION_DATABASE_ID_ATOMIC_FACTS) {
      return false;
    }

    // Check for required properties
    const requiredProps = ['Fact ID', 'Fact Text'];
    return requiredProps.every(prop => page.properties?.[prop]);
  }

  /**
   * Extract AtomicFact data from Notion page
   */
  extractFactFromPage(page) {
    const props = page.properties;

    return {
      factId: this.getPropertyValue(props['Fact ID']),
      parentArtifactId: this.getPropertyValue(props['Parent Artifact ID']),
      factText: this.getPropertyValue(props['Fact Text']),
      factType: this.getPropertyValue(props['Fact Type']),
      locationRef: this.getPropertyValue(props['Location Reference']),
      classification: this.getPropertyValue(props['Classification']),
      weight: this.getPropertyValue(props['Weight']),
      credibility: this.getPropertyValue(props['Credibility Factors']),
      chainStatus: this.getPropertyValue(props['Chain Status']),
      verifiedAt: this.getPropertyValue(props['Verified At']),
      verificationMethod: this.getPropertyValue(props['Verification Method']),
      chittyId: this.getPropertyValue(props['ChittyID']),
      notionPageId: page.id,
      lastEditedTime: page.last_edited_time
    };
  }

  /**
   * Get property value from Notion property object
   */
  getPropertyValue(property) {
    if (!property) return null;

    switch (property.type) {
      case 'title':
        return property.title[0]?.text?.content || null;
      case 'rich_text':
        return property.rich_text[0]?.text?.content || null;
      case 'number':
        return property.number;
      case 'select':
        return property.select?.name || null;
      case 'multi_select':
        return property.multi_select?.map(s => s.name) || [];
      case 'date':
        return property.date?.start || null;
      case 'checkbox':
        return property.checkbox;
      case 'url':
        return property.url;
      default:
        return null;
    }
  }

  /**
   * Find fact key by Notion page ID
   */
  async findFactKeyByPageId(pageId) {
    // List all fact keys and find matching one
    const list = await this.env.CHITTY_IDS.list({ prefix: 'fact:' });

    for (const key of list.keys) {
      const fact = await this.env.CHITTY_IDS.get(key.name);
      if (fact) {
        const data = JSON.parse(fact);
        if (data.notionPageId === pageId) {
          return key.name;
        }
      }
    }

    return null;
  }

  /**
   * Trigger downstream processing for a fact
   */
  async triggerFactProcessing(fact) {
    // Notify other services about the update
    const services = [
      'https://ledger.chitty.cc/api/facts/update',
      'https://evidence.chitty.cc/api/facts/sync',
      'https://chain.chitty.cc/api/facts/mint'
    ];

    const promises = services.map(service =>
      fetch(service, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.env.SERVICE_TOKEN}`
        },
        body: JSON.stringify(fact)
      }).catch(err => console.error(`Failed to notify ${service}:`, err))
    );

    await Promise.allSettled(promises);
  }

  /**
   * Request ChittyID for a fact
   */
  async requestChittyIdForFact(fact) {
    try {
      const response = await fetch('https://id.chitty.cc/api/get-chittyid?for=atomic-fact', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.env.SERVICE_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const { chittyId } = await response.json();

        // Update fact with ChittyID
        fact.chittyId = chittyId;
        await this.env.CHITTY_IDS.put(
          `fact:${fact.factId}`,
          JSON.stringify(fact)
        );

        // Update Notion page
        await this.updateNotionPage(fact.notionPageId, {
          'ChittyID': { rich_text: [{ text: { content: chittyId } }] }
        });

        return chittyId;
      }
    } catch (error) {
      console.error('Failed to request ChittyID:', error);
    }

    return null;
  }

  /**
   * Update Notion page properties
   */
  async updateNotionPage(pageId, properties) {
    const response = await fetch(
      `https://api.notion.com/v1/pages/${pageId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${this.env.NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ properties })
      }
    );

    return response.ok;
  }

  /**
   * Store webhook event for audit
   */
  async logWebhookEvent(payload) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      eventType: payload.type || payload.event_type,
      pageId: payload.data?.page_id,
      payload: JSON.stringify(payload)
    };

    await this.env.PLATFORM_CACHE.put(
      `webhook:log:${Date.now()}`,
      JSON.stringify(logEntry),
      { expirationTtl: 86400 * 7 } // Keep logs for 7 days
    );
  }

  /**
   * Store failed webhook in DLQ
   */
  async storeInDLQ(request, error) {
    const dlqEntry = {
      timestamp: new Date().toISOString(),
      error: error.message,
      headers: Object.fromEntries(request.headers),
      body: await request.text().catch(() => 'Could not read body'),
      attempts: 1
    };

    await this.env.PLATFORM_CACHE.put(
      `dlq:webhook:${Date.now()}`,
      JSON.stringify(dlqEntry),
      { expirationTtl: 86400 * 3 } // Keep for 3 days
    );
  }

  /**
   * Store metrics
   */
  async storeMetrics() {
    await this.env.PLATFORM_CACHE.put(
      'metrics:notion:webhooks',
      JSON.stringify({
        ...this.metrics,
        lastUpdated: new Date().toISOString()
      }),
      { expirationTtl: 86400 * 7 }
    );
  }

  /**
   * Force sync a specific page
   */
  async forceSyncPage(pageId) {
    const page = await this.fetchPageFromNotion(pageId);
    if (this.isAtomicFact(page)) {
      const fact = this.extractFactFromPage(page);
      await this.env.CHITTY_IDS.put(
        `fact:${fact.factId}`,
        JSON.stringify(fact)
      );
      return true;
    }
    return false;
  }

  /**
   * Validate fact data
   */
  async validateFactData(pageId) {
    const page = await this.fetchPageFromNotion(pageId);
    if (this.isAtomicFact(page)) {
      const fact = this.extractFactFromPage(page);

      // Validate required fields
      const errors = [];
      if (!fact.factId) errors.push('Missing Fact ID');
      if (!fact.factText) errors.push('Missing Fact Text');
      if (fact.weight && (fact.weight < 0 || fact.weight > 1)) {
        errors.push('Weight must be between 0 and 1');
      }

      if (errors.length > 0) {
        // Add validation comment to Notion
        await this.addCommentToPage(pageId,
          `Validation failed:\n${errors.join('\n')}`
        );
        return false;
      }

      await this.addCommentToPage(pageId, 'Validation passed ✓');
      return true;
    }
    return false;
  }

  /**
   * Add comment to Notion page
   */
  async addCommentToPage(pageId, text) {
    // Note: Notion API doesn't directly support comments
    // This would require using the discussion/comment endpoint
    console.log(`Comment for ${pageId}: ${text}`);
  }

  /**
   * Request ChittyID for a specific page
   */
  async requestChittyIdForPage(pageId) {
    const page = await this.fetchPageFromNotion(pageId);
    if (this.isAtomicFact(page)) {
      const fact = this.extractFactFromPage(page);
      return this.requestChittyIdForFact(fact);
    }
    return null;
  }
}

/**
 * Webhook endpoint handler for Cloudflare Workers
 */
export async function handleNotionWebhook(request, env) {
  const webhookService = new NotionWebhookService(env);
  return webhookService.processWebhook(request);
}