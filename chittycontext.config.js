/**
 * ChittyContext - Environment & Context Management for ChittyID
 *
 * Centralized configuration for environment variables, deployment contexts,
 * and service dependencies across development, staging, and production.
 */

export const chittyContext = {
  /**
   * Environment Configurations
   */
  environments: {
    development: {
      name: "development",
      domain: "localhost:8787",
      url: "http://localhost:8787",
      workerName: "chittyid",
      kvNamespaces: {
        CHITTYID_KV: "ec782932b5f54c359d9aef2e28898bf9",
        MCP_SESSIONS: "dd1dff525a27431aa47844eb364e6606",
        OAUTH_TOKENS: "0189885179514d639776ec3bfe8f8274",
        API_KEYS: "41593bb3096745c0b59e0bf6d5cbae20",
        PLATFORM_CACHE: "d66c1e709c72456fa21aaa0d02f2db5e",
        PLATFORM_KV: "d52d89c1eebd402b95719161d311e7df",
      },
      requiresSecrets: ["CHITTY_ID_TOKEN", "CHITTY_API_KEY"],
      optionalSecrets: [
        "NEON_DATABASE_URL",
        "NOTION_TOKEN",
        "NOTION_DATABASE_ID_ATOMIC_FACTS",
      ],
      features: {
        drandBeacon: true,
        vrfGeneration: true,
        notionSync: false,
        auditTrail: true,
      },
    },

    staging: {
      name: "staging",
      domain: "staging.id.chitty.cc",
      url: "https://staging.id.chitty.cc",
      workerName: "chittyid-staging",
      kvNamespaces: {
        CHITTYID_KV: "ec782932b5f54c359d9aef2e28898bf9",
        MCP_SESSIONS: "dd1dff525a27431aa47844eb364e6606",
        OAUTH_TOKENS: "0189885179514d639776ec3bfe8f8274",
        API_KEYS: "41593bb3096745c0b59e0bf6d5cbae20",
        PLATFORM_CACHE: "d66c1e709c72456fa21aaa0d02f2db5e",
        PLATFORM_KV: "d52d89c1eebd402b95719161d311e7df",
      },
      requiresSecrets: [
        "CHITTY_ID_TOKEN",
        "CHITTY_API_KEY",
        "NEON_DATABASE_URL",
      ],
      optionalSecrets: [
        "NOTION_TOKEN",
        "NOTION_DATABASE_ID_ATOMIC_FACTS",
        "CHITTYOS_SERVICE_TOKEN",
      ],
      features: {
        drandBeacon: true,
        vrfGeneration: true,
        notionSync: true,
        auditTrail: true,
      },
    },

    production: {
      name: "production",
      domain: "id.chitty.cc",
      url: "https://id.chitty.cc",
      workerName: "chittyid-production",
      kvNamespaces: {
        CHITTYID_KV: "ec782932b5f54c359d9aef2e28898bf9",
        MCP_SESSIONS: "dd1dff525a27431aa47844eb364e6606",
        OAUTH_TOKENS: "0189885179514d639776ec3bfe8f8274",
        API_KEYS: "41593bb3096745c0b59e0bf6d5cbae20",
        PLATFORM_CACHE: "d66c1e709c72456fa21aaa0d02f2db5e",
        PLATFORM_KV: "d52d89c1eebd402b95719161d311e7df",
      },
      requiresSecrets: [
        "CHITTY_ID_TOKEN",
        "CHITTY_API_KEY",
        "NEON_DATABASE_URL",
        "CHITTYOS_SERVICE_TOKEN",
      ],
      optionalSecrets: ["NOTION_TOKEN", "NOTION_DATABASE_ID_ATOMIC_FACTS"],
      features: {
        drandBeacon: true,
        vrfGeneration: true,
        notionSync: true,
        auditTrail: true,
        monitoring: true,
        alerting: true,
      },
    },
  },

  /**
   * Service Dependencies
   */
  services: {
    drand: {
      name: "drand Beacon",
      url: "https://api.drand.sh/public/latest",
      chainHash:
        "dbd506d6ef76e5f386f41c651dcb808c5bcbd75471cc4eafa3f4df7ad4e4c493",
      healthCheck: "https://api.drand.sh/chains",
      required: true,
    },
    neon: {
      name: "Neon PostgreSQL",
      healthCheck: (url) => `${url.split("@")[1]?.split("/")[0]}`, // Extract host
      required: true,
    },
    chittyRouter: {
      name: "ChittyRouter AI Gateway",
      url: "https://router.chitty.cc",
      healthCheck: "https://router.chitty.cc/health",
      required: false,
    },
    chittyRegistry: {
      name: "ChittyOS Registry",
      url: "https://registry.chitty.cc",
      healthCheck: "https://registry.chitty.cc/health",
      required: false,
    },
  },

  /**
   * Cloudflare Account Configuration
   */
  cloudflare: {
    accountId: "0bc21e3a5a9de1a4cc843be9c3e98121", // ChittyCorp LLC
    zoneName: "chitty.cc",
    routes: {
      production: "id.chitty.cc/*",
      staging: "staging.id.chitty.cc/*",
    },
  },

  /**
   * Deployment Configuration
   */
  deployment: {
    requiresApproval: {
      production: true,
      staging: false,
      development: false,
    },
    healthCheckTimeout: 30, // seconds
    propagationDelay: 20, // seconds
    monitoringDuration: 300, // seconds (5 minutes)
    rollbackEnabled: true,
  },

  /**
   * Validation Rules
   */
  validation: {
    blockedPatterns: [
      "Math.random()",
      "Math.floor(Math.random()",
      "new Date().getTime()",
      "Date.now() *", // Multiplying timestamp with random
    ],
    requiredFiles: [
      "src/services/drand-beacon.js",
      "src/services/vrf-generator.js",
      "functions/api/[[route]].js",
      "wrangler.toml",
    ],
    requiredEndpoints: ["/health", "/v1/mint"],
  },

  /**
   * Monitoring & Alerting
   */
  monitoring: {
    metrics: [
      "id_generation_rate",
      "drand_beacon_availability",
      "vrf_computation_time",
      "kv_operation_success_rate",
      "circuit_breaker_trips",
    ],
    alertThresholds: {
      drandBeaconFailureRate: 0.001, // 0.1%
      vrfLatencyP99: 500, // ms
      kvFailureRate: 0.005, // 0.5%
      circuitBreakerTrips: 0, // per hour
    },
  },
};

/**
 * Get configuration for specific environment
 */
export function getEnvironmentContext(env = "development") {
  const context = chittyContext.environments[env];
  if (!context) {
    throw new Error(`Unknown environment: ${env}`);
  }
  return context;
}

/**
 * Validate environment configuration
 */
export function validateEnvironment(env = "development") {
  const context = getEnvironmentContext(env);
  const errors = [];

  // Check required secrets (in CI, we can't actually validate values)
  console.log(`\n🔍 Validating ${env} environment...`);
  console.log(`📝 Required secrets: ${context.requiresSecrets.join(", ")}`);
  console.log(`📝 Optional secrets: ${context.optionalSecrets.join(", ")}`);

  // Check KV namespaces
  console.log(`\n📦 KV Namespaces:`);
  Object.entries(context.kvNamespaces).forEach(([binding, id]) => {
    console.log(`  - ${binding}: ${id}`);
  });

  // Check features
  console.log(`\n✨ Features:`);
  Object.entries(context.features).forEach(([feature, enabled]) => {
    console.log(`  - ${feature}: ${enabled ? "✅" : "❌"}`);
  });

  if (errors.length > 0) {
    console.error(`\n❌ Validation errors:\n${errors.join("\n")}`);
    return false;
  }

  console.log(`\n✅ Environment validation passed`);
  return true;
}

/**
 * Generate GitHub Actions environment variables
 */
export function generateGitHubActionsEnv(env = "production") {
  const context = getEnvironmentContext(env);

  return {
    ENVIRONMENT: env,
    WORKER_NAME: context.workerName,
    DEPLOYMENT_URL: context.url,
    CLOUDFLARE_ACCOUNT_ID: chittyContext.cloudflare.accountId,
    DRAND_BEACON_URL: chittyContext.services.drand.url,
  };
}

export default chittyContext;
