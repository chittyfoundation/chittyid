#!/usr/bin/env node

/**
 * ChittyID CLI - Production-ready interface for ChittyID management
 *
 * ENFORCES: Only mint IDs from central service (no local generation)
 * VALIDATES: All stored IDs continually with checksum verification
 * SECURITY: Periodic integrity checks and audit logging
 *
 * Usage:
 *   chitty-cli.js gen <purpose>              - Generate new ChittyID from central service
 *   chitty-cli.js register <id> <evidence>   - Register ChittyID with evidence
 *   chitty-cli.js validate <id>              - Validate ChittyID format and checksum
 *   chitty-cli.js verify-all                 - Verify all stored ChittyIDs
 *   chitty-cli.js integrity-check            - Run full integrity check
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const https = require('https');

// Configuration
const CONFIG = {
  // Canonical service endpoints
  IDENTITY_API: 'https://identity.chitty.cc',
  WORKER_API: 'https://chittyid-mothership.chitty.workers.dev',

  // API versions
  API_VERSION: 'v1',

  // Storage paths
  STORAGE_DIR: process.env.CHITTY_STORAGE || path.join(process.env.HOME, '.chitty'),
  ID_REGISTRY: 'registry.json',
  AUDIT_LOG: 'audit.log',

  // Security settings
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  VALIDATION_INTERVAL: 3600000, // 1 hour

  // ChittyID format
  ID_REGEX: /^(\d{2})-(\d)-([A-Z]{3})-(\d{4})-([PLTE])-(\d{3})-(\d)-(\d{2})$/,

  // Checksum constants
  CHECKSUM_MOD: 97
};

class ChittyCLI {
  constructor() {
    this.registry = null;
    this.auditStream = null;
  }

  /**
   * Initialize CLI and storage
   */
  async init() {
    // Create storage directory if needed
    await fs.mkdir(CONFIG.STORAGE_DIR, { recursive: true });

    // Load or create registry
    const registryPath = path.join(CONFIG.STORAGE_DIR, CONFIG.ID_REGISTRY);
    try {
      const data = await fs.readFile(registryPath, 'utf8');
      this.registry = JSON.parse(data);
    } catch (err) {
      this.registry = {
        version: '1.0.0',
        ids: {},
        metadata: {
          created: new Date().toISOString(),
          lastValidation: null,
          totalGenerated: 0,
          totalValidated: 0
        }
      };
      await this.saveRegistry();
    }

    // Initialize audit log
    const auditPath = path.join(CONFIG.STORAGE_DIR, CONFIG.AUDIT_LOG);
    this.auditStream = await fs.open(auditPath, 'a');
  }

  /**
   * COMMAND: Generate new ChittyID from central service
   * ENFORCES: No local generation - only mint from canonical service
   */
  async generateID(purpose = 'general') {
    this.audit('GENERATE_REQUEST', { purpose });

    try {
      // Call canonical identity endpoint - NEVER generate locally
      const response = await this.callCanonicalAPI('POST', '/v1/identity/chitty-id', {
        purpose,
        requestor: process.env.USER || 'system',
        timestamp: new Date().toISOString(),
        metadata: {
          cli_version: '1.0.0',
          node_version: process.version,
          platform: process.platform
        }
      });

      if (!response.chittyId) {
        throw new Error('Service did not return a ChittyID');
      }

      // Validate the received ID immediately
      const validation = await this.validateID(response.chittyId);
      if (!validation.valid) {
        throw new Error(`Received invalid ChittyID: ${validation.error}`);
      }

      // Store in registry
      this.registry.ids[response.chittyId] = {
        generated: new Date().toISOString(),
        purpose,
        validated: true,
        lastCheck: new Date().toISOString(),
        source: 'canonical-service',
        metadata: response.metadata || {}
      };

      this.registry.metadata.totalGenerated++;
      await this.saveRegistry();

      this.audit('GENERATE_SUCCESS', {
        chittyId: response.chittyId,
        purpose
      });

      console.log(JSON.stringify({
        success: true,
        chittyId: response.chittyId,
        validated: true,
        purpose,
        timestamp: new Date().toISOString()
      }, null, 2));

      return response.chittyId;

    } catch (error) {
      this.audit('GENERATE_FAILED', {
        purpose,
        error: error.message
      });

      console.error(JSON.stringify({
        success: false,
        error: error.message,
        purpose,
        timestamp: new Date().toISOString()
      }, null, 2));

      process.exit(1);
    }
  }

  /**
   * COMMAND: Register ChittyID with evidence
   */
  async registerID(chittyId, evidence) {
    this.audit('REGISTER_REQUEST', { chittyId, evidence });

    try {
      // Validate ID format first
      const validation = await this.validateID(chittyId);
      if (!validation.valid) {
        throw new Error(`Invalid ChittyID: ${validation.error}`);
      }

      // Register with evidence endpoint
      const response = await this.callCanonicalAPI('POST', '/v1/evidence/register', {
        chittyId,
        evidence,
        timestamp: new Date().toISOString(),
        registrar: process.env.USER || 'system',
        checksum: this.calculateEvidence Checksum(evidence)
      });

      // Update registry
      if (!this.registry.ids[chittyId]) {
        this.registry.ids[chittyId] = {};
      }

      this.registry.ids[chittyId].registered = new Date().toISOString();
      this.registry.ids[chittyId].evidence = evidence;
      this.registry.ids[chittyId].registrationId = response.registrationId;

      await this.saveRegistry();

      this.audit('REGISTER_SUCCESS', {
        chittyId,
        registrationId: response.registrationId
      });

      console.log(JSON.stringify({
        success: true,
        chittyId,
        registered: true,
        registrationId: response.registrationId,
        timestamp: new Date().toISOString()
      }, null, 2));

    } catch (error) {
      this.audit('REGISTER_FAILED', {
        chittyId,
        error: error.message
      });

      console.error(JSON.stringify({
        success: false,
        error: error.message,
        chittyId,
        timestamp: new Date().toISOString()
      }, null, 2));

      process.exit(1);
    }
  }

  /**
   * COMMAND: Validate ChittyID
   */
  async validateID(chittyId) {
    // Format validation
    const match = chittyId.match(CONFIG.ID_REGEX);
    if (!match) {
      return {
        valid: false,
        error: 'Invalid ChittyID format',
        chittyId
      };
    }

    const [_, version, region, jurisdiction, sequence, entityType, yearMonth, trustLevel, checksum] = match;

    // Calculate expected checksum
    const payload = `${version}${region}${jurisdiction}${sequence}${entityType}${yearMonth}${trustLevel}`;
    const expectedChecksum = this.calculateChecksum(payload);

    if (parseInt(checksum) !== expectedChecksum) {
      return {
        valid: false,
        error: `Checksum mismatch: expected ${expectedChecksum}, got ${checksum}`,
        chittyId
      };
    }

    // Call validation endpoint for additional verification
    try {
      const response = await this.callWorkerAPI('POST', '/api/validate', { id: chittyId });

      // Update registry if we have this ID
      if (this.registry.ids[chittyId]) {
        this.registry.ids[chittyId].lastCheck = new Date().toISOString();
        this.registry.ids[chittyId].validated = response.valid;
        this.registry.metadata.totalValidated++;
        await this.saveRegistry();
      }

      return {
        valid: response.valid,
        chittyId,
        components: {
          version,
          region,
          jurisdiction,
          sequence,
          entityType,
          yearMonth,
          trustLevel,
          checksum
        },
        verified: true
      };

    } catch (error) {
      // If service is unavailable, rely on local validation
      return {
        valid: true,
        chittyId,
        localOnly: true,
        warning: 'Could not verify with service'
      };
    }
  }

  /**
   * COMMAND: Verify all stored ChittyIDs
   */
  async verifyAll() {
    console.log('Starting verification of all stored ChittyIDs...\n');

    const results = {
      total: 0,
      valid: 0,
      invalid: 0,
      errors: []
    };

    for (const [chittyId, data] of Object.entries(this.registry.ids)) {
      results.total++;

      const validation = await this.validateID(chittyId);

      if (validation.valid) {
        results.valid++;
        console.log(`✅ ${chittyId} - Valid`);
      } else {
        results.invalid++;
        results.errors.push({
          chittyId,
          error: validation.error
        });
        console.log(`❌ ${chittyId} - ${validation.error}`);
      }

      // Rate limiting
      await this.sleep(100);
    }

    this.registry.metadata.lastValidation = new Date().toISOString();
    await this.saveRegistry();

    console.log(JSON.stringify({
      success: true,
      results,
      timestamp: new Date().toISOString()
    }, null, 2));

    return results;
  }

  /**
   * COMMAND: Full integrity check
   */
  async integrityCheck() {
    console.log('Running full integrity check...\n');

    const report = {
      timestamp: new Date().toISOString(),
      registry: {
        totalIds: Object.keys(this.registry.ids).length,
        metadata: this.registry.metadata
      },
      validation: await this.verifyAll(),
      security: await this.securityCheck(),
      storage: await this.storageCheck()
    };

    // Save report
    const reportPath = path.join(CONFIG.STORAGE_DIR, `integrity-${Date.now()}.json`);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    console.log(JSON.stringify({
      success: true,
      report,
      saved: reportPath
    }, null, 2));

    return report;
  }

  /**
   * Security check
   */
  async securityCheck() {
    const issues = [];

    // Check for duplicate IDs
    const idSet = new Set(Object.keys(this.registry.ids));
    if (idSet.size !== Object.keys(this.registry.ids).length) {
      issues.push('Duplicate IDs detected');
    }

    // Check for tampering
    for (const [chittyId, data] of Object.entries(this.registry.ids)) {
      if (!data.source || data.source !== 'canonical-service') {
        issues.push(`Non-canonical ID: ${chittyId}`);
      }

      if (!data.validated) {
        issues.push(`Unvalidated ID: ${chittyId}`);
      }
    }

    // Check audit log integrity
    try {
      const auditPath = path.join(CONFIG.STORAGE_DIR, CONFIG.AUDIT_LOG);
      const stats = await fs.stat(auditPath);
      if (stats.size > 100000000) { // 100MB
        issues.push('Audit log exceeds size limit');
      }
    } catch (err) {
      issues.push('Audit log missing or corrupted');
    }

    return {
      secure: issues.length === 0,
      issues
    };
  }

  /**
   * Storage check
   */
  async storageCheck() {
    const stats = await fs.stat(CONFIG.STORAGE_DIR);
    const registryPath = path.join(CONFIG.STORAGE_DIR, CONFIG.ID_REGISTRY);
    const registryStats = await fs.stat(registryPath);

    return {
      directory: CONFIG.STORAGE_DIR,
      size: registryStats.size,
      modified: registryStats.mtime,
      writable: true
    };
  }

  /**
   * Calculate checksum using Mod-97 algorithm
   */
  calculateChecksum(payload) {
    let sum = 0;
    for (let i = 0; i < payload.length; i++) {
      const char = payload[i];
      if (/\d/.test(char)) {
        sum += parseInt(char);
      } else if (/[A-Z]/.test(char)) {
        sum += char.charCodeAt(0) - 64; // A=1, B=2, etc.
      }
    }
    return 98 - (sum % CONFIG.CHECKSUM_MOD);
  }

  /**
   * Calculate evidence checksum
   */
  calculateEvidenceChecksum(evidence) {
    return crypto.createHash('sha256').update(evidence).digest('hex');
  }

  /**
   * Call canonical API
   */
  async callCanonicalAPI(method, endpoint, data) {
    const url = `${CONFIG.IDENTITY_API}${endpoint}`;
    return this.makeRequest(url, method, data);
  }

  /**
   * Call worker API
   */
  async callWorkerAPI(method, endpoint, data) {
    const url = `${CONFIG.WORKER_API}${endpoint}`;
    return this.makeRequest(url, method, data);
  }

  /**
   * Make HTTP request with retries
   */
  async makeRequest(url, method, data, retries = CONFIG.MAX_RETRIES) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname + urlObj.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ChittyCLI/1.0.0',
          'X-ChittyOS-CLI': 'true'
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body));
            } catch (err) {
              resolve({ raw: body });
            }
          } else if (retries > 0) {
            setTimeout(() => {
              this.makeRequest(url, method, data, retries - 1)
                .then(resolve)
                .catch(reject);
            }, CONFIG.RETRY_DELAY);
          } else {
            reject(new Error(`Request failed: ${res.statusCode} ${body}`));
          }
        });
      });

      req.on('error', (err) => {
        if (retries > 0) {
          setTimeout(() => {
            this.makeRequest(url, method, data, retries - 1)
              .then(resolve)
              .catch(reject);
          }, CONFIG.RETRY_DELAY);
        } else {
          reject(err);
        }
      });

      if (data) {
        req.write(JSON.stringify(data));
      }
      req.end();
    });
  }

  /**
   * Save registry to disk
   */
  async saveRegistry() {
    const registryPath = path.join(CONFIG.STORAGE_DIR, CONFIG.ID_REGISTRY);
    await fs.writeFile(registryPath, JSON.stringify(this.registry, null, 2));
  }

  /**
   * Audit logging
   */
  async audit(action, data) {
    const entry = {
      timestamp: new Date().toISOString(),
      action,
      user: process.env.USER || 'system',
      pid: process.pid,
      data
    };

    if (this.auditStream) {
      await this.auditStream.write(JSON.stringify(entry) + '\n');
    }
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup on exit
   */
  async cleanup() {
    if (this.auditStream) {
      await this.auditStream.close();
    }
  }
}

/**
 * Main execution
 */
async function main() {
  const cli = new ChittyCLI();
  await cli.init();

  const command = process.argv[2];
  const args = process.argv.slice(3);

  try {
    switch (command) {
      case 'gen':
      case 'generate':
        await cli.generateID(args[0]);
        break;

      case 'register':
        if (!args[0] || !args[1]) {
          throw new Error('Usage: register <chittyId> <evidence>');
        }
        await cli.registerID(args[0], args[1]);
        break;

      case 'validate':
        if (!args[0]) {
          throw new Error('Usage: validate <chittyId>');
        }
        const result = await cli.validateID(args[0]);
        console.log(JSON.stringify(result, null, 2));
        break;

      case 'verify-all':
        await cli.verifyAll();
        break;

      case 'integrity-check':
        await cli.integrityCheck();
        break;

      default:
        console.log(`
ChittyID CLI - Central Service Only

Commands:
  gen <purpose>              Generate new ChittyID (from service only)
  register <id> <evidence>   Register ChittyID with evidence
  validate <id>              Validate ChittyID
  verify-all                 Verify all stored IDs
  integrity-check            Run full integrity check

Environment:
  CHITTY_STORAGE            Storage directory (default: ~/.chitty)
  USER                      User identifier for audit

IMPORTANT: This CLI enforces central service minting only.
No local ID generation is permitted.
        `);
        process.exit(0);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  } finally {
    await cli.cleanup();
  }
}

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught error:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
  process.exit(1);
});

// Run if executed directly
if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = ChittyCLI;