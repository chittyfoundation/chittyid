/**
 * NotionSync Worker - Hardened synchronization for AtomicFacts
 * Source: ChittyRouter → EvidenceEnvelope v1 → AtomicFacts → Notion
 */

export class NotionSyncWorker {
    constructor(env) {
        this.env = env;
        this.notionToken = env.NOTION_TOKEN;
        this.databaseId = env.NOTION_DATABASE_ID_ATOMIC_FACTS;
        this.notionVersion = '2022-06-28';
        this.baseUrl = 'https://api.notion.com/v1';

        // Metrics counters
        this.metrics = {
            notion_ok: 0,
            notion_429: 0,
            notion_5xx: 0,
            schema_mismatch: 0,
            upsert_skipped: 0,
            dlq_pushed: 0
        };
    }

    /**
     * Field mapping: AtomicFact → Notion properties
     */
    getFieldMapping() {
        return {
            factId: 'Fact ID',                    // title, required
            parentArtifactId: 'Parent Document',  // rich text
            factText: 'Fact Text',                // rich text
            factType: 'Fact Type',                // select
            locationRef: 'Location in Document',  // text
            classification: 'Classification Level', // select
            weight: 'Weight',                     // number
            credibility: 'Credibility Factors',  // multi-select
            chainStatus: 'ChittyChain Status',   // select
            verifiedAt: 'Verification Date',     // date
            verificationMethod: 'Verification Method' // text
        };
    }

    /**
     * Valid select options for Notion properties
     */
    getSelectOptions() {
        return {
            'Fact Type': [
                'DATE', 'AMOUNT', 'ADMISSION', 'IDENTITY',
                'LOCATION', 'RELATIONSHIP', 'ACTION', 'STATUS'
            ],
            'Classification Level': [
                'FACT', 'SUPPORTED_CLAIM', 'ASSERTION',
                'ALLEGATION', 'CONTRADICTION'
            ],
            'ChittyChain Status': [
                'Minted', 'Pending', 'Rejected'
            ],
            'Credibility Factors': [
                'Direct Evidence', 'Documentary', 'Witness Statement',
                'Expert Opinion', 'Circumstantial', 'Hearsay',
                'Blockchain Verified', 'AI Analyzed'
            ]
        };
    }

    /**
     * Transform AtomicFact to Notion page properties
     */
    transformToNotionPayload(atomicFact) {
        const mapping = this.getFieldMapping();

        const properties = {
            [mapping.factId]: {
                title: [{
                    text: { content: atomicFact.factId || '' }
                }]
            },
            [mapping.parentArtifactId]: {
                rich_text: [{
                    text: { content: atomicFact.parentArtifactId || '' }
                }]
            },
            [mapping.factText]: {
                rich_text: [{
                    text: {
                        content: this.truncateText(atomicFact.factText || '', 2000)
                    }
                }]
            },
            [mapping.factType]: {
                select: {
                    name: this.normalizeSelectValue(atomicFact.factType, 'Fact Type')
                }
            },
            [mapping.locationRef]: {
                rich_text: [{
                    text: { content: atomicFact.locationRef || '' }
                }]
            },
            [mapping.classification]: {
                select: {
                    name: this.normalizeSelectValue(atomicFact.classification, 'Classification Level')
                }
            },
            [mapping.weight]: {
                number: this.normalizeNumber(atomicFact.weight, 0, 1)
            },
            [mapping.credibility]: {
                multi_select: (atomicFact.credibility || []).map(factor => ({
                    name: this.normalizeSelectValue(factor, 'Credibility Factors')
                }))
            },
            [mapping.chainStatus]: {
                select: {
                    name: this.normalizeSelectValue(atomicFact.chainStatus || 'Pending', 'ChittyChain Status')
                }
            }
        };

        // Add optional date field
        if (atomicFact.verifiedAt) {
            properties[mapping.verifiedAt] = {
                date: {
                    start: this.normalizeDate(atomicFact.verifiedAt)
                }
            };
        }

        // Add verification method if present
        if (atomicFact.verificationMethod) {
            properties[mapping.verificationMethod] = {
                rich_text: [{
                    text: { content: atomicFact.verificationMethod }
                }]
            };
        }

        return { properties };
    }

    /**
     * Normalize select values to match Notion options
     */
    normalizeSelectValue(value, propertyName) {
        if (!value) return null;

        const options = this.getSelectOptions()[propertyName];
        if (!options) {
            this.metrics.schema_mismatch++;
            return value;
        }

        // Case-insensitive match
        const normalized = options.find(opt =>
            opt.toUpperCase() === value.toUpperCase()
        );

        if (!normalized) {
            this.metrics.schema_mismatch++;
            console.warn(`Unknown select value: ${value} for ${propertyName}`);
            return value; // Return as-is, Notion might create it
        }

        return normalized;
    }

    /**
     * Normalize number within bounds
     */
    normalizeNumber(value, min, max) {
        if (value === undefined || value === null) return null;
        const num = parseFloat(value);
        if (isNaN(num)) return null;
        return Math.max(min, Math.min(max, num));
    }

    /**
     * Normalize date to ISO string
     */
    normalizeDate(date) {
        if (!date) return null;
        try {
            return new Date(date).toISOString().split('T')[0];
        } catch {
            return null;
        }
    }

    /**
     * Truncate text to Notion limits
     */
    truncateText(text, maxLength) {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    }

    /**
     * Lookup existing page by factId
     */
    async lookupByFactId(factId) {
        const mapping = this.getFieldMapping();

        try {
            const response = await fetch(`${this.baseUrl}/databases/${this.databaseId}/query`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({
                    filter: {
                        property: mapping.factId,
                        title: {
                            equals: factId
                        }
                    },
                    page_size: 1
                })
            });

            if (!response.ok) {
                throw new Error(`Lookup failed: ${response.status}`);
            }

            const data = await response.json();
            return data.results[0] || null;
        } catch (error) {
            console.error(`Lookup error for ${factId}:`, error);
            return null;
        }
    }

    /**
     * Upsert fact to Notion with idempotency
     */
    async upsertFact(atomicFact) {
        const factId = atomicFact.factId;
        if (!factId) {
            console.error('Missing factId, skipping');
            this.metrics.upsert_skipped++;
            return { status: 'skipped', reason: 'missing_factId' };
        }

        try {
            // Check if exists
            const existingPage = await this.lookupByFactId(factId);

            if (existingPage) {
                // Update existing page
                return await this.updatePage(existingPage.id, atomicFact);
            } else {
                // Create new page
                return await this.createPage(atomicFact);
            }
        } catch (error) {
            console.error(`Upsert failed for ${factId}:`, error);
            await this.pushToDLQ(atomicFact, error.message);
            return { status: 'failed', error: error.message };
        }
    }

    /**
     * Create new Notion page
     */
    async createPage(atomicFact) {
        const payload = {
            parent: { database_id: this.databaseId },
            ...this.transformToNotionPayload(atomicFact)
        };

        const response = await this.fetchWithRetry(`${this.baseUrl}/pages`, {
            method: 'POST',
            headers: this.getHeaders(atomicFact.factId),
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            this.metrics.notion_ok++;
            return { status: 'created', pageId: (await response.json()).id };
        }

        throw new Error(`Create failed: ${response.status} ${await response.text()}`);
    }

    /**
     * Update existing Notion page
     */
    async updatePage(pageId, atomicFact) {
        const payload = this.transformToNotionPayload(atomicFact);

        const response = await this.fetchWithRetry(`${this.baseUrl}/pages/${pageId}`, {
            method: 'PATCH',
            headers: this.getHeaders(atomicFact.factId),
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            this.metrics.notion_ok++;
            return { status: 'updated', pageId };
        }

        throw new Error(`Update failed: ${response.status} ${await response.text()}`);
    }

    /**
     * Fetch with exponential backoff and retry
     */
    async fetchWithRetry(url, options, retryCount = 0, maxRetries = 5) {
        try {
            const response = await fetch(url, options);

            if (response.status === 429) {
                this.metrics.notion_429++;
                if (retryCount < maxRetries) {
                    const delay = this.getBackoffDelay(retryCount);
                    console.log(`Rate limited, retrying in ${delay}ms`);
                    await this.sleep(delay);
                    return this.fetchWithRetry(url, options, retryCount + 1, maxRetries);
                }
            }

            if (response.status >= 500) {
                this.metrics.notion_5xx++;
                if (retryCount < maxRetries) {
                    const delay = this.getBackoffDelay(retryCount);
                    console.log(`Server error, retrying in ${delay}ms`);
                    await this.sleep(delay);
                    return this.fetchWithRetry(url, options, retryCount + 1, maxRetries);
                }
            }

            return response;
        } catch (error) {
            if (retryCount < maxRetries) {
                const delay = this.getBackoffDelay(retryCount);
                await this.sleep(delay);
                return this.fetchWithRetry(url, options, retryCount + 1, maxRetries);
            }
            throw error;
        }
    }

    /**
     * Calculate exponential backoff with jitter
     */
    getBackoffDelay(retryCount) {
        const baseDelay = Math.pow(2, retryCount) * 1000;
        const jitter = Math.random() * 1000;
        return Math.min(baseDelay + jitter, 30000); // Max 30 seconds
    }

    /**
     * Sleep helper
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get Notion API headers
     */
    getHeaders(idempotencyKey = null) {
        const headers = {
            'Authorization': `Bearer ${this.notionToken}`,
            'Content-Type': 'application/json',
            'Notion-Version': this.notionVersion
        };

        if (idempotencyKey) {
            headers['X-Idempotency-Key'] = idempotencyKey;
        }

        return headers;
    }

    /**
     * Push failed fact to DLQ
     */
    async pushToDLQ(atomicFact, errorReason) {
        const dlqItem = {
            fact: atomicFact,
            error: errorReason,
            timestamp: new Date().toISOString(),
            retry_at: new Date(Date.now() + 3600000).toISOString() // Retry in 1 hour
        };

        await this.env.DLQ.put(`dlq:fact:${atomicFact.factId}`, JSON.stringify(dlqItem));
        this.metrics.dlq_pushed++;
    }

    /**
     * Process batch of facts with rate limiting
     */
    async processBatch(facts, batchSize = 10, delayMs = 200) {
        const results = [];

        for (let i = 0; i < facts.length; i += batchSize) {
            const batch = facts.slice(i, i + batchSize);

            const batchResults = await Promise.all(
                batch.map(fact => this.upsertFact(fact))
            );

            results.push(...batchResults);

            // Rate limit between batches
            if (i + batchSize < facts.length) {
                await this.sleep(delayMs);
            }
        }

        return results;
    }

    /**
     * Main sync endpoint
     */
    async sync(request) {
        const { since, limit = 100 } = await request.json();

        try {
            // Fetch AtomicFacts from upstream
            const facts = await this.fetchAtomicFacts(since, limit);

            // Process in batches
            const results = await this.processBatch(facts);

            // Count results
            const summary = {
                created: results.filter(r => r.status === 'created').length,
                updated: results.filter(r => r.status === 'updated').length,
                skipped: results.filter(r => r.status === 'skipped').length,
                failed: results.filter(r => r.status === 'failed').length,
                errors: results.filter(r => r.status === 'failed').map(r => ({
                    factId: r.factId,
                    error: r.error
                }))
            };

            // Log metrics
            await this.logMetrics();

            return new Response(JSON.stringify({
                success: true,
                summary,
                metrics: this.metrics
            }), {
                headers: { 'Content-Type': 'application/json' }
            });

        } catch (error) {
            console.error('Sync error:', error);
            return new Response(JSON.stringify({
                success: false,
                error: error.message,
                metrics: this.metrics
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }

    /**
     * Fetch AtomicFacts from upstream
     */
    async fetchAtomicFacts(since, limit) {
        // In production, this would fetch from ChittyLedger/ChittyAssets
        // For now, return mock data for testing
        return [
            {
                factId: `FACT-${Date.now()}-001`,
                parentArtifactId: 'DOC-2024-001',
                factText: 'The defendant was present at the location on January 15, 2024.',
                factType: 'DATE',
                locationRef: 'Page 3, Paragraph 2',
                classification: 'FACT',
                weight: 0.95,
                credibility: ['Direct Evidence', 'Documentary'],
                chainStatus: 'Minted',
                verifiedAt: new Date().toISOString(),
                verificationMethod: 'ChittyRouter AI Analysis'
            }
        ];
    }

    /**
     * Log metrics to analytics
     */
    async logMetrics() {
        if (this.env.CHITTY_ANALYTICS) {
            await this.env.CHITTY_ANALYTICS.writeDataPoint({
                blobs: ['notion_sync'],
                doubles: [
                    this.metrics.notion_ok,
                    this.metrics.notion_429,
                    this.metrics.notion_5xx,
                    this.metrics.schema_mismatch,
                    this.metrics.upsert_skipped,
                    this.metrics.dlq_pushed
                ],
                indexes: ['chittyid-mothership']
            });
        }
    }

    /**
     * Reprocess DLQ items
     */
    async reprocessDLQ(request) {
        const { limit = 10 } = await request.json();

        // List DLQ items
        const list = await this.env.DLQ.list({ prefix: 'dlq:fact:', limit });
        const results = [];

        for (const item of list.keys) {
            const dlqData = JSON.parse(await this.env.DLQ.get(item.name));

            // Check if ready for retry
            if (new Date(dlqData.retry_at) > new Date()) {
                continue;
            }

            // Retry the fact
            const result = await this.upsertFact(dlqData.fact);

            if (result.status !== 'failed') {
                // Remove from DLQ on success
                await this.env.DLQ.delete(item.name);
            }

            results.push(result);
        }

        return new Response(JSON.stringify({
            success: true,
            processed: results.length,
            results
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }

    /**
     * Verify Notion configuration
     */
    async verifyConfig() {
        try {
            // Test database access
            const response = await fetch(`${this.baseUrl}/databases/${this.databaseId}`, {
                headers: this.getHeaders()
            });

            if (!response.ok) {
                return {
                    valid: false,
                    error: `Database access failed: ${response.status}`
                };
            }

            const database = await response.json();

            // Verify required properties exist
            const mapping = this.getFieldMapping();
            const requiredProps = Object.values(mapping);
            const dbProps = Object.keys(database.properties);

            const missing = requiredProps.filter(prop => !dbProps.includes(prop));

            if (missing.length > 0) {
                return {
                    valid: false,
                    error: `Missing properties: ${missing.join(', ')}`,
                    recommendation: 'Create these properties in Notion database'
                };
            }

            return {
                valid: true,
                database: database.title[0]?.plain_text || 'Unnamed',
                properties: dbProps
            };

        } catch (error) {
            return {
                valid: false,
                error: error.message
            };
        }
    }
}

// Export for Cloudflare Workers
export default {
    async fetch(request, env) {
        const worker = new NotionSyncWorker(env);
        const url = new URL(request.url);

        if (url.pathname === '/bridges/notion/facts:sync' && request.method === 'POST') {
            return worker.sync(request);
        }

        if (url.pathname === '/sync/notion/dlq' && request.method === 'POST') {
            return worker.reprocessDLQ(request);
        }

        if (url.pathname === '/sync/notion/verify' && request.method === 'GET') {
            const result = await worker.verifyConfig();
            return new Response(JSON.stringify(result), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response('NotionSync Worker Ready', { status: 200 });
    }
};