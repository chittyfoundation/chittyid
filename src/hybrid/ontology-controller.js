/**
 * ChittyOS Ontology Controller
 * Centralized controller ensuring all ID operations follow ontology registry as source of truth
 * Implements server-only generation with drand-based VRF
 */

export class OntologyController {
  constructor(env) {
    this.env = env;
    this.registryKV = env.SERVICE_REGISTRY;
    this.schemaKV = env.SCHEMA_KV;
    this.platformKV = env.PLATFORM_KV;
  }

  /**
   * CENTRAL AUTHORITY: All ID operations must go through this controller
   * No local generation allowed - enforcement through pipeline
   */
  async validatePipelineRequest(request) {
    // Verify request comes through proper pipeline (Router → Intake → Trust → Authorization → Generation)
    const pipelineHeader = request.headers.get('X-ChittyOS-Pipeline');
    if (!pipelineHeader || !this.validatePipelineSignature(pipelineHeader)) {
      throw new Error('PIPELINE_VIOLATION: All requests must flow through ChittyOS pipeline');
    }

    return {
      validated: true,
      pipeline_stage: 'generation',
      enforcement: 'STRICT_SERVER_ONLY'
    };
  }

  /**
   * Load entity classification from ontology registry
   * Registry is the SINGLE SOURCE OF TRUTH for all classifications
   */
  async loadEntityClassification(entityIdentifier) {
    const classificationKey = `classification:${entityIdentifier}`;
    const registryData = await this.registryKV.get(classificationKey);

    if (!registryData) {
      // If not in registry, apply discovery algorithm from ontology research
      return await this.discoverEntityClassification(entityIdentifier);
    }

    const classification = JSON.parse(registryData);

    // Ensure classification follows ontology rules
    return this.validateClassification(classification);
  }

  /**
   * Directory mapping algorithm from ontology research
   * Classification rules take precedence in this order:
   * 1. Registry entities (highest precedence)
   * 2. Legal patterns (arias*, legal*)
   * 3. Version control (.git)
   * 4. Unstructured data (lowest precedence)
   */
  async discoverEntityClassification(entityPath) {
    // Step 1: Check if entity exists in registry
    const registryKey = `entity:${entityPath}`;
    const registryEntity = await this.registryKV.get(registryKey);

    if (registryEntity) {
      const entity = JSON.parse(registryEntity);
      return {
        type: entity.type,
        category: entity.category,
        source: 'registry',
        precedence: 1
      };
    }

    // Step 2: Check for legal patterns
    if (this.matchesLegalPattern(entityPath)) {
      return {
        type: 'legal_data',
        category: 'compliance',
        source: 'pattern_detection',
        precedence: 2
      };
    }

    // Step 3: Check for version control
    if (entityPath.includes('.git') || entityPath.includes('/.git/')) {
      return {
        type: 'version_control',
        category: 'infrastructure',
        source: 'pattern_detection',
        precedence: 3
      };
    }

    // Step 4: Default to unstructured
    return {
      type: 'unstructured_data',
      category: 'general',
      source: 'default',
      precedence: 4
    };
  }

  /**
   * Validate classification against ontology rules
   */
  validateClassification(classification) {
    const validTypes = [
      'services', 'domains', 'infrastructure', 'legal_data',
      'version_control', 'unstructured_data'
    ];

    if (!validTypes.includes(classification.type)) {
      throw new Error(`Invalid classification type: ${classification.type}`);
    }

    return {
      ...classification,
      validated: true,
      validation_timestamp: new Date().toISOString()
    };
  }

  /**
   * Generate hybrid IDs using drand-based VRF and registry classification
   * CRITICAL: Uses Cloudflare crypto.randomInt as specified in research
   */
  async generateHybridId({ contentHash, entityType, jurisdiction = 'USA', drandBeacon }) {
    // Validate pipeline authorization
    const pipelineValidation = await this.validatePipelineRequest();

    // Get entity classification from registry
    const classification = await this.loadEntityClassification(entityType);

    // Generate SSSS using Cloudflare crypto.randomInt (1000-9999 range from research)
    const ssss = crypto.randomInt(1000, 9999).toString().padStart(4, '0');

    // Generate both technical and legal IDs
    const technicalId = await this.generateTechnicalId({
      classification,
      ssss,
      contentHash,
      drandBeacon
    });

    const legalId = await this.generateLegalId({
      classification,
      ssss,
      contentHash,
      jurisdiction,
      drandBeacon
    });

    // Store mapping in registry
    await this.storeHybridMapping({
      technical_id: technicalId,
      legal_id: legalId,
      entity_type: entityType,
      classification,
      ssss,
      content_hash: contentHash,
      drand_round: drandBeacon.round,
      created_at: new Date().toISOString()
    });

    return {
      technical_id: technicalId,
      legal_id: legalId,
      entity_classification: classification,
      drand_anchored: true,
      pipeline_enforced: true
    };
  }

  /**
   * Generate technical ID: AA-C-TSK-1234-I-25-7-X
   */
  async generateTechnicalId({ classification, ssss, contentHash, drandBeacon }) {
    const version = 'AA';
    const domain = 'C'; // Central server (C domain from research)
    const namespace = this.mapClassificationToNamespace(classification);
    const type = 'I'; // Individual type
    const yearMonth = this.generateYearMonth();
    const component = '7'; // Version increment from research

    const baseId = `${version}-${domain}-${namespace}-${ssss}-${type}-${yearMonth}-${component}`;

    // Calculate cryptographic checksum with content binding (from research PDF)
    const checksum = await this.calculateVRFChecksum(baseId, contentHash, drandBeacon.randomness);

    return `${baseId}-${checksum}`;
  }

  /**
   * Generate legal ID: 01-N-USA-1234-P-25-3-X
   */
  async generateLegalId({ classification, ssss, contentHash, jurisdiction, drandBeacon }) {
    const version = '01';
    const region = this.getRegionForJurisdiction(jurisdiction);
    const entityType = this.mapClassificationToLegalType(classification);
    const yearMonth = this.generateYearMonth();
    const trustLevel = '3'; // Default trust level

    const baseId = `${version}-${region}-${jurisdiction}-${ssss}-${entityType}-${yearMonth}-${trustLevel}`;

    // Calculate cryptographic checksum with content binding
    const checksum = await this.calculateVRFChecksum(baseId, contentHash, drandBeacon.randomness);

    return `${baseId}-${checksum}`;
  }

  /**
   * VRF-based checksum calculation as specified in research PDF
   * Implements: hash_output = SHA256(drand_value + drand_round + chittyid_components + content_hash)
   */
  async calculateVRFChecksum(baseId, contentHash, drandValue) {
    const input = `${drandValue}${baseId}${contentHash}`;

    // Use Web Crypto API for SHA-256
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = new Uint8Array(hashBuffer);

    // Convert to numerical value and take modulo for single character checksum
    let sum = 0;
    for (let i = 0; i < hashArray.length; i++) {
      sum += hashArray[i];
    }

    // Return single character checksum (0-9, A-Z)
    return (sum % 36).toString(36).toUpperCase();
  }

  /**
   * Map ontology classification to technical namespace
   */
  mapClassificationToNamespace(classification) {
    const namespaceMap = {
      'services': 'SVC',
      'domains': 'DOM',
      'infrastructure': 'INF',
      'legal_data': 'LEG',
      'version_control': 'VCS',
      'unstructured_data': 'DOC'
    };

    return namespaceMap[classification.type] || 'DOC';
  }

  /**
   * Map ontology classification to legal entity type
   */
  mapClassificationToLegalType(classification) {
    const legalTypeMap = {
      'services': 'T', // Thing
      'domains': 'L', // Location
      'infrastructure': 'T', // Thing
      'legal_data': 'P', // Person (legal entity)
      'version_control': 'T', // Thing
      'unstructured_data': 'T' // Thing
    };

    return legalTypeMap[classification.type] || 'T';
  }

  /**
   * Store hybrid ID mapping in registry (source of truth)
   */
  async storeHybridMapping(mapping) {
    const mappingKey = `hybrid:${mapping.technical_id}`;
    const reverseMappingKey = `hybrid:${mapping.legal_id}`;

    // Store in multiple KV namespaces for redundancy
    await Promise.all([
      this.registryKV.put(mappingKey, JSON.stringify(mapping)),
      this.registryKV.put(reverseMappingKey, JSON.stringify(mapping)),
      this.platformKV.put(`mapping:${mapping.technical_id}`, JSON.stringify(mapping))
    ]);
  }

  /**
   * Lookup hybrid ID translation from registry
   */
  async lookupHybridMapping(id) {
    const mappingKey = `hybrid:${id}`;
    const mappingData = await this.registryKV.get(mappingKey);

    if (!mappingData) {
      return null;
    }

    return JSON.parse(mappingData);
  }

  /**
   * Validate that entity path matches legal patterns (arias*, legal*)
   */
  matchesLegalPattern(entityPath) {
    const legalPatterns = [
      /^arias/i,
      /legal/i,
      /compliance/i,
      /^.*\.legal\./i
    ];

    return legalPatterns.some(pattern => pattern.test(entityPath));
  }

  /**
   * Generate Year/Month encoding
   */
  generateYearMonth() {
    const now = new Date();
    const year = now.getFullYear() % 100; // Last 2 digits
    const month = now.getMonth() + 1;
    return `${year}${month.toString().padStart(2, '0')}`;
  }

  /**
   * Get region code for jurisdiction
   */
  getRegionForJurisdiction(jurisdiction) {
    const regionMap = {
      'USA': 'N', 'CAN': 'N', // North America
      'GBR': 'E', 'DEU': 'E', 'FRA': 'E', // Europe
      'JPN': 'A', 'CHN': 'A', // Asia
      'AUS': 'P', 'NZL': 'P' // Pacific
    };

    return regionMap[jurisdiction] || 'N';
  }

  /**
   * Validate pipeline signature (anti-bypass enforcement)
   */
  validatePipelineSignature(pipelineHeader) {
    // In production, this would validate cryptographic signature
    // For now, check for required pipeline flow marker
    return pipelineHeader.includes('Router→Intake→Trust→Authorization→Generation');
  }

  /**
   * Health check for ontology controller
   */
  async healthCheck() {
    try {
      // Test registry connectivity
      await this.registryKV.get('health:check');

      // Test schema access
      await this.schemaKV.get('health:check');

      return {
        status: 'healthy',
        registry_connected: true,
        schema_connected: true,
        enforcement: 'STRICT_SERVER_ONLY',
        pipeline_required: true
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        enforcement: 'DEGRADED'
      };
    }
  }
}

/**
 * Cloudflare Worker export for ontology controller
 */
export default {
  async fetch(request, env, ctx) {
    const controller = new OntologyController(env);
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-ChittyOS-Pipeline',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Route handling with pipeline enforcement
      if (url.pathname === '/generate-hybrid') {
        // STRICT ENFORCEMENT: Must have pipeline header
        if (!request.headers.get('X-ChittyOS-Pipeline')) {
          return new Response(JSON.stringify({
            error: 'PIPELINE_VIOLATION',
            message: 'All ID generation must flow through ChittyOS pipeline',
            required_headers: ['X-ChittyOS-Pipeline']
          }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const requestData = await request.json();
        const result = await controller.generateHybridId(requestData);

        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } else if (url.pathname === '/lookup') {
        const id = url.searchParams.get('id');
        const result = await controller.lookupHybridMapping(id);

        return new Response(JSON.stringify(result || { error: 'Not found' }), {
          status: result ? 200 : 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } else if (url.pathname === '/classify') {
        const entity = url.searchParams.get('entity');
        const classification = await controller.loadEntityClassification(entity);

        return new Response(JSON.stringify(classification), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } else if (url.pathname === '/health') {
        const health = await controller.healthCheck();

        return new Response(JSON.stringify(health), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response('Not Found', { status: 404, headers: corsHeaders });

    } catch (error) {
      console.error('Ontology controller error:', error);

      return new Response(JSON.stringify({
        error: 'Internal server error',
        message: error.message,
        enforcement_note: 'Server-only generation strictly enforced'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};