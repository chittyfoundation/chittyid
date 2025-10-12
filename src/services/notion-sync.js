/**
 * Hardened NotionSync Service for AtomicFacts
 * Reliable synchronization from ChittyRouter → EvidenceEnvelope → AtomicFacts → Notion
 */

export class NotionSyncService {
  constructor(env) {
    this.env = env;
    this.notion = {
      token: env.NOTION_TOKEN,
      databaseId: env.NOTION_DATABASE_ID_ATOMIC_FACTS,
      baseUrl: "https://api.notion.com/v1",
    };

    // Metrics tracking
    this.metrics = {
      notion_ok: 0,
      notion_429: 0,
      notion_5xx: 0,
      schema_mismatch: 0,
      upsert_skipped: 0,
      dlq_pushed: 0,
    };

    // Field mapping configuration
    this.fieldMap = {
      factId: { notion: "Fact ID", type: "title", required: true },
      parentArtifactId: { notion: "Parent Document", type: "rich_text" },
      factText: { notion: "Fact Text", type: "rich_text", maxLength: 2000 },
      factType: {
        notion: "Fact Type",
        type: "select",
        options: [
          "DATE",
          "AMOUNT",
          "ADMISSION",
          "IDENTITY",
          "LOCATION",
          "RELATIONSHIP",
          "ACTION",
          "STATUS",
        ],
      },
      locationRef: { notion: "Location in Document", type: "rich_text" },
      classification: {
        notion: "Classification Level",
        type: "select",
        options: [
          "FACT",
          "SUPPORTED_CLAIM",
          "ASSERTION",
          "ALLEGATION",
          "CONTRADICTION",
        ],
      },
      weight: { notion: "Weight", type: "number", min: 0, max: 1 },
      credibility: {
        notion: "Credibility Factors",
        type: "multi_select",
        options: [
          "SWORN",
          "DOCUMENTED",
          "WITNESSED",
          "EXPERT",
          "CORROBORATED",
          "CHALLENGED",
        ],
      },
      chainStatus: {
        notion: "ChittyChain Status",
        type: "select",
        options: ["Minted", "Pending", "Rejected"],
      },
      verifiedAt: { notion: "Verification Date", type: "date" },
      verificationMethod: { notion: "Verification Method", type: "rich_text" },
    };
  }

  /**
   * Main sync entry point - processes AtomicFacts to Notion
   */
  async sync(facts, options = {}) {
    const results = {
      created: [],
      updated: [],
      skipped: [],
      errors: [],
      metrics: { ...this.metrics },
    };

    // Handle empty facts array
    if (!facts || facts.length === 0) {
      return {
        success: true,
        summary: {
          total: 0,
          created: 0,
          updated: 0,
          skipped: 0,
          failed: 0,
        },
        results,
        metrics: results.metrics,
      };
    }

    // Validate configuration
    const configValid = await this.validateConfig();
    if (!configValid.success) {
      return {
        success: false,
        error: "Configuration invalid",
        details: configValid.error,
      };
    }

    // Process facts in batches
    const batchSize = options.batchSize || 10;
    const batches = this.createBatches(facts, batchSize);

    for (const batch of batches) {
      await this.processBatch(batch, results);

      // Rate limit protection with gap between batches
      await this.delay(200);
    }

    // Process any DLQ items if requested
    if (options.processDlq) {
      await this.processDlqItems(results);
    }

    // Store metrics
    await this.storeMetrics(results.metrics);

    return {
      success: true,
      summary: {
        total: facts.length,
        created: results.created.length,
        updated: results.updated.length,
        skipped: results.skipped.length,
        failed: results.errors.length,
      },
      results,
      metrics: results.metrics,
    };
  }

  /**
   * Process a batch of facts
   */
  async processBatch(batch, results) {
    for (const fact of batch) {
      try {
        // Handle malformed fact data
        if (!fact || typeof fact !== "object") {
          throw new Error("Malformed fact data: fact must be an object");
        }
        if (!fact.factId) {
          throw new Error("Malformed fact data: missing factId");
        }

        const result = await this.upsertFact(fact);

        if (result.created) {
          results.created.push(fact.factId);
          results.metrics.notion_ok++;
        } else if (result.updated) {
          results.updated.push(fact.factId);
          results.metrics.notion_ok++;
        } else if (result.skipped) {
          results.skipped.push({ id: fact.factId, reason: result.reason });
          results.metrics.upsert_skipped++;
        }
      } catch (error) {
        await this.handleSyncError(fact, error, results);
      }
    }
  }

  /**
   * Idempotent upsert of a fact to Notion
   */
  async upsertFact(fact) {
    // Transform fact to Notion payload
    const payload = this.transformToNotionPayload(fact);

    if (!payload.valid) {
      this.metrics.schema_mismatch++;
      throw new Error(`Schema mismatch: ${payload.error}`);
    }

    // Check for existing page by Fact ID
    const existing = await this.findExistingPage(fact.factId);

    if (existing) {
      // Update only if content has changed
      const needsUpdate = await this.checkNeedsUpdate(
        existing,
        payload.properties,
      );

      if (!needsUpdate) {
        return { skipped: true, reason: "No changes detected" };
      }

      // Update existing page
      const updated = await this.updatePage(
        existing.id,
        payload.properties,
        fact.factId,
      );
      return { updated: true, pageId: updated.id };
    }

    // Create new page
    const created = await this.createPage(payload.properties, fact.factId);
    return { created: true, pageId: created.id };
  }

  /**
   * Transform AtomicFact to Notion API payload
   */
  transformToNotionPayload(fact) {
    try {
      const properties = {};

      for (const [sourceField, mapping] of Object.entries(this.fieldMap)) {
        const value = fact[sourceField];

        if (mapping.required && !value) {
          return {
            valid: false,
            error: `Required field ${sourceField} is missing`,
          };
        }

        if (value !== undefined && value !== null) {
          properties[mapping.notion] = this.formatPropertyValue(value, mapping);
        }
      }

      // Add system fields
      properties["External ID"] = {
        rich_text: [{ text: { content: fact.factId } }],
      };
      properties["Synced At"] = { date: { start: new Date().toISOString() } };
      properties["Source"] = {
        rich_text: [{ text: { content: "ChittyRouter" } }],
      };

      return { valid: true, properties };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Format property value based on Notion type
   */
  formatPropertyValue(value, mapping) {
    switch (mapping.type) {
      case "title":
        return { title: [{ text: { content: String(value).slice(0, 100) } }] };

      case "rich_text":
        const text = String(value);
        const truncated = mapping.maxLength
          ? text.slice(0, mapping.maxLength)
          : text;
        return { rich_text: [{ text: { content: truncated } }] };

      case "select":
        const selectValue = String(value);
        if (mapping.options && !mapping.options.includes(selectValue)) {
          // For invalid select values, we need to throw for test compatibility
          throw new Error(`Invalid select value: ${selectValue}`);
        }
        return { select: { name: selectValue } };

      case "multi_select":
        const values = Array.isArray(value) ? value : [value];
        return {
          multi_select: values
            .filter((v) => !mapping.options || mapping.options.includes(v))
            .map((v) => ({ name: String(v) })),
        };

      case "number":
        const num = parseFloat(value);
        if (mapping.min !== undefined && num < mapping.min)
          return { number: mapping.min };
        if (mapping.max !== undefined && num > mapping.max)
          return { number: mapping.max };
        return { number: num };

      case "date":
        return { date: { start: new Date(value).toISOString() } };

      default:
        return { rich_text: [{ text: { content: String(value) } }] };
    }
  }

  /**
   * Find existing Notion page by Fact ID
   */
  async findExistingPage(factId) {
    try {
      const response = await this.notionRequest(
        "POST",
        "/databases/" + this.notion.databaseId + "/query",
        {
          filter: {
            property: "Fact ID",
            title: {
              equals: factId,
            },
          },
          page_size: 1,
        },
      );

      // Handle inconsistent API responses
      if (!response || !Array.isArray(response.results)) {
        console.warn(`Unexpected response format for ${factId}`);
        return null;
      }

      return response.results[0] || null;
    } catch (error) {
      // If there's an error finding the page, treat it as not found
      console.error(`Error finding existing page for ${factId}:`, error);
      return null;
    }
  }

  /**
   * Check if page needs update
   */
  async checkNeedsUpdate(existingPage, newProperties) {
    // Simple change detection - could be enhanced with deep comparison
    for (const [key, value] of Object.entries(newProperties)) {
      if (key === "Synced At" || key === "External ID") continue;

      const existing = existingPage.properties?.[key];
      if (!existing) return true;

      // Basic comparison - enhance as needed
      if (JSON.stringify(existing) !== JSON.stringify(value)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Create new Notion page
   */
  async createPage(properties, factId) {
    return await this.notionRequest(
      "POST",
      "/pages",
      {
        parent: { database_id: this.notion.databaseId },
        properties,
      },
      factId,
    );
  }

  /**
   * Update existing Notion page
   */
  async updatePage(pageId, properties, factId) {
    // Remove title from updates (can't update title)
    const updateProperties = { ...properties };
    delete updateProperties["Fact ID"];

    return await this.notionRequest(
      "PATCH",
      `/pages/${pageId}`,
      {
        properties: updateProperties,
      },
      factId,
    );
  }

  /**
   * Make Notion API request with retry logic
   */
  async notionRequest(method, endpoint, body, idempotencyKey = null) {
    const headers = {
      Authorization: `Bearer ${this.notion.token}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    };

    if (idempotencyKey) {
      headers["X-Idempotency-Key"] = idempotencyKey;
    }

    let attempt = 0;
    const maxRetries = 5;

    while (attempt < maxRetries) {
      try {
        // Add timeout with AbortController
        const controller = new AbortController();
        const timeoutMs = method === "GET" ? 2000 : 5000; // Shorter timeout for GET requests
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(this.notion.baseUrl + endpoint, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.ok) {
          return await response.json();
        }

        // Handle rate limits
        if (response.status === 429) {
          this.metrics.notion_429++;
          const retryAfter = parseInt(
            response.headers.get("Retry-After") || "1",
          );
          await this.delayWithJitter(retryAfter * 1000, attempt);
          attempt++;
          continue;
        }

        // Handle server errors with retry
        if (response.status >= 500) {
          this.metrics.notion_5xx++;
          if (attempt < maxRetries - 1) {
            await this.delayWithJitter(1000, attempt);
            attempt++;
            continue;
          }
        }

        // Non-retryable error
        const error = await response.text();
        throw new Error(`Notion API error ${response.status}: ${error}`);
      } catch (error) {
        if (error.name === "AbortError") {
          // Timeout - retry if we have attempts left
          if (attempt < maxRetries - 1) {
            await this.delayWithJitter(500, attempt);
            attempt++;
            continue;
          }
          throw new Error("Request timeout");
        }
        if (attempt === maxRetries - 1) {
          throw error;
        }
        await this.delayWithJitter(1000, attempt);
        attempt++;
      }
    }

    throw new Error(`Max retries (${maxRetries}) exceeded`);
  }

  /**
   * Handle sync errors
   */
  async handleSyncError(fact, error, results) {
    const factId = fact?.factId || "unknown";
    console.error(`Failed to sync fact ${factId}:`, error);

    results.errors.push({
      factId: factId,
      error: error.message,
      timestamp: new Date().toISOString(),
    });

    // Push to DLQ only if we have a valid fact object
    if (fact && fact.factId) {
      await this.pushToDlq(fact, error);
      results.metrics.dlq_pushed++;
    }
  }

  /**
   * Push failed item to DLQ
   */
  async pushToDlq(fact, error) {
    const dlqKey = `dlq:notion:${fact.factId}`;
    const dlqItem = {
      fact,
      error: error.message,
      attempts: 1,
      firstFailure: new Date().toISOString(),
      lastFailure: new Date().toISOString(),
      retryAt: new Date(Date.now() + 300000).toISOString(), // 5 min from now
    };

    // Check if already in DLQ
    const existing = await this.env.PLATFORM_CACHE?.get(dlqKey);
    if (existing) {
      const parsed = JSON.parse(existing);
      dlqItem.attempts = parsed.attempts + 1;
      dlqItem.firstFailure = parsed.firstFailure;
    }

    await this.env.PLATFORM_CACHE?.put(dlqKey, JSON.stringify(dlqItem), {
      expirationTtl: 86400, // 24 hours
    });
  }

  /**
   * Process DLQ items
   */
  async processDlqItems(results) {
    const dlqPrefix = "dlq:notion:";
    const dlqItems = await this.env.PLATFORM_CACHE?.list({ prefix: dlqPrefix });

    if (!dlqItems?.keys?.length) return;

    for (const key of dlqItems.keys) {
      const item = JSON.parse(await this.env.PLATFORM_CACHE.get(key.name));

      if (new Date(item.retryAt) > new Date()) continue;

      try {
        const result = await this.upsertFact(item.fact);
        if (result.created || result.updated) {
          await this.env.PLATFORM_CACHE.delete(key.name);
          results.metrics.notion_ok++;
        }
      } catch (error) {
        item.attempts++;
        item.lastFailure = new Date().toISOString();
        item.retryAt = new Date(
          Date.now() + Math.min(300000 * item.attempts, 3600000),
        ).toISOString();

        if (item.attempts >= 10) {
          console.error(`DLQ item ${item.fact.factId} exceeded max attempts`);
          await this.env.PLATFORM_CACHE.delete(key.name);
        } else {
          await this.env.PLATFORM_CACHE.put(key.name, JSON.stringify(item));
        }
      }
    }
  }

  /**
   * Validate configuration
   */
  async validateConfig() {
    if (!this.notion.token) {
      return { success: false, error: "NOTION_TOKEN not configured" };
    }

    if (!this.notion.databaseId) {
      return {
        success: false,
        error: "NOTION_DATABASE_ID_ATOMIC_FACTS not configured",
      };
    }

    // Test API access with shorter timeout
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1000); // 1 second timeout for validation

      const response = await fetch(
        this.notion.baseUrl + `/databases/${this.notion.databaseId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.notion.token}`,
            "Notion-Version": "2022-06-28",
          },
          signal: controller.signal,
        },
      );

      clearTimeout(timeout);

      if (!response.ok) {
        return {
          success: false,
          error: `Notion API test failed: ${response.status}`,
        };
      }

      return { success: true };
    } catch (error) {
      if (error.name === "AbortError") {
        return {
          success: false,
          error: "Notion API test failed: Request timeout",
        };
      }
      return {
        success: false,
        error: `Notion API test failed: ${error.message}`,
      };
    }
  }

  /**
   * Store metrics for monitoring
   */
  async storeMetrics(metrics) {
    const metricsKey = `metrics:notion:${new Date().toISOString().slice(0, 10)}`;
    await this.env.PLATFORM_CACHE?.put(
      metricsKey,
      JSON.stringify({
        ...metrics,
        timestamp: new Date().toISOString(),
      }),
      {
        expirationTtl: 604800, // 7 days
      },
    );
  }

  /**
   * Utility functions
   */
  createBatches(items, size) {
    const batches = [];
    for (let i = 0; i < items.length; i += size) {
      batches.push(items.slice(i, i + size));
    }
    return batches;
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  delayWithJitter(baseMs, attempt) {
    const jitter = Math.random() * 1000;
    const exponentialDelay = Math.min(baseMs * Math.pow(2, attempt), 30000);
    return this.delay(exponentialDelay + jitter);
  }
}
