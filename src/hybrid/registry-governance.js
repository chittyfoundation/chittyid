/**
 * Registry-Based Governance System
 * Uses ChittyOS Service Registry as the single source of truth for all governance decisions
 */

import { GovernanceRules } from './master-entity-schema.js';

export class RegistryGovernance {
  constructor(env) {
    this.env = env;
    this.serviceRegistry = env.SERVICE_REGISTRY;
    this.platformKV = env.PLATFORM_KV;
    this.auditLog = env.AUDIT_LOGS || env.PLATFORM_KV; // Fallback to KV if R2 not available
  }

  /**
   * CENTRAL AUTHORITY: All governance decisions flow through registry
   * Registry contains the definitive classification and stewardship assignments
   */
  async enforceGovernancePolicy(entity, operation, context = {}) {
    // Step 1: Get authoritative classification from registry
    const classification = await this.getAuthoritativeClassification(entity);

    // Step 2: Load governance rules for this classification
    const governanceRules = await this.loadGovernanceRules(classification);

    // Step 3: Validate operation against rules
    const validation = await this.validateOperation(operation, governanceRules, context);

    // Step 4: Enforce stewardship requirements
    const stewardshipValidation = await this.validateStewardship(entity, operation, context);

    // Step 5: Log governance decision
    await this.logGovernanceDecision({
      entity,
      operation,
      classification,
      validation,
      stewardshipValidation,
      timestamp: new Date().toISOString(),
      context
    });

    return {
      authorized: validation.valid && stewardshipValidation.valid,
      classification,
      governance_rules: governanceRules,
      validation,
      stewardship: stewardshipValidation,
      registry_source: true
    };
  }

  /**
   * Get authoritative entity classification from registry
   * Registry is the SINGLE SOURCE OF TRUTH
   */
  async getAuthoritativeClassification(entity) {
    const classificationKey = `classification:${entity.id || entity.path || entity.identifier}`;
    const registryData = await this.serviceRegistry.get(classificationKey);

    if (!registryData) {
      // Entity not in registry - apply discovery and register it
      const discoveredClassification = await this.discoverAndRegisterEntity(entity);
      return discoveredClassification;
    }

    const classification = JSON.parse(registryData);

    // Validate classification is still current
    if (this.isClassificationStale(classification)) {
      const updatedClassification = await this.refreshEntityClassification(entity, classification);
      return updatedClassification;
    }

    return classification;
  }

  /**
   * Load governance rules based on entity classification
   */
  async loadGovernanceRules(classification) {
    const rulesKey = `governance:${classification.type}:${classification.category}`;
    const customRules = await this.platformKV.get(rulesKey);

    // Start with base rules from schema
    const baseRules = this.getBaseGovernanceRules(classification.type);

    // Merge with custom rules if they exist
    if (customRules) {
      const custom = JSON.parse(customRules);
      return this.mergeGovernanceRules(baseRules, custom);
    }

    return baseRules;
  }

  /**
   * Get base governance rules from master schema
   */
  getBaseGovernanceRules(entityType) {
    switch (entityType) {
      case 'services':
        return {
          id_format: 'technical',
          stewardship: 'technical',
          compliance_level: 'internal',
          retention_policy: 'operational',
          allowed_operations: ['read', 'write', 'execute'],
          escalation: GovernanceRules.stewardship.technical.escalation
        };

      case 'legal_data':
        return {
          id_format: 'legal',
          stewardship: 'legal',
          compliance_level: 'confidential',
          retention_policy: 'legal_hold',
          allowed_operations: ['read'],
          escalation: GovernanceRules.stewardship.legal.escalation,
          audit_required: true
        };

      case 'infrastructure':
        return {
          id_format: 'technical',
          stewardship: 'technical',
          compliance_level: 'internal',
          retention_policy: 'infrastructure',
          allowed_operations: ['read', 'write', 'execute', 'admin'],
          escalation: GovernanceRules.stewardship.technical.escalation
        };

      case 'version_control':
        return {
          id_format: 'technical',
          stewardship: 'technical',
          compliance_level: 'internal',
          retention_policy: 'development',
          allowed_operations: ['read', 'write'],
          escalation: GovernanceRules.stewardship.technical.escalation,
          backup_required: true
        };

      default:
        return {
          id_format: 'technical',
          stewardship: 'technical',
          compliance_level: 'internal',
          retention_policy: 'standard',
          allowed_operations: ['read'],
          escalation: GovernanceRules.stewardship.technical.escalation
        };
    }
  }

  /**
   * Validate operation against governance rules
   */
  async validateOperation(operation, rules, context) {
    const validations = [];

    // Check allowed operations
    if (rules.allowed_operations && !rules.allowed_operations.includes(operation.type)) {
      validations.push({
        rule: 'allowed_operations',
        valid: false,
        message: `Operation '${operation.type}' not allowed for this entity type`
      });
    } else {
      validations.push({
        rule: 'allowed_operations',
        valid: true,
        message: `Operation '${operation.type}' is permitted`
      });
    }

    // Check ID format requirements
    if (operation.id_generation && rules.id_format) {
      const formatValid = this.validateIdFormat(operation.id_generation, rules.id_format);
      validations.push({
        rule: 'id_format',
        valid: formatValid,
        message: formatValid
          ? `ID format '${rules.id_format}' requirements met`
          : `ID format must follow '${rules.id_format}' requirements`
      });
    }

    // Check compliance level
    if (operation.data_classification) {
      const complianceValid = this.validateComplianceLevel(operation.data_classification, rules.compliance_level);
      validations.push({
        rule: 'compliance_level',
        valid: complianceValid,
        message: complianceValid
          ? `Compliance level '${rules.compliance_level}' maintained`
          : `Operation violates compliance level '${rules.compliance_level}'`
      });
    }

    // Check audit requirements
    if (rules.audit_required && !context.audit_enabled) {
      validations.push({
        rule: 'audit_required',
        valid: false,
        message: 'Audit logging required for this operation'
      });
    }

    const allValid = validations.every(v => v.valid);

    return {
      valid: allValid,
      validations,
      summary: allValid ? 'All governance rules satisfied' : 'Governance violations detected'
    };
  }

  /**
   * Validate stewardship requirements
   */
  async validateStewardship(entity, operation, context) {
    const classification = await this.getAuthoritativeClassification(entity);
    const stewardshipKey = `stewardship:${entity.id || entity.path}`;
    const stewardshipData = await this.serviceRegistry.get(stewardshipKey);

    if (!stewardshipData) {
      // No stewardship assigned - assign based on classification
      const defaultSteward = await this.assignDefaultSteward(entity, classification);
      return {
        valid: true,
        steward: defaultSteward,
        assigned: 'auto',
        message: 'Default steward assigned based on classification'
      };
    }

    const stewardship = JSON.parse(stewardshipData);

    // Validate steward has authority for this operation
    const authorityValid = await this.validateStewardAuthority(stewardship, operation, context);

    return {
      valid: authorityValid,
      steward: stewardship,
      assigned: 'registry',
      message: authorityValid
        ? 'Steward authority validated'
        : 'Steward lacks authority for this operation'
    };
  }

  /**
   * Assign default steward based on entity classification
   */
  async assignDefaultSteward(entity, classification) {
    const stewardship = {
      entity_id: entity.id || entity.path,
      technical_steward: this.getDefaultTechnicalSteward(classification),
      legal_steward: this.getDefaultLegalSteward(classification),
      assigned_at: new Date().toISOString(),
      assigned_by: 'registry_governance',
      classification: classification.type
    };

    // Store in registry
    const stewardshipKey = `stewardship:${entity.id || entity.path}`;
    await this.serviceRegistry.put(stewardshipKey, JSON.stringify(stewardship));

    return stewardship;
  }

  /**
   * Get default technical steward based on classification
   */
  getDefaultTechnicalSteward(classification) {
    const stewardMap = {
      'services': 'platform-team',
      'infrastructure': 'devops-team',
      'version_control': 'development-team',
      'legal_data': 'legal-team',
      'unstructured_data': 'data-team'
    };

    return stewardMap[classification.type] || 'platform-team';
  }

  /**
   * Get default legal steward based on classification
   */
  getDefaultLegalSteward(classification) {
    const legalStewardMap = {
      'legal_data': 'legal-team',
      'services': 'compliance-team',
      'infrastructure': 'security-team'
    };

    return legalStewardMap[classification.type] || 'compliance-team';
  }

  /**
   * Validate steward authority for operation
   */
  async validateStewardAuthority(stewardship, operation, context) {
    // Check if operation requires technical or legal steward approval
    const requiresTechnical = ['read', 'write', 'execute', 'admin'].includes(operation.type);
    const requiresLegal = ['legal_review', 'compliance_check', 'audit'].includes(operation.type);

    if (requiresTechnical && !context.technical_steward_approved) {
      return false;
    }

    if (requiresLegal && !context.legal_steward_approved) {
      return false;
    }

    return true;
  }

  /**
   * Discover and register new entity in registry
   */
  async discoverAndRegisterEntity(entity) {
    // Apply ChittyOS ontology discovery algorithm
    const classification = await this.applyOntologyDiscovery(entity);

    // Register in service registry
    const classificationKey = `classification:${entity.id || entity.path}`;
    await this.serviceRegistry.put(classificationKey, JSON.stringify({
      ...classification,
      registered_at: new Date().toISOString(),
      registered_by: 'registry_governance',
      source: 'ontology_discovery'
    }));

    return classification;
  }

  /**
   * Apply ChittyOS ontology discovery algorithm
   */
  async applyOntologyDiscovery(entity) {
    const entityPath = entity.path || entity.identifier || '';

    // Step 1: Check if exists in registry (highest precedence)
    const registryKey = `entity:${entityPath}`;
    const registryEntity = await this.serviceRegistry.get(registryKey);

    if (registryEntity) {
      const entity = JSON.parse(registryEntity);
      return {
        type: entity.type,
        category: entity.category,
        source: 'registry',
        precedence: 1
      };
    }

    // Step 2: Check for legal patterns (arias*, legal*)
    if (this.matchesLegalPattern(entityPath)) {
      return {
        type: 'legal_data',
        category: 'compliance',
        source: 'pattern_detection',
        precedence: 2
      };
    }

    // Step 3: Check for version control (.git)
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
   * Check if entity path matches legal patterns
   */
  matchesLegalPattern(entityPath) {
    const legalPatterns = [
      /^arias/i,
      /legal/i,
      /compliance/i,
      /^.*\.legal\./i,
      /governance/i
    ];

    return legalPatterns.some(pattern => pattern.test(entityPath));
  }

  /**
   * Log governance decision for audit trail
   */
  async logGovernanceDecision(decision) {
    const logEntry = {
      id: `pending-id-${Date.now()}`,
      timestamp: decision.timestamp,
      entity: decision.entity,
      operation: decision.operation,
      classification: decision.classification,
      decision: decision.validation.valid && decision.stewardshipValidation.valid ? 'AUTHORIZED' : 'DENIED',
      validation_details: decision.validation,
      stewardship_details: decision.stewardshipValidation,
      context: decision.context,
      source: 'registry_governance'
    };

    // Store in audit log
    const logKey = `governance_log:${decision.timestamp}:${logEntry.id}`;
    await this.auditLog.put(logKey, JSON.stringify(logEntry));

    // Also store in platform KV for quick access
    await this.platformKV.put(`audit:governance:${logEntry.id}`, JSON.stringify(logEntry));
  }

  /**
   * Helper methods for validation
   */
  validateIdFormat(idGeneration, requiredFormat) {
    if (requiredFormat === 'technical') {
      return GovernanceRules.technical_id.format.test(idGeneration.technical_id || '');
    } else if (requiredFormat === 'legal') {
      return GovernanceRules.legal_id.format.test(idGeneration.legal_id || '');
    }
    return true;
  }

  validateComplianceLevel(dataClassification, requiredLevel) {
    const levelHierarchy = ['public', 'internal', 'confidential', 'restricted'];
    const dataLevel = levelHierarchy.indexOf(dataClassification);
    const requiredLevelIndex = levelHierarchy.indexOf(requiredLevel);

    return dataLevel >= requiredLevelIndex;
  }

  isClassificationStale(classification) {
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    const age = Date.now() - new Date(classification.registered_at).getTime();
    return age > maxAge;
  }

  async refreshEntityClassification(entity, oldClassification) {
    const newClassification = await this.applyOntologyDiscovery(entity);

    // Update in registry
    const classificationKey = `classification:${entity.id || entity.path}`;
    await this.serviceRegistry.put(classificationKey, JSON.stringify({
      ...newClassification,
      registered_at: new Date().toISOString(),
      updated_from: oldClassification,
      source: 'refresh'
    }));

    return newClassification;
  }

  mergeGovernanceRules(baseRules, customRules) {
    return {
      ...baseRules,
      ...customRules,
      merged: true,
      base_rules_version: '1.0',
      custom_rules_applied: true
    };
  }

  /**
   * Health check for governance system
   */
  async healthCheck() {
    try {
      // Test registry connectivity
      await this.serviceRegistry.get('health:governance');

      return {
        status: 'healthy',
        registry_connected: true,
        governance_active: true,
        source_of_truth: 'SERVICE_REGISTRY'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        governance_active: false
      };
    }
  }
}

/**
 * Cloudflare Worker export for governance system
 */
export default {
  async fetch(request, env, ctx) {
    const governance = new RegistryGovernance(env);
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
      if (url.pathname === '/enforce') {
        const { entity, operation, context } = await request.json();
        const result = await governance.enforceGovernancePolicy(entity, operation, context);

        return new Response(JSON.stringify(result), {
          status: result.authorized ? 200 : 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } else if (url.pathname === '/classify') {
        const entityId = url.searchParams.get('entity');
        const classification = await governance.getAuthoritativeClassification({ id: entityId });

        return new Response(JSON.stringify(classification), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } else if (url.pathname === '/stewardship') {
        const entityId = url.searchParams.get('entity');
        const stewardshipKey = `stewardship:${entityId}`;
        const stewardship = await governance.serviceRegistry.get(stewardshipKey);

        return new Response(JSON.stringify(stewardship ? JSON.parse(stewardship) : null), {
          status: stewardship ? 200 : 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } else if (url.pathname === '/health') {
        const health = await governance.healthCheck();

        return new Response(JSON.stringify(health), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response('Not Found', { status: 404, headers: corsHeaders });

    } catch (error) {
      console.error('Governance error:', error);

      return new Response(JSON.stringify({
        error: 'Internal server error',
        message: error.message,
        governance_status: 'error'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};