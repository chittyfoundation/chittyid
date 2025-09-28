/**
 * Search Service
 * Handles semantic search using Cloudflare Vectorize
 */

import { Ai } from '@cloudflare/ai';

export default class SearchService {
  constructor(env) {
    this.env = env;
    this.ai = env.AI ? new Ai(env.AI) : null;
  }

  /**
   * Search for ChittyIDs using semantic search
   */
  async search(query, limit = 10) {
    if (!this.ai) {
      return this.fallbackSearch(query, limit);
    }

    try {
      // Generate embedding for the search query
      const embedding = await this.generateEmbedding(query);

      // Search in Vectorize
      if (this.env.CHITTY_VECTORS) {
        const results = await this.env.CHITTY_VECTORS.query(embedding, {
          topK: limit,
          returnValues: true,
          returnMetadata: true
        });

        // Format results
        return results.matches.map(match => ({
          chittyId: match.id,
          score: match.score,
          metadata: match.metadata,
          distance: 1 - match.score // Convert similarity to distance
        }));
      }

      return this.fallbackSearch(query, limit);
    } catch (error) {
      console.error('Search error:', error);
      return this.fallbackSearch(query, limit);
    }
  }

  /**
   * Generate embedding for text using AI
   */
  async generateEmbedding(text) {
    const result = await this.ai.run('@cf/baai/bge-base-en-v1.5', {
      text
    });

    return result.data?.[0] || result;
  }

  /**
   * Fallback search when Vectorize is not available
   */
  async fallbackSearch(query, limit) {
    const results = [];

    // Parse query for basic pattern matching
    const queryLower = query.toLowerCase();
    const patterns = this.extractPatterns(queryLower);

    // Search in KV if available
    if (this.env.CHITTY_IDS) {
      // List recent ChittyIDs (this is limited without proper indexing)
      const list = await this.env.CHITTY_IDS.list({ limit: 100 });

      for (const key of list.keys) {
        const data = await this.env.CHITTY_IDS.get(key.name);
        if (data) {
          const parsed = JSON.parse(data);
          const score = this.calculateRelevance(parsed, patterns);

          if (score > 0) {
            results.push({
              chittyId: key.name,
              score,
              metadata: parsed,
              distance: 1 - score
            });
          }
        }
      }

      // Sort by score and limit results
      results.sort((a, b) => b.score - a.score);
      return results.slice(0, limit);
    }

    return [];
  }

  /**
   * Extract search patterns from query
   */
  extractPatterns(query) {
    const patterns = {
      entityType: null,
      region: null,
      trustLevel: null,
      keywords: []
    };

    // Check for entity types
    if (query.includes('person')) patterns.entityType = 'P';
    else if (query.includes('location')) patterns.entityType = 'L';
    else if (query.includes('thing')) patterns.entityType = 'T';
    else if (query.includes('event')) patterns.entityType = 'E';

    // Check for regions
    const regions = {
      'north america': '1',
      'south america': '2',
      'europe': '3',
      'asia': '4',
      'africa': '5',
      'oceania': '6',
      'antarctica': '7',
      'international': '8',
      'digital': '9',
      'virtual': '9'
    };

    for (const [name, code] of Object.entries(regions)) {
      if (query.includes(name)) {
        patterns.region = code;
        break;
      }
    }

    // Check for trust levels
    const trustLevels = {
      'unverified': '0',
      'basic': '1',
      'standard': '2',
      'verified': '3',
      'premium': '4',
      'official': '5'
    };

    for (const [name, level] of Object.entries(trustLevels)) {
      if (query.includes(name)) {
        patterns.trustLevel = level;
        break;
      }
    }

    // Extract keywords
    patterns.keywords = query
      .split(/\s+/)
      .filter(word => word.length > 2)
      .filter(word => !['the', 'and', 'or', 'in', 'with', 'for'].includes(word));

    return patterns;
  }

  /**
   * Calculate relevance score for fallback search
   */
  calculateRelevance(data, patterns) {
    let score = 0;
    let matches = 0;
    let total = 0;

    // Check entity type match
    if (patterns.entityType) {
      total++;
      if (data.chittyId && data.chittyId.includes(`-${patterns.entityType}-`)) {
        score += 0.3;
        matches++;
      }
    }

    // Check region match
    if (patterns.region) {
      total++;
      if (data.chittyId && data.chittyId.includes(`-${patterns.region}-`)) {
        score += 0.3;
        matches++;
      }
    }

    // Check trust level match
    if (patterns.trustLevel) {
      total++;
      if (data.trustLevel === patterns.trustLevel) {
        score += 0.2;
        matches++;
      }
    }

    // Check keyword matches in metadata
    if (patterns.keywords.length > 0) {
      const dataStr = JSON.stringify(data).toLowerCase();
      let keywordMatches = 0;

      for (const keyword of patterns.keywords) {
        if (dataStr.includes(keyword)) {
          keywordMatches++;
        }
      }

      if (keywordMatches > 0) {
        score += (keywordMatches / patterns.keywords.length) * 0.2;
        matches += keywordMatches / patterns.keywords.length;
        total++;
      }
    }

    // Normalize score
    if (total > 0) {
      return (matches / total);
    }

    return 0;
  }

  /**
   * Index a new ChittyID for search
   */
  async indexChittyID(chittyId, metadata = {}) {
    if (!this.ai || !this.env.CHITTY_VECTORS) {
      return false;
    }

    try {
      // Create searchable text from ChittyID and metadata
      const searchText = [
        chittyId,
        metadata.purpose || '',
        metadata.project || '',
        metadata.user || '',
        JSON.stringify(metadata)
      ].join(' ');

      // Generate embedding
      const embedding = await this.generateEmbedding(searchText);

      // Insert into Vectorize
      await this.env.CHITTY_VECTORS.upsert([
        {
          id: chittyId,
          values: embedding,
          metadata: {
            ...metadata,
            chittyId,
            indexed: new Date().toISOString()
          }
        }
      ]);

      return true;
    } catch (error) {
      console.error('Indexing error:', error);
      return false;
    }
  }
}