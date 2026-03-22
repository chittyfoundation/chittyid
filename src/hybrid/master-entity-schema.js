/**
 * Master Entity Schema for Hybrid ChittyID System
 * Single source of truth linking legal and technical ID systems
 * Integrates with ChittyOS ontology and Neon PostgreSQL
 */

export const MasterEntitySchema = {
  version: '1.0',
  namespace: 'chittyos.hybrid.entities',

  // Core entity structure
  entity: {
    id: {
      type: 'uuid',
      primary: true,
      generated: 'uuid_generate_v4()'
    },

    // Hybrid identifier system
    identifiers: {
      technical: {
        type: 'varchar(32)',
        format: /^[A-Z]{2}-[A-Z]-[A-Z]{3}-\d{4}-[A-Z]-\d{4}-\d{1,2}-[A-Z0-9]$/,
        example: 'AA-C-TSK-1234-I-25-7-X',
        unique: true,
        indexed: true
      },
      legal: {
        type: 'varchar(32)',
        format: /^\d{2}-[A-Z]-[A-Z]{3}-\d{4}-[A-Z]-\d{4}-\d{1,2}-[A-Z0-9]$/,
        example: '01-N-USA-1234-P-25-3-X',
        unique: true,
        indexed: true
      },
      internal: {
        type: 'uuid',
        generated: 'uuid_generate_v4()',
        unique: true
      }
    },

    // Metadata for classification and governance
    metadata: {
      entity_type: {
        type: 'varchar(1)',
        // @canon: chittycanon://gov/governance#core-types
        enum: ['P', 'L', 'T', 'E', 'A'],
        description: 'Person / Location / Thing / Event / Authority'
      },
      classification: {
        type: 'varchar(32)',
        enum: ['public', 'internal', 'confidential', 'restricted']
      },
      content_hash: {
        type: 'varchar(64)',
        description: 'SHA-256 hash for content binding'
      },
      lifecycle_status: {
        type: 'varchar(16)',
        enum: ['active', 'inactive', 'archived'],
        default: 'active'
      },

      // Stewardship information
      steward: {
        technical: {
          type: 'varchar(64)',
          description: 'Technical steward ID or team'
        },
        legal: {
          type: 'varchar(64)',
          description: 'Legal steward ID or team'
        }
      },

      // Compliance metadata
      compliance: {
        classification: {
          type: 'varchar(32)',
          description: 'Data classification level'
        },
        jurisdictions: {
          type: 'json',
          description: 'Array of applicable jurisdictions'
        },
        retention_policy: {
          type: 'varchar(64)',
          description: 'Data retention policy identifier'
        }
      },

      // Temporal tracking
      created_at: {
        type: 'timestamp',
        default: 'CURRENT_TIMESTAMP'
      },
      updated_at: {
        type: 'timestamp',
        default: 'CURRENT_TIMESTAMP',
        on_update: 'CURRENT_TIMESTAMP'
      },

      // VRF and cryptographic anchoring
      drand: {
        round: {
          type: 'bigint',
          description: 'drand beacon round number'
        },
        randomness: {
          type: 'varchar(128)',
          description: 'drand beacon randomness value'
        },
        signature: {
          type: 'varchar(256)',
          description: 'drand beacon signature'
        }
      }
    },

    // Actual entity content
    content: {
      type: 'jsonb',
      description: 'Entity-specific data and properties'
    }
  }
};

// PostgreSQL schema for Neon database
export const PostgreSQLSchema = `
-- Master entities table for hybrid ChittyID system
CREATE TABLE IF NOT EXISTS master_entities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Hybrid identifiers
  technical_id VARCHAR(32) UNIQUE NOT NULL,
  legal_id VARCHAR(32) UNIQUE NOT NULL,
  internal_id UUID UNIQUE DEFAULT uuid_generate_v4(),

  -- Entity classification
  -- @canon: chittycanon://gov/governance#core-types
  entity_type VARCHAR(1) NOT NULL CHECK (entity_type IN ('P', 'L', 'T', 'E', 'A')),
  classification VARCHAR(32) NOT NULL CHECK (classification IN ('public', 'internal', 'confidential', 'restricted')),

  -- Content and integrity
  content_hash VARCHAR(64) NOT NULL,
  lifecycle_status VARCHAR(16) DEFAULT 'active' CHECK (lifecycle_status IN ('active', 'inactive', 'archived')),

  -- Stewardship
  technical_steward VARCHAR(64),
  legal_steward VARCHAR(64),

  -- Compliance metadata
  compliance_classification VARCHAR(32),
  jurisdictions JSONB,
  retention_policy VARCHAR(64),

  -- Temporal tracking
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- VRF anchoring
  drand_round BIGINT,
  drand_randomness VARCHAR(128),
  drand_signature VARCHAR(256),

  -- Entity content
  content_data JSONB
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_master_entities_technical_id ON master_entities(technical_id);
CREATE INDEX IF NOT EXISTS idx_master_entities_legal_id ON master_entities(legal_id);
CREATE INDEX IF NOT EXISTS idx_master_entities_entity_type ON master_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_master_entities_classification ON master_entities(classification);
CREATE INDEX IF NOT EXISTS idx_master_entities_content_hash ON master_entities(content_hash);
CREATE INDEX IF NOT EXISTS idx_master_entities_created_at ON master_entities(created_at);

-- GIN index for JSONB content
CREATE INDEX IF NOT EXISTS idx_master_entities_content_gin ON master_entities USING GIN(content_data);
CREATE INDEX IF NOT EXISTS idx_master_entities_jurisdictions_gin ON master_entities USING GIN(jurisdictions);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_master_entities_updated_at BEFORE UPDATE
    ON master_entities FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
`;

// Governance rules mapping classification to permissions
export const GovernanceRules = {
  // Technical ID format validation
  technical_id: {
    format: /^[A-Z]{2}-[A-Z]-[A-Z]{3}-\d{4}-[A-Z]-\d{4}-\d{1,2}-[A-Z0-9]$/,
    components: {
      version: { position: 0, format: /^[A-Z]{2}$/, example: 'AA' },
      domain: { position: 1, format: /^[A-Z]$/, example: 'C' },
      namespace: { position: 2, format: /^[A-Z]{3}$/, example: 'TSK' },
      sequence: { position: 3, format: /^\d{4}$/, example: '1234' },
      type: { position: 4, format: /^[A-Z]$/, example: 'I' },
      yearmonth: { position: 5, format: /^\d{4}$/, example: '2507' },
      component: { position: 6, format: /^\d{1,2}$/, example: '7' },
      checksum: { position: 7, format: /^[A-Z0-9]$/, example: 'X' }
    }
  },

  // Legal ID format validation
  legal_id: {
    format: /^\d{2}-[A-Z]-[A-Z]{3}-\d{4}-[A-Z]-\d{4}-\d{1,2}-[A-Z0-9]$/,
    components: {
      version: { position: 0, format: /^\d{2}$/, example: '01' },
      region: { position: 1, format: /^[A-Z]$/, example: 'N' },
      jurisdiction: { position: 2, format: /^[A-Z]{3}$/, example: 'USA' },
      sequence: { position: 3, format: /^\d{4}$/, example: '1234' },
      type: { position: 4, format: /^[A-Z]$/, example: 'P' },
      yearmonth: { position: 5, format: /^\d{4}$/, example: '2507' },
      trust_level: { position: 6, format: /^\d{1,2}$/, example: '3' },
      checksum: { position: 7, format: /^[A-Z0-9]$/, example: 'X' }
    }
  },

  // Stewardship rules by entity type
  stewardship: {
    technical: {
      roles: ['platform-team', 'devops-team', 'development-team'],
      escalation: 'security-team'
    },
    legal: {
      roles: ['legal-team', 'compliance-team'],
      escalation: 'legal-director'
    }
  },

  // @canon: chittycanon://gov/governance#core-types
  // Access controls by canonical entity type (P/L/T/E/A)
  access_control: {
    'P': { // Person — actors with agency (natural, synthetic, legal)
      stewardship: 'legal',
      compliance_level: 'confidential',
      retention: 'legal_hold'
    },
    'L': { // Location — context in space (jurisdiction, venue)
      stewardship: 'technical',
      compliance_level: 'internal',
      retention: 'operational'
    },
    'T': { // Thing — objects without agency (document, asset, artifact)
      stewardship: 'technical',
      compliance_level: 'internal',
      retention: 'standard'
    },
    'E': { // Event — occurrences in time (transaction, decision, action)
      stewardship: 'technical',
      compliance_level: 'internal',
      retention: 'operational'
    },
    'A': { // Authority — sources of weight (credential, certification)
      stewardship: 'legal',
      compliance_level: 'confidential',
      retention: 'legal_hold'
    }
  }
};

/**
 * Entity factory for creating master entities with validation
 */
export class MasterEntityFactory {
  constructor(env) {
    this.env = env;
    this.db = env.DATABASE || env.DB;
    this.registryKV = env.SERVICE_REGISTRY;
  }

  /**
   * Create a new master entity with hybrid IDs
   * CRITICAL: Uses Cloudflare crypto.randomInt for SSSS generation as specified in research
   */
  async createEntity({
    entityType,
    classification,
    contentHash,
    contentData,
    jurisdiction = 'USA',
    drandBeacon,
    steward
  }) {
    // Validate inputs
    this.validateEntityType(entityType);
    this.validateClassification(classification);

    // Generate SSSS using Cloudflare crypto.randomInt (1000-9999 range from research)
    const ssss = crypto.randomInt(1000, 9999).toString().padStart(4, '0');

    // Generate hybrid IDs
    const technicalId = await this.generateTechnicalId({
      entityType,
      ssss,
      contentHash,
      drandBeacon
    });

    const legalId = await this.generateLegalId({
      entityType,
      ssss,
      contentHash,
      jurisdiction,
      drandBeacon
    });

    // Create entity record
    const entity = {
      technical_id: technicalId,
      legal_id: legalId,
      entity_type: entityType,
      classification,
      content_hash: contentHash,
      technical_steward: steward?.technical || this.getDefaultTechnicalSteward(entityType),
      legal_steward: steward?.legal || this.getDefaultLegalSteward(entityType),
      compliance_classification: this.getComplianceLevel(entityType),
      jurisdictions: [jurisdiction],
      retention_policy: this.getRetentionPolicy(entityType),
      drand_round: drandBeacon?.round,
      drand_randomness: drandBeacon?.randomness,
      drand_signature: drandBeacon?.signature,
      content_data: contentData
    };

    // Store in database
    if (this.db) {
      await this.storeEntity(entity);
    }

    // Store in registry
    await this.updateRegistry(entity);

    return entity;
  }

  /**
   * Generate technical ID: AA-C-TSK-1234-I-25-7-X
   */
  async generateTechnicalId({ entityType, ssss, contentHash, drandBeacon }) {
    const version = 'AA';
    const domain = 'C'; // Central domain
    const namespace = this.mapEntityTypeToNamespace(entityType);
    const type = 'I'; // Individual type
    const yearMonth = this.generateYearMonth();
    const component = '7'; // Version component

    const baseId = `${version}-${domain}-${namespace}-${ssss}-${type}-${yearMonth}-${component}`;

    // Calculate VRF checksum with content binding
    const checksum = await this.calculateVRFChecksum(baseId, contentHash, drandBeacon?.randomness);

    return `${baseId}-${checksum}`;
  }

  /**
   * Generate legal ID: 01-N-USA-1234-P-25-3-X
   */
  async generateLegalId({ entityType, ssss, contentHash, jurisdiction, drandBeacon }) {
    const version = '01';
    const region = this.getRegionForJurisdiction(jurisdiction);
    const entityTypeCode = this.mapEntityTypeToLegalType(entityType);
    const yearMonth = this.generateYearMonth();
    const trustLevel = '3'; // Default trust level

    const baseId = `${version}-${region}-${jurisdiction}-${ssss}-${entityTypeCode}-${yearMonth}-${trustLevel}`;

    // Calculate VRF checksum with content binding
    const checksum = await this.calculateVRFChecksum(baseId, contentHash, drandBeacon?.randomness);

    return `${baseId}-${checksum}`;
  }

  /**
   * VRF-based checksum calculation with content binding
   */
  async calculateVRFChecksum(baseId, contentHash, drandValue) {
    const input = `${drandValue || ''}${baseId}${contentHash}`;

    // Use Web Crypto API for SHA-256
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = new Uint8Array(hashBuffer);

    // Convert to single character checksum
    let sum = 0;
    for (let i = 0; i < hashArray.length; i++) {
      sum += hashArray[i];
    }

    return (sum % 36).toString(36).toUpperCase();
  }

  // Utility methods
  // @canon: chittycanon://gov/governance#core-types
  validateEntityType(entityType) {
    const validTypes = ['P', 'L', 'T', 'E', 'A'];
    if (!validTypes.includes(entityType)) {
      throw new Error(`Invalid entity type: ${entityType}. Must be one of P (Person), L (Location), T (Thing), E (Event), A (Authority)`);
    }
  }

  validateClassification(classification) {
    const validClassifications = ['public', 'internal', 'confidential', 'restricted'];
    if (!validClassifications.includes(classification)) {
      throw new Error(`Invalid classification: ${classification}`);
    }
  }

  // @canon: chittycanon://gov/governance#core-types
  mapEntityTypeToNamespace(entityType) {
    const namespaceMap = {
      'P': 'PER', // Person — actors with agency
      'L': 'LOC', // Location — context in space
      'T': 'THG', // Thing — objects without agency
      'E': 'EVT', // Event — occurrences in time
      'A': 'AUT'  // Authority — sources of weight
    };
    return namespaceMap[entityType] || 'THG';
  }

  // Entity type IS the legal type — no mapping needed, pass through
  mapEntityTypeToLegalType(entityType) {
    return entityType; // P, L, T, E, or A directly
  }

  getRegionForJurisdiction(jurisdiction) {
    const regionMap = {
      'USA': 'N', 'CAN': 'N', // North America
      'GBR': 'E', 'DEU': 'E', 'FRA': 'E', // Europe
      'JPN': 'A', 'CHN': 'A', // Asia
      'AUS': 'P', 'NZL': 'P' // Pacific
    };
    return regionMap[jurisdiction] || 'N';
  }

  generateYearMonth() {
    const now = new Date();
    const year = now.getFullYear() % 100;
    const month = now.getMonth() + 1;
    return `${year}${month.toString().padStart(2, '0')}`;
  }

  // @canon: chittycanon://gov/governance#core-types
  getDefaultTechnicalSteward(entityType) {
    const stewardMap = {
      'P': 'identity-team',
      'L': 'platform-team',
      'T': 'platform-team',
      'E': 'platform-team',
      'A': 'security-team'
    };
    return stewardMap[entityType] || 'platform-team';
  }

  getDefaultLegalSteward(entityType) {
    const legalStewardMap = {
      'P': 'legal-team',
      'L': 'compliance-team',
      'T': 'compliance-team',
      'E': 'compliance-team',
      'A': 'legal-team'
    };
    return legalStewardMap[entityType] || 'compliance-team';
  }

  getComplianceLevel(entityType) {
    const complianceMap = {
      'P': 'confidential',
      'L': 'internal',
      'T': 'internal',
      'E': 'internal',
      'A': 'confidential'
    };
    return complianceMap[entityType] || 'internal';
  }

  getRetentionPolicy(entityType) {
    const retentionMap = {
      'P': 'legal_hold',
      'L': 'operational',
      'T': 'standard',
      'E': 'operational',
      'A': 'legal_hold'
    };
    return retentionMap[entityType] || 'standard';
  }

  async storeEntity(entity) {
    // Store in PostgreSQL database
    const query = `
      INSERT INTO master_entities (
        technical_id, legal_id, entity_type, classification,
        content_hash, technical_steward, legal_steward,
        compliance_classification, jurisdictions, retention_policy,
        drand_round, drand_randomness, drand_signature, content_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id, created_at
    `;

    const values = [
      entity.technical_id,
      entity.legal_id,
      entity.entity_type,
      entity.classification,
      entity.content_hash,
      entity.technical_steward,
      entity.legal_steward,
      entity.compliance_classification,
      JSON.stringify(entity.jurisdictions),
      entity.retention_policy,
      entity.drand_round,
      entity.drand_randomness,
      entity.drand_signature,
      JSON.stringify(entity.content_data)
    ];

    const result = await this.db.prepare(query).bind(...values).run();
    return result;
  }

  async updateRegistry(entity) {
    // Store entity mapping in SERVICE_REGISTRY KV
    const entityKey = `entity:${entity.technical_id}`;
    const mappingKey = `mapping:${entity.technical_id}:${entity.legal_id}`;

    await Promise.all([
      this.registryKV.put(entityKey, JSON.stringify(entity)),
      this.registryKV.put(mappingKey, JSON.stringify({
        technical_id: entity.technical_id,
        legal_id: entity.legal_id,
        entity_type: entity.entity_type,
        created_at: new Date().toISOString()
      }))
    ]);
  }
}