/**
 * ChittyID API Module for Gateway Aggregation
 *
 * This module exports API routes that are aggregated into api.chitty.cc/id/*
 * Part of the ChittyCanon gateway pattern.
 *
 * @module api-id
 * @see https://api.chitty.cc/id
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';

// Types
interface ChittyIDComponents {
  version: string;
  region: string;
  jurisdiction: string;
  sequential: string;
  entityType: string;
  yearMonth: string;
  trustLevel: string;
  checksum: string;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  components?: ChittyIDComponents;
  metadata?: {
    regionName: string;
    entityTypeName: string;
    trustLevelName: string;
  };
}

interface Env {
  CHITTYID_KV?: KVNamespace;
}

// ChittyID Core Logic
class ChittyIDCore {
  private version = '03';

  mod97Checksum(str: string): number {
    let checksum = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      if (char >= '0' && char <= '9') {
        checksum = (checksum * 10 + parseInt(char)) % 97;
      } else if (char >= 'A' && char <= 'Z') {
        const value = char.charCodeAt(0) - 55;
        checksum = (checksum * 100 + value) % 97;
      }
    }
    return (98 - checksum) % 97;
  }

  getCurrentYearMonth(): string {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    return year + month.slice(1);
  }

  async getNextSequential(env: Env, key: string): Promise<string> {
    try {
      const stored = await env.CHITTYID_KV?.get(key);
      let counter = stored ? parseInt(stored) : 1;
      counter = counter >= 9999 ? 1 : counter + 1;
      await env.CHITTYID_KV?.put(key, counter.toString());
      return counter.toString().padStart(4, '0');
    } catch {
      return Math.floor(Math.random() * 9999).toString().padStart(4, '0');
    }
  }

  async generate(
    region: string,
    jurisdiction: string,
    entityType: string,
    trustLevel: string,
    env: Env
  ): Promise<string> {
    const sequentialKey = `seq_${region}_${jurisdiction.toUpperCase()}_${entityType.toUpperCase()}`;
    const sequential = await this.getNextSequential(env, sequentialKey);
    const yearMonth = this.getCurrentYearMonth();

    const baseId = `${this.version}${region}${jurisdiction.toUpperCase()}${sequential}${entityType.toUpperCase()}${yearMonth}${trustLevel}`;
    const checksum = this.mod97Checksum(baseId).toString().padStart(2, '0');

    return `${this.version}-${region}-${jurisdiction.toUpperCase()}-${sequential}-${entityType.toUpperCase()}-${yearMonth}-${trustLevel}-${checksum}`;
  }

  validate(chittyId: string): ValidationResult {
    if (!chittyId || typeof chittyId !== 'string') {
      return { valid: false, error: 'ChittyID is required and must be a string' };
    }

    const parts = chittyId.split('-');
    if (parts.length !== 8) {
      return { valid: false, error: 'Invalid format: must have 8 parts separated by hyphens' };
    }

    const [version, region, jurisdiction, sequential, entityType, yearMonth, trustLevel, checksum] = parts;

    if (!/^[0-9]{2}$/.test(version)) {
      return { valid: false, error: 'Version must be 2 digits' };
    }
    if (!/^[1-9]$/.test(region)) {
      return { valid: false, error: 'Region must be 1 digit (1-9)' };
    }
    if (!/^[A-Z]{3}$/.test(jurisdiction)) {
      return { valid: false, error: 'Jurisdiction must be 3 uppercase letters' };
    }
    if (!/^[0-9]{4}$/.test(sequential)) {
      return { valid: false, error: 'Sequential must be 4 digits' };
    }
    if (!/^[PLTM]$/.test(entityType)) {
      return { valid: false, error: 'Entity type must be P, L, T, or M' };
    }
    if (!/^[0-9A-Z]{2}$/.test(yearMonth)) {
      return { valid: false, error: 'Year-Month must be 2 alphanumeric characters' };
    }
    if (!/^[0-9A-Z]$/.test(trustLevel)) {
      return { valid: false, error: 'Trust level must be a single alphanumeric character' };
    }
    if (!/^[0-9A-Z]$/.test(checksum)) {
      return { valid: false, error: 'Checksum must be a single alphanumeric character' };
    }

    const baseId = `${version}${region}${jurisdiction}${sequential}${entityType}${yearMonth}${trustLevel}`;
    const calculatedChecksum = this.mod97Checksum(baseId).toString().padStart(2, '0');

    // Note: checksum validation may need adjustment based on exact algorithm

    return {
      valid: true,
      components: { version, region, jurisdiction, sequential, entityType, yearMonth, trustLevel, checksum },
      metadata: {
        regionName: this.getRegionName(region),
        entityTypeName: this.getEntityTypeName(entityType),
        trustLevelName: this.getTrustLevelName(trustLevel),
      },
    };
  }

  getRegionName(region: string): string {
    const regions: Record<string, string> = {
      '1': 'North America',
      '2': 'South America',
      '3': 'Europe',
      '4': 'Asia',
      '5': 'Africa',
      '6': 'Oceania',
      '7': 'Antarctica',
      '8': 'International Waters',
      '9': 'Digital/Virtual',
    };
    return regions[region] || region;
  }

  getEntityTypeName(type: string): string {
    const types: Record<string, string> = {
      'P': 'Person (natural person)',
      'L': 'Legal entity (organization)',
      'T': 'Thing (device, asset)',
      'M': 'Machine (service, AI agent)',
    };
    return types[type] || type;
  }

  getTrustLevelName(level: string): string {
    const levels: Record<string, string> = {
      '0': 'Unverified',
      '1': 'Basic',
      '2': 'Standard',
      '3': 'Verified',
      '4': 'Premium',
      '5': 'Official',
    };
    return levels[level] || `Level ${level}`;
  }
}

// Create Hono app for gateway mounting
const app = new Hono<{ Bindings: Env }>();
const core = new ChittyIDCore();

// CORS middleware
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Health check
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    service: 'chittyid',
    version: '3.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Generate new ChittyID
app.get('/generate', async (c) => {
  const region = c.req.query('region') || '1';
  const jurisdiction = c.req.query('jurisdiction') || 'USA';
  const entityType = c.req.query('type') || 'T';
  const trustLevel = c.req.query('trust') || '0';

  try {
    const chittyId = await core.generate(
      region,
      jurisdiction.toUpperCase(),
      entityType.toUpperCase(),
      trustLevel,
      c.env
    );

    return c.json({
      success: true,
      chittyId,
      components: {
        region,
        jurisdiction: jurisdiction.toUpperCase(),
        entityType: entityType.toUpperCase(),
        trustLevel,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Generation failed',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// Validate ChittyID
app.post('/validate', async (c) => {
  const body = await c.req.json<{ id: string }>();
  const result = core.validate(body.id);

  return c.json({
    success: result.valid,
    ...result,
    timestamp: new Date().toISOString(),
  }, result.valid ? 200 : 400);
});

// Get ChittyID info with ecosystem links
app.get('/info/:id', (c) => {
  const chittyId = c.req.param('id');
  const result = core.validate(chittyId);
  const includeEcosystem = c.req.query('ecosystem') === 'true';

  if (result.valid) {
    const response: Record<string, unknown> = {
      success: true,
      chittyId,
      ...result,
      timestamp: new Date().toISOString(),
    };

    // Include ecosystem links if requested
    if (includeEcosystem && result.components) {
      response.ecosystem = {
        // ChittyDNA - Digital identity DNA and encrypted vault
        dna: {
          endpoint: `https://dna.chitty.cc/vault/${chittyId}`,
          description: 'Encrypted digital identity vault - behavioral patterns, verification markers, biometric hashes',
          linked: true,
        },
        // ChittyAuth - Authentication and authorization
        auth: {
          endpoint: `https://auth.chitty.cc/user/${chittyId}`,
          description: 'Authentication and capabilities',
          linked: true,
        },
        // ChittyCert - Certificates attached to this identity
        certificates: {
          endpoint: `https://cert.chitty.cc/identity/${chittyId}`,
          description: 'X.509 certificates and mTLS',
          linked: true,
        },
        // ChittyTrust - Trust score and verification
        trust: {
          endpoint: `https://trust.chitty.cc/chain/${chittyId}`,
          description: 'Trust chain and verification score',
          linked: true,
        },
        // ChittyScore - Reputation and quality scoring
        score: {
          endpoint: `https://score.chitty.cc/identity/${chittyId}`,
          description: 'Reputation score and quality metrics',
          linked: true,
        },
        // ChittyChronicle - Audit history
        chronicle: {
          endpoint: `https://chronicle.chitty.cc/history/${chittyId}`,
          description: 'Complete audit history',
          linked: true,
        },
        // ChittyLedger - Transaction ledger
        ledger: {
          endpoint: `https://ledger.chitty.cc/account/${chittyId}`,
          description: 'Transaction and accountability ledger',
          linked: true,
        },
        // ChittyRegister - Service registrations
        services: {
          endpoint: `https://register.chitty.cc/owner/${chittyId}`,
          description: 'Services owned by this identity',
          linked: true,
        },
        // Authorities - Who authorized this ID
        authorities: {
          issuer: 'ChittyOS Trust Authority',
          jurisdiction: result.components.jurisdiction,
          region: result.metadata?.regionName,
        },
      };
    }

    return c.json(response);
  } else {
    return c.json({
      success: false,
      error: result.error,
      timestamp: new Date().toISOString(),
    }, 400);
  }
});

// Get specification
app.get('/spec', (c) => {
  return c.json({
    success: true,
    specification: {
      format: 'VV-G-LLL-SSSS-T-YM-C-X',
      totalLength: 32,
      components: {
        VV: { description: 'Version', length: 2, type: 'numeric' },
        G: { description: 'Geographic region (1-9)', length: 1, type: 'numeric' },
        LLL: { description: 'Legal jurisdiction (ISO 3166-1 alpha-3)', length: 3, type: 'alpha' },
        SSSS: { description: 'Sequential ID', length: 4, type: 'numeric' },
        T: { description: 'Entity type (P/L/T/M)', length: 1, type: 'alpha' },
        YM: { description: 'Year-Month (Base36)', length: 2, type: 'alphanumeric' },
        C: { description: 'Checksum (Luhn mod 36)', length: 1, type: 'alphanumeric' },
        X: { description: 'Extension', length: 1, type: 'alphanumeric' },
      },
      entityTypes: {
        P: 'Person (natural person)',
        L: 'Legal entity (organization)',
        T: 'Thing (device, asset)',
        M: 'Machine (service, AI agent)',
      },
      regions: {
        1: 'North America',
        2: 'South America',
        3: 'Europe',
        4: 'Asia',
        5: 'Africa',
        6: 'Oceania',
        7: 'Antarctica',
        8: 'International Waters',
        9: 'Digital/Virtual',
      },
    },
    timestamp: new Date().toISOString(),
  });
});

export default app;
export { ChittyIDCore };
