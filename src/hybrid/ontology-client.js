/**
 * Ontology-Aware ChittyID Client
 * Integrates with ChittyOS ontology for classification-based ID generation
 */

export class OntologyAwareClient {
  constructor({ serverUrl, fallbackUrl, ontologyUrl, pipelineRequired = true }) {
    this.serverUrl = serverUrl;
    this.fallbackUrl = fallbackUrl;
    this.ontologyUrl = ontologyUrl;
    this.pipelineRequired = pipelineRequired;
    this.apiKey = process.env.CHITTY_API_KEY;

    if (!this.apiKey) {
      throw new Error('CHITTY_API_KEY environment variable required');
    }
  }

  /**
   * Classify entity using ChittyOS ontology
   */
  async classifyEntity(entityPath) {
    const response = await fetch(`${this.ontologyUrl}/classify?entity=${encodeURIComponent(entityPath)}`, {
      headers: this.getHeaders()
    });

    if (!response.ok) {
      throw new Error(`Classification failed: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Request hybrid ChittyID pair (technical + legal)
   */
  async requestHybridChittyID({ type, entityPath, classification, format, jurisdiction, metadata }) {
    // First classify if not provided
    const entityClassification = classification || await this.classifyEntity(entityPath);

    const requestBody = {
      type,
      entity_path: entityPath,
      classification: entityClassification,
      format,
      jurisdiction,
      metadata: {
        ...metadata,
        ontology_version: '1.0',
        classification_timestamp: new Date().toISOString()
      }
    };

    try {
      // Try main server first
      const response = await fetch(`${this.ontologyUrl}/generate-hybrid`, {
        method: 'POST',
        headers: this.getHeaders(true), // Include pipeline header
        body: JSON.stringify(requestBody)
      });

      if (response.ok) {
        const result = await response.json();
        return {
          ...result,
          fallback_mode: false,
          classification: entityClassification
        };
      }

      // Fall back to basic ID generation if ontology service unavailable
      console.warn('Ontology service unavailable, falling back to basic generation');
      return await this.fallbackToBasicGeneration(requestBody);

    } catch (error) {
      console.warn(`Hybrid generation failed: ${error.message}`);
      return await this.fallbackToBasicGeneration(requestBody);
    }
  }

  /**
   * Translate between technical and legal ID formats
   */
  async translateId(id) {
    const response = await fetch(`${this.serverUrl}/translate`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        id,
        timestamp: Date.now()
      })
    });

    if (!response.ok) {
      throw new Error(`Translation failed: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Verify ChittyID with ontology context
   */
  async verifyChittyID(id) {
    const response = await fetch(`${this.serverUrl}/verify/${id}`, {
      headers: this.getHeaders()
    });

    if (!response.ok) {
      throw new Error(`Verification failed: ${response.statusText}`);
    }

    const result = await response.json();

    // Enhance with classification if available
    try {
      const mapping = await this.lookupChittyID(id);
      if (mapping && mapping.classification) {
        result.classification = mapping.classification.type;
        result.entity_type = mapping.entity_type;
      }
    } catch (error) {
      // Classification lookup failed, but verification succeeded
    }

    return result;
  }

  /**
   * Lookup ChittyID with ontology metadata
   */
  async lookupChittyID(id) {
    const response = await fetch(`${this.ontologyUrl}/lookup?id=${encodeURIComponent(id)}`, {
      headers: this.getHeaders()
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Lookup failed: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Reconcile fallback ChittyIDs
   */
  async reconcileChittyID(fallbackId) {
    const response = await fetch(`${this.serverUrl}/reconcile`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        fallback_ids: [fallbackId],
        timestamp: Date.now()
      })
    });

    if (!response.ok) {
      throw new Error(`Reconciliation failed: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Bulk reconcile fallback ChittyIDs
   */
  async reconcileBulkChittyIDs(fallbackIds) {
    const response = await fetch(`${this.serverUrl}/reconcile`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        fallback_ids: fallbackIds,
        timestamp: Date.now()
      })
    });

    if (!response.ok) {
      throw new Error(`Bulk reconciliation failed: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Request bulk hybrid ChittyIDs
   */
  async requestBulkHybridChittyIDs({ count, type, format, jurisdiction, entityPath }) {
    const classification = await this.classifyEntity(entityPath);

    const promises = [];
    for (let i = 0; i < count; i++) {
      promises.push(
        this.requestHybridChittyID({
          type: `${type}-${i + 1}`,
          entityPath,
          classification,
          format,
          jurisdiction,
          metadata: {
            bulk_index: i + 1,
            bulk_total: count
          }
        })
      );
    }

    return await Promise.all(promises);
  }

  /**
   * Fallback to basic generation when ontology service unavailable
   */
  async fallbackToBasicGeneration(requestBody) {
    // Use the enhanced client for fallback
    const { EnhancedChittyIDClient } = await import('./client-enhanced.js');
    const basicClient = new EnhancedChittyIDClient({
      apiKey: this.apiKey,
      fallbackEnabled: true
    });

    const basicId = await basicClient.requestChittyID({
      type: requestBody.type,
      metadata: requestBody.metadata
    });

    // Generate companion legal ID (simplified)
    const legalId = this.generateLegalIdFromTechnical(basicId, requestBody.jurisdiction);

    return {
      technical_id: basicId,
      legal_id: legalId,
      fallback_mode: true,
      classification: requestBody.classification,
      note: 'Generated with basic fallback - ontology service unavailable'
    };
  }

  /**
   * Generate legal ID from technical ID (simplified mapping)
   */
  generateLegalIdFromTechnical(technicalId, jurisdiction = 'USA') {
    // Parse technical ID: AA-C-TSK-1234-I-25-7-X
    const parts = technicalId.split('-');
    if (parts.length !== 8) {
      throw new Error('Invalid technical ID format');
    }

    const [version, domain, namespace, sequence, type, yearMonth, component, checksum] = parts;

    // Map to legal format: 01-N-USA-1234-P-25-3-X
    const legalVersion = '01';
    const region = this.getRegionForJurisdiction(jurisdiction);
    const legalType = this.mapTechnicalToLegalType(type);
    const trustLevel = '3'; // Default trust level

    return `${legalVersion}-${region}-${jurisdiction}-${sequence}-${legalType}-${yearMonth}-${trustLevel}-${checksum}`;
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
   * Map technical type to legal type
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

  /**
   * Get request headers with optional pipeline enforcement
   */
  getHeaders(includePipeline = false) {
    const headers = {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
      'User-Agent': 'ChittyOS-CLI/1.0'
    };

    if (includePipeline && this.pipelineRequired) {
      headers['X-ChittyOS-Pipeline'] = 'Router→Intake→Trust→Authorization→Generation';
    }

    return headers;
  }
}