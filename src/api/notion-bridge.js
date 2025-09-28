/**
 * Notion Bridge API - Sync AtomicFacts to Notion
 * Provides endpoints for manual and automated synchronization
 */

import { NotionSyncService } from '../services/notion-sync.js';

export class NotionBridgeAPI {
  constructor(env) {
    this.env = env;
    this.syncService = new NotionSyncService(env);
  }

  /**
   * Handle bridge API requests
   */
  async handleRequest(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    const headers = {
      'Content-Type': 'application/json'
    };

    try {
      switch (path) {
        case '/bridges/notion/facts:sync':
          return await this.handleFactsSync(request, headers);

        case '/bridges/notion/dlq:process':
          return await this.handleDlqProcess(request, headers);

        case '/bridges/notion/setup':
          return await this.handleSetup(request, headers);

        case '/bridges/notion/status':
          return await this.handleStatus(headers);

        default:
          return new Response(JSON.stringify({
            error: 'Unknown bridge endpoint',
            available: [
              '/bridges/notion/facts:sync',
              '/bridges/notion/dlq:process',
              '/bridges/notion/setup',
              '/bridges/notion/status'
            ]
          }), { status: 404, headers });
      }
    } catch (error) {
      return new Response(JSON.stringify({
        error: error.message,
        timestamp: new Date().toISOString()
      }), { status: 500, headers });
    }
  }

  /**
   * Sync AtomicFacts to Notion
   */
  async handleFactsSync(request, headers) {
    const { since, limit = 100, factIds } = await request.json();

    // Get facts to sync
    const facts = await this.getFactsToSync(since, limit, factIds);

    if (!facts.length) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No facts to sync',
        summary: { total: 0, created: 0, updated: 0, skipped: 0, failed: 0 }
      }), { headers });
    }

    // Perform sync
    const result = await this.syncService.sync(facts, {
      batchSize: 10,
      processDlq: false
    });

    return new Response(JSON.stringify(result), { headers });
  }

  /**
   * Process DLQ items
   */
  async handleDlqProcess(request, headers) {
    const { maxItems = 50 } = await request.json();

    // Get DLQ items
    const dlqItems = await this.getDlqItems(maxItems);

    if (!dlqItems.length) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No DLQ items to process',
        count: 0
      }), { headers });
    }

    // Process DLQ
    const facts = dlqItems.map(item => item.fact);
    const result = await this.syncService.sync(facts, {
      batchSize: 5,
      processDlq: true
    });

    return new Response(JSON.stringify({
      ...result,
      dlqProcessed: dlqItems.length
    }), { headers });
  }

  /**
   * Setup Notion database with required properties
   */
  async handleSetup(request, headers) {
    const setupScript = this.generateNotionSetupScript();

    return new Response(JSON.stringify({
      success: true,
      instructions: 'Use this script to create required properties in your Notion database',
      script: setupScript,
      requiredProperties: this.getRequiredProperties()
    }), { headers });
  }

  /**
   * Get sync status and metrics
   */
  async handleStatus(headers) {
    // Get today's metrics
    const metricsKey = `metrics:notion:${new Date().toISOString().slice(0, 10)}`;
    const metricsData = await this.env.AUTH_CACHE?.get(metricsKey);
    const metrics = metricsData ? JSON.parse(metricsData) : {};

    // Get DLQ status
    const dlqCount = await this.getDlqCount();

    // Get last sync time
    const lastSyncKey = 'notion:last_sync';
    const lastSync = await this.env.AUTH_CACHE?.get(lastSyncKey);

    return new Response(JSON.stringify({
      status: 'operational',
      lastSync: lastSync || 'never',
      metrics,
      dlq: {
        count: dlqCount,
        threshold: 100,
        alert: dlqCount > 100
      },
      health: {
        notion: await this.checkNotionHealth(),
        database: await this.checkDatabaseHealth()
      }
    }), { headers });
  }

  /**
   * Get facts to sync from storage
   */
  async getFactsToSync(since, limit, factIds) {
    const facts = [];

    if (factIds && factIds.length > 0) {
      // Sync specific facts
      for (const factId of factIds) {
        const data = await this.env.CHITTY_IDS?.get(`fact:${factId}`);
        if (data) {
          facts.push(JSON.parse(data));
        }
      }
    } else {
      // Sync all facts since timestamp
      const prefix = 'fact:';
      const list = await this.env.CHITTY_IDS?.list({
        prefix,
        limit
      });

      if (list?.keys) {
        for (const key of list.keys) {
          const data = await this.env.CHITTY_IDS.get(key.name);
          if (data) {
            const fact = JSON.parse(data);
            if (!since || new Date(fact.createdAt) > new Date(since)) {
              facts.push(fact);
            }
          }
        }
      }
    }

    return facts;
  }

  /**
   * Get DLQ items
   */
  async getDlqItems(maxItems) {
    const items = [];
    const prefix = 'dlq:notion:';
    const list = await this.env.AUTH_CACHE?.list({
      prefix,
      limit: maxItems
    });

    if (list?.keys) {
      for (const key of list.keys) {
        const data = await this.env.AUTH_CACHE.get(key.name);
        if (data) {
          items.push(JSON.parse(data));
        }
      }
    }

    return items;
  }

  /**
   * Get DLQ count
   */
  async getDlqCount() {
    const prefix = 'dlq:notion:';
    const list = await this.env.AUTH_CACHE?.list({ prefix });
    return list?.keys?.length || 0;
  }

  /**
   * Check Notion API health
   */
  async checkNotionHealth() {
    try {
      const response = await fetch('https://api.notion.com/v1/users/me', {
        headers: {
          'Authorization': `Bearer ${this.env.NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28'
        }
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Check database health
   */
  async checkDatabaseHealth() {
    try {
      if (!this.env.NOTION_DATABASE_ID_ATOMIC_FACTS) return false;

      const response = await fetch(`https://api.notion.com/v1/databases/${this.env.NOTION_DATABASE_ID_ATOMIC_FACTS}`, {
        headers: {
          'Authorization': `Bearer ${this.env.NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28'
        }
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get required Notion properties
   */
  getRequiredProperties() {
    return {
      'Fact ID': { type: 'title', required: true },
      'Parent Document': { type: 'rich_text', required: false },
      'Fact Text': { type: 'rich_text', required: true },
      'Fact Type': {
        type: 'select',
        options: ['DATE', 'AMOUNT', 'ADMISSION', 'IDENTITY', 'LOCATION', 'RELATIONSHIP', 'ACTION', 'STATUS']
      },
      'Location in Document': { type: 'rich_text', required: false },
      'Classification Level': {
        type: 'select',
        options: ['FACT', 'SUPPORTED_CLAIM', 'ASSERTION', 'ALLEGATION', 'CONTRADICTION']
      },
      'Weight': { type: 'number', required: false },
      'Credibility Factors': {
        type: 'multi_select',
        options: ['SWORN', 'DOCUMENTED', 'WITNESSED', 'EXPERT', 'CORROBORATED', 'CHALLENGED']
      },
      'ChittyChain Status': {
        type: 'select',
        options: ['Minted', 'Pending', 'Rejected']
      },
      'Verification Date': { type: 'date', required: false },
      'Verification Method': { type: 'rich_text', required: false },
      'External ID': { type: 'rich_text', required: true },
      'Synced At': { type: 'date', required: false },
      'Source': { type: 'rich_text', required: false }
    };
  }

  /**
   * Generate Notion setup script
   */
  generateNotionSetupScript() {
    return `
// Notion Database Setup Script for AtomicFacts
// Run this in your Notion API client or use the Notion UI

const properties = ${JSON.stringify(this.getRequiredProperties(), null, 2)};

// API call to create/update database properties
const databaseId = '${this.env.NOTION_DATABASE_ID_ATOMIC_FACTS || 'YOUR_DATABASE_ID'}';

async function setupDatabase() {
  for (const [name, config] of Object.entries(properties)) {
    console.log(\`Setting up property: \${name} (\${config.type})\`);

    // Create property based on type
    switch (config.type) {
      case 'select':
        // Create with options
        await createSelectProperty(name, config.options);
        break;
      case 'multi_select':
        // Create with options
        await createMultiSelectProperty(name, config.options);
        break;
      default:
        // Create basic property
        await createProperty(name, config.type);
    }
  }
}

// Helper functions
async function createProperty(name, type) {
  // Implementation depends on Notion API version
  // This is a template - adjust for your needs
}

async function createSelectProperty(name, options) {
  // Create select property with predefined options
}

async function createMultiSelectProperty(name, options) {
  // Create multi-select property with predefined options
}

// Run setup
setupDatabase().then(() => {
  console.log('Database setup complete!');
}).catch(error => {
  console.error('Setup failed:', error);
});
`;
  }
}