#!/usr/bin/env ts-node

/**
 * ChittyID CLI - TypeScript Production Implementation
 *
 * CRITICAL: Only mints IDs from canonical service (id.chitty.cc)
 * NO LOCAL GENERATION ALLOWED
 *
 * Usage (as Claude slash commands):
 *   /chitty gen person
 *   /chitty register person '{"name":"Kimber","email":"kimber@vanguardassociates.com"}'
 *   /chitty validate 01-1-ABC-1234-1-2025A-1-0
 *
 * Environment:
 *   CHITTY_BASE_URL - Canonical service URL (default: https://id.chitty.cc)
 *   CHITTY_API_KEY - Authentication key for API access
 *
 * Endpoints:
 *   POST /v1/identity/chitty-id - Generate new ChittyID
 *   POST /v1/evidence/items - Register evidence
 *   GET /v1/verify/status - Validate ChittyID
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

// Environment configuration
const BASE = process.env.CHITTY_BASE_URL || 'https://id.chitty.cc';
const KEY = process.env.CHITTY_API_KEY;
const STORAGE_DIR = process.env.CHITTY_STORAGE || path.join(process.env.HOME || '.', '.chitty');

if (!KEY) {
  console.error('ERROR: CHITTY_API_KEY environment variable is required');
  process.exit(1);
}

// Request headers with authentication
const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${KEY}`,
  'User-Agent': 'ChittyCLI/2.0.0-ts',
  'X-ChittyOS-CLI': 'true'
};

/**
 * ChittyID validation patterns
 */
const CHITTYID_PATTERNS = {
  // Canonical structured format: VV-G-LLL-SSSS-T-YM-C-X
  structured: /^[A-Z0-9]{2}-\d-[A-Z]{3}-\d{4}-[PLTE]-\d{2,4}-\d-\d{2}$/,

  // Legacy UUID format: chitty_<uuid>
  uuid: /^chitty_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,

  // Extended format for compatibility
  extended: /^[A-Z0-9]{2}-[A-Z0-9]-[A-Z0-9]{3}-[A-Z0-9]{4}-[A-Z0-9]-[A-Z0-9]{4}-[A-Z0-9]-[A-Z0-9]$/
};

/**
 * Validate ChittyID format
 */
function isChittyId(id: string): boolean {
  return Object.values(CHITTYID_PATTERNS).some(pattern => pattern.test(id));
}

/**
 * Detect ChittyID format type
 */
function detectFormat(id: string): 'structured' | 'uuid' | 'extended' | 'unknown' {
  if (CHITTYID_PATTERNS.structured.test(id)) return 'structured';
  if (CHITTYID_PATTERNS.uuid.test(id)) return 'uuid';
  if (CHITTYID_PATTERNS.extended.test(id)) return 'extended';
  return 'unknown';
}

/**
 * Calculate Mod-97 checksum for validation
 */
function calculateChecksum(payload: string): number {
  let sum = 0;
  for (const char of payload) {
    if (/\d/.test(char)) {
      sum += parseInt(char);
    } else if (/[A-Z]/.test(char)) {
      sum += char.charCodeAt(0) - 64; // A=1, B=2, etc.
    }
  }
  return 98 - (sum % 97);
}

/**
 * Generate new ChittyID from canonical service
 * ENFORCES: No local generation - only mint from id.chitty.cc
 */
async function gen(type: string = 'generic'): Promise<void> {
  try {
    console.log(`🔄 Requesting ChittyID generation for type: ${type}`);

    const res = await fetch(`${BASE}/v1/identity/chitty-id`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type,
        requestor: process.env.USER || 'cli-user',
        metadata: {
          cli_version: '2.0.0-ts',
          timestamp: new Date().toISOString(),
          platform: process.platform
        }
      })
    });

    const out = await res.json() as any;

    if (!res.ok) {
      throw new Error(`Service error: ${JSON.stringify(out)}`);
    }

    // Store in local registry
    await storeId(out.chittyId || out.id, {
      type,
      generated: new Date().toISOString(),
      source: 'canonical-service',
      response: out
    });

    console.log(JSON.stringify({
      success: true,
      chittyId: out.chittyId || out.id,
      type,
      format: detectFormat(out.chittyId || out.id),
      timestamp: new Date().toISOString(),
      ...out
    }, null, 2));

  } catch (error: any) {
    console.error(JSON.stringify({
      success: false,
      error: error.message,
      type,
      timestamp: new Date().toISOString()
    }, null, 2));
    process.exit(1);
  }
}

/**
 * Register evidence for ChittyID
 */
async function register(type: string = 'document', payloadJson: string = '{}'): Promise<void> {
  try {
    const payload = JSON.parse(payloadJson);

    console.log(`📝 Registering evidence for type: ${type}`);

    const res = await fetch(`${BASE}/v1/evidence/items`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...payload,
        documentType: type,
        timestamp: new Date().toISOString(),
        registrar: process.env.USER || 'cli-user'
      })
    });

    const out = await res.json() as any;

    if (!res.ok) {
      throw new Error(`Registration failed: ${JSON.stringify(out)}`);
    }

    // Store registration
    if (out.chittyId || out.id) {
      await storeId(out.chittyId || out.id, {
        type,
        registered: new Date().toISOString(),
        evidence: payload,
        registrationResponse: out
      });
    }

    console.log(JSON.stringify({
      success: true,
      type,
      timestamp: new Date().toISOString(),
      ...out
    }, null, 2));

  } catch (error: any) {
    console.error(JSON.stringify({
      success: false,
      error: error.message,
      type,
      timestamp: new Date().toISOString()
    }, null, 2));
    process.exit(1);
  }
}

/**
 * Validate ChittyID with canonical service
 */
async function validate(id: string): Promise<void> {
  try {
    // Local format validation first
    const format = detectFormat(id);
    if (format === 'unknown') {
      console.log(JSON.stringify({
        ok: false,
        error: 'invalid_format',
        id,
        format: 'unknown',
        timestamp: new Date().toISOString()
      }, null, 2));
      process.exit(2);
    }

    console.log(`🔍 Validating ChittyID: ${id} (format: ${format})`);

    // Canonical verification
    const res = await fetch(`${BASE}/v1/verify/status?chitty_id=${encodeURIComponent(id)}`, {
      method: 'GET',
      headers
    });

    const out = await res.json() as any;

    if (!res.ok) {
      // Fallback to worker validation
      const workerRes = await fetch(`https://chittyid-mothership.chitty.workers.dev/api/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id })
      });

      if (workerRes.ok) {
        const workerOut = await workerRes.json() as any;
        console.log(JSON.stringify({
          ok: workerOut.valid || workerOut.success,
          id,
          format,
          source: 'worker-fallback',
          status: workerOut,
          timestamp: new Date().toISOString()
        }, null, 2));
        return;
      }

      throw new Error(`Validation failed: ${JSON.stringify(out)}`);
    }

    console.log(JSON.stringify({
      ok: true,
      id,
      format,
      source: 'canonical',
      status: out,
      timestamp: new Date().toISOString()
    }, null, 2));

  } catch (error: any) {
    console.error(JSON.stringify({
      ok: false,
      error: error.message,
      id,
      timestamp: new Date().toISOString()
    }, null, 2));
    process.exit(1);
  }
}

/**
 * Soft mint - off-chain attestation
 */
async function softMint(id: string): Promise<void> {
  try {
    console.log(`🔶 Soft minting ChittyID: ${id}`);

    const res = await fetch(`${BASE}/mint/soft?id=${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers
    });

    const out = await res.json() as any;

    if (!res.ok) {
      throw new Error(`Soft mint failed: ${JSON.stringify(out)}`);
    }

    console.log(JSON.stringify({
      success: true,
      operation: 'soft_mint',
      chittyId: id,
      status: 'SOFT_MINTED',
      ...out
    }, null, 2));

  } catch (error: any) {
    console.error(JSON.stringify({
      success: false,
      operation: 'soft_mint',
      error: error.message,
      chittyId: id
    }, null, 2));
    process.exit(1);
  }
}

/**
 * Hard mint - on-chain anchoring
 */
async function hardMint(id: string, maxGasWei?: string): Promise<void> {
  try {
    console.log(`🔷 Hard minting ChittyID: ${id}`);
    console.log('⚠️  WARNING: This operation is IRREVERSIBLE and will consume gas');

    const res = await fetch(`${BASE}/mint/hard`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id,
        confirmIrreversible: true,
        maxGasWei: maxGasWei ? BigInt(maxGasWei).toString() : undefined
      })
    });

    const out = await res.json() as any;

    if (!res.ok) {
      throw new Error(`Hard mint failed: ${JSON.stringify(out)}`);
    }

    console.log(JSON.stringify({
      success: true,
      operation: 'hard_mint',
      chittyId: id,
      status: 'HARD_MINTED',
      txHash: out.txHash,
      gas: out.gas,
      ...out
    }, null, 2));

  } catch (error: any) {
    console.error(JSON.stringify({
      success: false,
      operation: 'hard_mint',
      error: error.message,
      chittyId: id
    }, null, 2));
    process.exit(1);
  }
}

/**
 * Store ChittyID in local registry
 */
async function storeId(id: string, data: any): Promise<void> {
  try {
    await fs.mkdir(STORAGE_DIR, { recursive: true });

    const registryPath = path.join(STORAGE_DIR, 'registry.json');
    let registry: any = {};

    try {
      const existing = await fs.readFile(registryPath, 'utf8');
      registry = JSON.parse(existing);
    } catch {
      registry = { ids: {}, metadata: { created: new Date().toISOString() } };
    }

    registry.ids[id] = {
      ...registry.ids[id],
      ...data,
      lastUpdated: new Date().toISOString()
    };

    await fs.writeFile(registryPath, JSON.stringify(registry, null, 2));
  } catch (error) {
    console.error(`Warning: Failed to store locally: ${error}`);
  }
}

/**
 * Main CLI execution
 */
(async () => {
  const [cmd, arg1, arg2] = process.argv.slice(2);

  try {
    switch (cmd) {
      case 'gen':
      case 'generate':
        await gen(arg1 || 'generic');
        break;

      case 'register':
        await register(arg1 || 'document', arg2 || '{}');
        break;

      case 'validate':
        if (!arg1) throw new Error('ChittyID required for validation');
        await validate(arg1);
        break;

      case 'soft-mint':
        if (!arg1) throw new Error('ChittyID required for soft mint');
        await softMint(arg1);
        break;

      case 'hard-mint':
        if (!arg1) throw new Error('ChittyID required for hard mint');
        await hardMint(arg1, arg2);
        break;

      default:
        console.log(`
ChittyID CLI v2.0.0-ts
====================

Commands:
  gen <type>                  Generate new ChittyID (canonical service only)
  register <type> <json>      Register evidence for ChittyID
  validate <id>               Validate ChittyID format and existence
  soft-mint <id>              Soft mint (off-chain attestation)
  hard-mint <id> [maxGas]     Hard mint (on-chain anchoring)

Environment:
  CHITTY_BASE_URL            Service URL (default: https://id.chitty.cc)
  CHITTY_API_KEY             API authentication key (required)
  CHITTY_STORAGE             Local storage directory

Examples:
  chitty-cli.ts gen person
  chitty-cli.ts register person '{"name":"Kimber"}'
  chitty-cli.ts validate 01-1-ABC-1234-P-25-1-82
  chitty-cli.ts soft-mint 01-1-ABC-1234-P-25-1-82
  chitty-cli.ts hard-mint 01-1-ABC-1234-P-25-1-82 1000000000000000

CRITICAL: This CLI enforces central service minting only.
No local ChittyID generation is permitted.
        `);
        break;
    }
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
})();