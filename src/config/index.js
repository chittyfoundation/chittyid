/**
 * ChittyID System Configuration
 * Central configuration for all services and APIs
 */

export const ChittyConfig = {
  // API Configuration
  api: {
    version: '2.0.0',
    name: 'ChittyID Mothership',
    description: 'Identity management system for ChittyIDs from id.chitty.cc service',
    baseUrl: 'https://id.chitty.cc',
    timeout: 30000, // 30 seconds
    rateLimit: {
      default: 100,
      authenticated: 1000,
      premium: 5000
    }
  },

  // Pipeline Configuration
  pipeline: {
    stages: ['router', 'intake', 'trust', 'authorization', 'generation'],
    timeout: 15000, // 15 seconds per stage
    retries: 3,
    parallelProcessing: false,
    caching: {
      enabled: true,
      ttl: 300 // 5 minutes
    }
  },

  // Session Sync Configuration
  sessionSync: {
    enabled: true,
    ttl: 3600, // 1 hour
    maxSessions: 1000,
    syncInterval: 5000, // 5 seconds
    replicationFactor: 3,
    consistencyModel: 'eventual',
    retryPolicy: {
      maxRetries: 5,
      backoffMultiplier: 2,
      maxBackoffMs: 30000
    }
  },

  // Notion Sync Configuration
  notionSync: {
    enabled: true,
    batchSize: 10,
    maxRetries: 5,
    retryDelay: 200, // ms between batches
    dlqThreshold: 100,
    fieldLimits: {
      factText: 2000,
      locationRef: 500,
      verificationMethod: 1000
    }
  },

  // ChittyID Format Configuration
  chittyId: {
    format: 'VV-G-LLL-SSSS-T-YM-C-X',
    currentVersion: '03',
    supportedVersions: ['01', '02', '03', '04', '05'],
    regions: {
      '1': 'North America',
      '2': 'South America',
      '3': 'Europe',
      '4': 'Asia',
      '5': 'Africa',
      '6': 'Oceania',
      '7': 'Antarctica',
      '8': 'International Waters',
      '9': 'Digital/Virtual'
    },
    // @canon: chittycanon://gov/governance#core-types
    entityTypes: {
      'P': 'Person',
      'L': 'Location',
      'T': 'Thing',
      'E': 'Event',
      'A': 'Authority'
    },
    trustLevels: {
      '0': 'L0 - Unverified',
      '1': 'L1 - Basic',
      '2': 'L2 - Standard',
      '3': 'L3 - Verified',
      '4': 'L4 - Premium',
      '5': 'L5 - Official'
    }
  },

  // Service Registry - Complete ChittyOS Ecosystem (51+ modules)
  services: {
    // Core Infrastructure
    chittycore: {
      name: 'ChittyCore Foundation Services',
      endpoint: 'core.chitty.cc',
      priority: 0,
      timeout: 5000,
      retries: 3,
      status: 'active'
    },
    chittystandard: {
      name: 'ChittyStandard Framework Installer',
      endpoint: 'standard.chitty.cc',
      priority: 0,
      timeout: 5000,
      retries: 2,
      status: 'active'
    },
    chittyops: {
      name: 'ChittyOps CI/CD Workflows',
      endpoint: 'ops.chitty.cc',
      priority: 1,
      timeout: 10000,
      retries: 3,
      status: 'active'
    },
    chittybeacon: {
      name: 'ChittyBeacon Service Discovery',
      endpoint: 'beacon.chitty.cc',
      priority: 0,
      timeout: 3000,
      retries: 5,
      status: 'active'
    },

    // Identity & Security
    chittyid: {
      name: 'ChittyID Identity Service',
      endpoint: 'id.chitty.cc',
      priority: 1,
      timeout: 10000,
      retries: 3,
      status: 'active'
    },
    chittyverify: {
      name: 'ChittyVerify Document Verification',
      endpoint: 'verify.chitty.cc',
      priority: 1,
      timeout: 15000,
      retries: 3,
      status: 'active'
    },
    chittytrust: {
      name: 'ChittyTrust 6D Trust Engine',
      endpoint: 'trust.chitty.cc',
      priority: 1,
      timeout: 8000,
      retries: 3,
      status: 'active'
    },
    chittychain: {
      name: 'ChittyChain Blockchain Service',
      endpoint: 'chain.chitty.cc',
      priority: 2,
      timeout: 20000,
      retries: 3,
      status: 'active'
    },
    chittyledger: {
      name: 'ChittyLedger Evidence Management',
      endpoint: 'ledger.chitty.cc',
      priority: 1,
      timeout: 12000,
      retries: 3,
      status: 'active'
    },
    chittycertify: {
      name: 'ChittyCertify Certification System',
      endpoint: 'certify.chitty.cc',
      priority: 2,
      timeout: 10000,
      retries: 2,
      status: 'active'
    },

    // Business Operations
    chittyforce: {
      name: 'ChittyForce AI Platform',
      endpoint: 'force.chitty.cc',
      priority: 2,
      timeout: 10000,
      retries: 2,
      status: 'active'
    },
    chittyentry: {
      name: 'ChittyEntry Access Control',
      endpoint: 'entry.chitty.cc',
      priority: 0,
      timeout: 5000,
      retries: 5,
      status: 'active'
    },
    chittycan: {
      name: 'ChittyCan Containerization',
      endpoint: 'can.chitty.cc',
      priority: 2,
      timeout: 15000,
      retries: 2,
      status: 'active'
    },
    chittychronicle: {
      name: 'ChittyChronicle Timeline Management',
      endpoint: 'chronicle.chitty.cc',
      priority: 1,
      timeout: 8000,
      retries: 3,
      status: 'active'
    },

    // Legal Technology
    chittytrace: {
      name: 'ChittyTrace Evidence Tracking',
      endpoint: 'trace.chitty.cc',
      priority: 1,
      timeout: 12000,
      retries: 3,
      status: 'active'
    },
    chittyintel: {
      name: 'ChittyIntel Legal Intelligence',
      endpoint: 'intel.chitty.cc',
      priority: 1,
      timeout: 15000,
      retries: 2,
      status: 'active'
    },
    chittyresolution: {
      name: 'ChittyResolution Dispute Management',
      endpoint: 'resolution.chitty.cc',
      priority: 1,
      timeout: 10000,
      retries: 3,
      status: 'active'
    },
    chittyevidence: {
      name: 'ChittyEvidence Management System',
      endpoint: 'evidence.chitty.cc',
      priority: 1,
      timeout: 12000,
      retries: 3,
      status: 'active'
    },
    chittyforge: {
      name: 'ChittyForge Development Tools',
      endpoint: 'forge.chitty.cc',
      priority: 2,
      timeout: 8000,
      retries: 2,
      status: 'active'
    },
    chittyflow: {
      name: 'ChittyFlow Workflow Automation',
      endpoint: 'flow.chitty.cc',
      priority: 1,
      timeout: 10000,
      retries: 3,
      status: 'active'
    },

    // AI & Router Services
    chittyrouter: {
      name: 'ChittyRouter AI Gateway',
      endpoint: 'router.chitty.cc',
      priority: 0,
      timeout: 30000,
      retries: 3,
      status: 'active'
    },

    // Support Systems
    chittyassets: {
      name: 'ChittyAssets Blockchain Asset Management',
      endpoint: 'assets.chitty.cc',
      priority: 1,
      timeout: 15000,
      retries: 3,
      status: 'active'
    },
    chittymonitor: {
      name: 'ChittyMonitor Performance Tracking',
      endpoint: 'monitor.chitty.cc',
      priority: 1,
      timeout: 5000,
      retries: 3,
      status: 'active'
    },
    chittyinsight: {
      name: 'ChittyInsight Analytics Platform',
      endpoint: 'insight.chitty.cc',
      priority: 2,
      timeout: 8000,
      retries: 2,
      status: 'active'
    },
    chittychat: {
      name: 'ChittyChat Communication Platform',
      endpoint: 'chat.chitty.cc',
      priority: 1,
      timeout: 5000,
      retries: 2,
      status: 'active'
    },
    chittycleaner: {
      name: 'ChittyCleaner Storage Management',
      endpoint: 'cleaner.chitty.cc',
      priority: 2,
      timeout: 10000,
      retries: 2,
      status: 'active'
    },
    chittyformfill: {
      name: 'ChittyFormFill PDF Engine',
      endpoint: 'formfill.chitty.cc',
      priority: 2,
      timeout: 15000,
      retries: 2,
      status: 'active'
    },
    chittyfinance: {
      name: 'ChittyFinance AI CFO Services',
      endpoint: 'finance.chitty.cc',
      priority: 1,
      timeout: 12000,
      retries: 3,
      status: 'active'
    },
    chittylanding: {
      name: 'ChittyLanding Page System',
      endpoint: 'landing.chitty.cc',
      priority: 2,
      timeout: 5000,
      retries: 2,
      status: 'active'
    },
    chittydashboard: {
      name: 'ChittyDashboard System',
      endpoint: 'dashboard.chitty.cc',
      priority: 2,
      timeout: 8000,
      retries: 2,
      status: 'active'
    },

    // Authentication & Auth Services
    chittyauth: {
      name: 'ChittyAuth Authentication Service',
      endpoint: 'auth.chitty.cc',
      priority: 0,
      timeout: 15000,
      retries: 5,
      status: 'active'
    },

    // Governance & Compliance
    chittygov: {
      name: 'ChittyGov Governance & Compliance',
      endpoint: 'gov.chitty.cc',
      priority: 1,
      timeout: 10000,
      retries: 3,
      status: 'active'
    },

    // Integration Services
    notionsync: {
      name: 'NotionSync AtomicFacts Bridge',
      endpoint: 'notion.chitty.cc',
      priority: 2,
      timeout: 10000,
      retries: 5,
      status: 'active'
    },
    sessionsync: {
      name: 'SessionSync Cross-Service State',
      endpoint: 'session.chitty.cc',
      priority: 1,
      timeout: 5000,
      retries: 3,
      status: 'active'
    },
    topicsync: {
      name: 'TopicSync Conversation Flow',
      endpoint: 'topic.chitty.cc',
      priority: 1,
      timeout: 8000,
      retries: 3,
      status: 'active'
    }
  },

  // Storage Configuration
  storage: {
    kv: {
      sessions: 'SESSIONS',
      authCache: 'AUTH_CACHE',
      chittyosCache: 'CHITTYOS_CACHE',
      chittyIds: 'CHITTY_IDS',
      chittySecrets: 'CHITTY_SECRETS'
    },
    d1: {
      auth: 'AUTH_DB'
    },
    vectorize: {
      routing: 'CHITTY_VECTORS'
    },
    analytics: 'CHITTY_ANALYTICS'
  },

  // AI Configuration
  ai: {
    models: {
      validation: '@cf/meta/llama-3.1-8b-instruct',
      embedding: '@cf/baai/bge-base-en-v1.5',
      routing: '@cf/meta/llama-3.1-8b-instruct'
    },
    gateway: {
      enabled: true,
      skipCache: false,
      cacheTtl: 3600
    },
    limits: {
      maxTokens: 4096,
      temperature: 0.1,
      topP: 0.9
    }
  },

  // Security Configuration
  security: {
    cors: {
      allowedOrigins: ['*'],
      allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-ID', 'X-ChittyOS-Service']
    },
    rateLimit: {
      windowMs: 60000, // 1 minute
      maxRequests: 100,
      trustProxy: true
    },
    authentication: {
      required: ['generation', 'secrets'],
      optional: ['validation', 'info', 'search']
    }
  },

  // Monitoring Configuration
  monitoring: {
    metrics: {
      enabled: true,
      retention: 604800, // 7 days
      aggregation: 'sum'
    },
    healthChecks: {
      interval: 30000, // 30 seconds
      timeout: 5000,
      retries: 3
    },
    alerts: {
      errorRate: 0.05, // 5%
      responseTime: 2000, // 2 seconds
      dlqThreshold: 100
    }
  },

  // Migration Configuration
  migration: {
    enabled: true,
    legacySupport: true,
    deprecationWarnings: true,
    migrationDeadline: '2025-12-31',
    legacyRoutes: ['/api/generate']
  },

  // Development Configuration
  development: {
    debug: false,
    verbose: false,
    mockServices: false,
    testMode: false
  }
};

/**
 * Get configuration value with environment override
 */
export function getConfig(path, env = {}) {
  const keys = path.split('.');
  let value = ChittyConfig;

  for (const key of keys) {
    value = value?.[key];
  }

  // Check for environment override
  const envKey = `CHITTY_${path.replace(/\./g, '_').toUpperCase()}`;
  if (env[envKey] !== undefined) {
    try {
      return JSON.parse(env[envKey]);
    } catch {
      return env[envKey];
    }
  }

  return value;
}

/**
 * Validate configuration
 */
export function validateConfig(env) {
  const required = [
    'AI',
    'SESSIONS',
    'AUTH_CACHE',
    'CHITTY_ANALYTICS'
  ];

  const missing = [];

  for (const key of required) {
    if (!env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return true;
}

/**
 * Get service endpoint
 */
export function getServiceEndpoint(serviceName, env) {
  const service = ChittyConfig.services[serviceName];
  if (!service) {
    throw new Error(`Unknown service: ${serviceName}`);
  }

  // Check for environment override
  const envKey = `CHITTY_${serviceName.toUpperCase()}_ENDPOINT`;
  return env[envKey] || `https://${service.endpoint}`;
}

export default ChittyConfig;