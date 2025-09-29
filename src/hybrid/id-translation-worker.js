/**
 * Hybrid ChittyID Translation Worker
 * Cloudflare Worker for translating between technical and legal ID formats
 * Uses existing KV infrastructure and registry as source of truth
 */

export class IDTranslationService {
  constructor(env) {
    this.env = env;
    this.serviceRegistry = env.SERVICE_REGISTRY;
    this.platformKV = env.PLATFORM_KV;
  }

  /**
   * Main translation handler - routes to appropriate translation method
   */
  async translate(translationRequest) {
    const { id, direction, batch = false } = translationRequest;

    if (batch) {
      return await this.handleBatchTranslation(translationRequest);
    }

    // Detect ID format and translate accordingly
    if (this.isTechnicalId(id)) {
      return await this.handleTechnicalToLegal(id, direction);
    } else if (this.isLegalId(id)) {
      return await this.handleLegalToTechnical(id, direction);
    } else {
      throw new Error(`Invalid ID format: ${id}`);
    }
  }

  /**
   * Translate technical ID to legal ID format
   * Technical: AA-C-TSK-1234-I-25-7-X → Legal: 01-N-USA-1234-P-25-3-X
   */
  async handleTechnicalToLegal(technicalId, direction) {
    // Look up mapping in registry first (fastest path)
    const mappingKey = `hybrid:${technicalId}`;
    const existingMapping = await this.serviceRegistry.get(mappingKey);

    if (existingMapping) {
      const mapping = JSON.parse(existingMapping);
      return {
        input_id: technicalId,
        output_id: mapping.legal_id,
        translation_type: 'technical_to_legal',
        source: 'registry_lookup',
        entity_type: mapping.entity_type,
        timestamp: new Date().toISOString()
      };
    }

    // If not in registry, parse and construct legal ID
    const legalId = await this.constructLegalFromTechnical(technicalId);

    // Store the mapping for future lookups
    await this.storeTranslationMapping(technicalId, legalId);

    return {
      input_id: technicalId,
      output_id: legalId,
      translation_type: 'technical_to_legal',
      source: 'constructed',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Translate legal ID to technical ID format
   * Legal: 01-N-USA-1234-P-25-3-X → Technical: AA-C-TSK-1234-I-25-7-X
   */
  async handleLegalToTechnical(legalId, direction) {
    // Look up mapping in registry first
    const mappingKey = `hybrid:${legalId}`;
    const existingMapping = await this.serviceRegistry.get(mappingKey);

    if (existingMapping) {
      const mapping = JSON.parse(existingMapping);
      return {
        input_id: legalId,
        output_id: mapping.technical_id,
        translation_type: 'legal_to_technical',
        source: 'registry_lookup',
        entity_type: mapping.entity_type,
        timestamp: new Date().toISOString()
      };
    }

    // If not in registry, parse and construct technical ID
    const technicalId = await this.constructTechnicalFromLegal(legalId);

    // Store the mapping for future lookups
    await this.storeTranslationMapping(technicalId, legalId);

    return {
      input_id: legalId,
      output_id: technicalId,
      translation_type: 'legal_to_technical',
      source: 'constructed',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Handle batch translation requests
   */
  async handleBatchTranslation({ ids, direction }) {
    const results = [];
    const errors = [];

    // Process in parallel with concurrency limit
    const batchSize = 10;
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      const batchPromises = batch.map(async (id) => {
        try {
          const result = await this.translate({ id, direction });
          return result;
        } catch (error) {
          return {
            input_id: id,
            error: error.message,
            timestamp: new Date().toISOString()
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter(r => !r.error));
      errors.push(...batchResults.filter(r => r.error));
    }

    return {
      translation_type: 'batch',
      total_requested: ids.length,
      successful_translations: results.length,
      errors: errors.length,
      results,
      errors: errors
    };
  }

  /**
   * Construct legal ID from technical ID components
   */
  async constructLegalFromTechnical(technicalId) {
    const parts = technicalId.split('-');
    if (parts.length !== 8) {
      throw new Error('Invalid technical ID format');
    }

    const [version, domain, namespace, sequence, type, yearMonth, component, checksum] = parts;

    // Map technical components to legal equivalents
    const legalVersion = '01';
    const region = 'N'; // Default to North America
    const jurisdiction = 'USA'; // Default jurisdiction
    const legalType = this.mapTechnicalToLegalType(type);
    const trustLevel = '3'; // Default trust level

    return `${legalVersion}-${region}-${jurisdiction}-${sequence}-${legalType}-${yearMonth}-${trustLevel}-${checksum}`;
  }

  /**
   * Construct technical ID from legal ID components
   */
  async constructTechnicalFromLegal(legalId) {
    const parts = legalId.split('-');
    if (parts.length !== 8) {
      throw new Error('Invalid legal ID format');
    }

    const [version, region, jurisdiction, sequence, type, yearMonth, trustLevel, checksum] = parts;

    // Map legal components to technical equivalents
    const technicalVersion = 'AA';
    const domain = 'C'; // Central domain
    const namespace = this.inferNamespaceFromLegalType(type);
    const technicalType = this.mapLegalToTechnicalType(type);
    const component = '7'; // Default component

    return `${technicalVersion}-${domain}-${namespace}-${sequence}-${technicalType}-${yearMonth}-${component}-${checksum}`;
  }

  /**
   * Store bidirectional translation mapping in KV
   */
  async storeTranslationMapping(technicalId, legalId) {
    const mappingData = {
      technical_id: technicalId,
      legal_id: legalId,
      created_at: new Date().toISOString(),
      source: 'translation_service'
    };

    // Store in both directions for fast lookup
    await Promise.all([
      this.serviceRegistry.put(`hybrid:${technicalId}`, JSON.stringify(mappingData)),
      this.serviceRegistry.put(`hybrid:${legalId}`, JSON.stringify(mappingData)),
      this.platformKV.put(`translation:${technicalId}:${legalId}`, JSON.stringify(mappingData))
    ]);
  }

  /**
   * Verify ID format patterns
   */
  isTechnicalId(id) {
    const technicalPattern = /^[A-Z]{2}-[A-Z]-[A-Z]{3}-\d{4}-[A-Z]-\d{4}-\d{1,2}-[A-Z0-9]$/;
    return technicalPattern.test(id);
  }

  isLegalId(id) {
    const legalPattern = /^\d{2}-[A-Z]-[A-Z]{3}-\d{4}-[A-Z]-\d{4}-\d{1,2}-[A-Z0-9]$/;
    return legalPattern.test(id);
  }

  /**
   * Type mapping utilities
   */
  mapTechnicalToLegalType(techType) {
    const typeMap = {
      'I': 'P', // Individual -> Person
      'D': 'T', // Document -> Thing
      'C': 'E', // Claim -> Event
      'E': 'T', // Evidence -> Thing
      'L': 'T'  // Ledger -> Thing
    };
    return typeMap[techType] || 'T';
  }

  mapLegalToTechnicalType(legalType) {
    const typeMap = {
      'P': 'I', // Person -> Individual
      'T': 'D', // Thing -> Document
      'E': 'C', // Event -> Claim
      'L': 'L'  // Location -> Location
    };
    return typeMap[legalType] || 'D';
  }

  inferNamespaceFromLegalType(legalType) {
    const namespaceMap = {
      'P': 'LEG', // Person (legal entity)
      'T': 'DOC', // Thing (document)
      'E': 'EVT', // Event
      'L': 'LOC'  // Location
    };
    return namespaceMap[legalType] || 'DOC';
  }

  /**
   * Health check for translation service
   */
  async healthCheck() {
    try {
      // Test registry connectivity
      await this.serviceRegistry.get('health:translation');

      // Test platform KV
      await this.platformKV.get('health:translation');

      return {
        status: 'healthy',
        service: 'id_translation',
        registry_connected: true,
        platform_kv_connected: true,
        capabilities: ['technical_to_legal', 'legal_to_technical', 'batch_translation']
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        service: 'id_translation',
        error: error.message
      };
    }
  }
}

/**
 * Cloudflare Worker export for ID translation
 */
export default {
  async fetch(request, env, ctx) {
    const translationService = new IDTranslationService(env);
    const url = new URL(request.url);

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      if (url.pathname === '/translate') {
        if (request.method === 'GET') {
          // Single ID translation via query params
          const id = url.searchParams.get('id');
          const direction = url.searchParams.get('direction');

          if (!id) {
            return new Response(JSON.stringify({
              error: 'Missing required parameter: id'
            }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const result = await translationService.translate({ id, direction });
          return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });

        } else if (request.method === 'POST') {
          // Batch translation via POST body
          const requestData = await request.json();
          const result = await translationService.translate(requestData);

          return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

      } else if (url.pathname === '/health') {
        const health = await translationService.healthCheck();

        return new Response(JSON.stringify(health), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } else if (url.pathname === '/formats') {
        // Return supported format information
        return new Response(JSON.stringify({
          supported_formats: {
            technical: {
              pattern: '^[A-Z]{2}-[A-Z]-[A-Z]{3}-\\d{4}-[A-Z]-\\d{4}-\\d{1,2}-[A-Z0-9]$',
              example: 'AA-C-TSK-1234-I-25-7-X',
              components: ['version', 'domain', 'namespace', 'sequence', 'type', 'yearMonth', 'component', 'checksum']
            },
            legal: {
              pattern: '^\\d{2}-[A-Z]-[A-Z]{3}-\\d{4}-[A-Z]-\\d{4}-\\d{1,2}-[A-Z0-9]$',
              example: '01-N-USA-1234-P-25-3-X',
              components: ['version', 'region', 'jurisdiction', 'sequence', 'type', 'yearMonth', 'trustLevel', 'checksum']
            }
          },
          translation_modes: ['single', 'batch'],
          supported_directions: ['bidirectional']
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response('Not Found', { status: 404, headers: corsHeaders });

    } catch (error) {
      console.error('Translation service error:', error);

      return new Response(JSON.stringify({
        error: 'Translation service error',
        message: error.message,
        service: 'id_translation'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};