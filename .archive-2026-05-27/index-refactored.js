/**
 * ChittyID Mothership - Refactored Main Entry Point
 * Clean architecture with proper service separation
 */

import ChittyPipeline from './services/pipeline.js';
import ValidationService from './services/validation.js';
import SearchService from './services/search.js';
import SecretService from './services/secret.js';
import WebSocketService from './services/websocket.js';
import { corsHeaders, errorResponse, successResponse } from './utils/http.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    // Initialize services
    const services = {
      pipeline: new ChittyPipeline(env),
      validation: new ValidationService(env),
      search: new SearchService(env),
      secret: new SecretService(env),
      websocket: new WebSocketService(env)
    };

    // Track request analytics
    if (env.CHITTY_ANALYTICS) {
      ctx.waitUntil(
        env.CHITTY_ANALYTICS.writeDataPoint({
          indexes: [path, method],
          blobs: [request.headers.get('user-agent') || 'unknown'],
          doubles: [Date.now()]
        })
      );
    }

    try {
      // Route to appropriate handler
      const route = this.matchRoute(path, method);

      if (!route) {
        return errorResponse('Not found', 404);
      }

      return await route.handler(request, env, services, url);
    } catch (error) {
      console.error('Request error:', error);
      return errorResponse('Internal server error', 500, error.message);
    }
  },

  matchRoute(path, method) {
    const routes = [
      // ChittyID Generation - Pipeline Only
      {
        pattern: /^\/api\/get-chittyid$/,
        method: 'GET',
        handler: handleGetChittyID
      },

      // Direct Access - No Pipeline Required
      {
        pattern: /^\/api\/validate$/,
        method: 'POST',
        handler: handleValidate
      },
      {
        pattern: /^\/api\/info\/(.+)$/,
        method: 'GET',
        handler: handleGetInfo
      },
      {
        pattern: /^\/api\/search$/,
        method: 'POST',
        handler: handleSearch
      },

      // Secret Management
      {
        pattern: /^\/api\/secret\/generate$/,
        method: 'POST',
        handler: handleGenerateSecret
      },
      {
        pattern: /^\/api\/secret\/validate$/,
        method: 'POST',
        handler: handleValidateSecret
      },
      {
        pattern: /^\/api\/secret\/revoke$/,
        method: 'POST',
        handler: handleRevokeSecret
      },

      // WebSocket
      {
        pattern: /^\/ws$/,
        method: 'GET',
        handler: handleWebSocket
      },

      // Utility Endpoints
      {
        pattern: /^\/health$/,
        method: 'GET',
        handler: handleHealth
      },
      {
        pattern: /^\/api\/spec$/,
        method: 'GET',
        handler: handleSpec
      },
      {
        pattern: /^\/$/,
        method: 'GET',
        handler: handleHome
      }
    ];

    for (const route of routes) {
      if (route.method !== method) continue;

      const match = path.match(route.pattern);
      if (match) {
        return { ...route, params: match.slice(1) };
      }
    }

    return null;
  }
};

/**
 * Handler Functions
 */

// Pipeline-required endpoint
async function handleGetChittyID(request, env, services, url) {
  const purpose = url.searchParams.get('for') || 'general';

  // Process through complete pipeline
  const result = await services.pipeline.process(request, purpose);

  if (!result.success) {
    return errorResponse(result.error.message, 401, result.error.code);
  }

  return successResponse({
    chittyId: result.chittyId,
    context: result.context
  });
}

// Direct access endpoints (no pipeline)
async function handleValidate(request, env, services) {
  const body = await request.json();
  const { chittyId, context } = body;

  if (!chittyId) {
    return errorResponse('ChittyID is required', 400);
  }

  const result = await services.validation.validate(chittyId, context);
  return successResponse(result);
}

async function handleGetInfo(request, env, services, url, params) {
  const chittyId = params[0];

  if (!chittyId) {
    return errorResponse('ChittyID is required', 400);
  }

  const info = await services.validation.getInfo(chittyId);

  if (!info) {
    return errorResponse('ChittyID not found', 404);
  }

  return successResponse(info);
}

async function handleSearch(request, env, services) {
  const body = await request.json();
  const { query, limit = 10 } = body;

  if (!query) {
    return errorResponse('Search query is required', 400);
  }

  const results = await services.search.search(query, limit);
  return successResponse({ results });
}

// Secret management
async function handleGenerateSecret(request, env, services) {
  const body = await request.json();
  const { chittyId, permissions = ['read'], rateLimit = 100, expiresIn } = body;

  if (!chittyId) {
    return errorResponse('ChittyID is required', 400);
  }

  const secret = await services.secret.generate({
    chittyId,
    permissions,
    rateLimit,
    expiresIn
  });

  return successResponse(secret);
}

async function handleValidateSecret(request, env, services) {
  const body = await request.json();
  const { secret } = body;

  if (!secret) {
    return errorResponse('Secret is required', 400);
  }

  const result = await services.secret.validate(secret);
  return successResponse(result);
}

async function handleRevokeSecret(request, env, services) {
  const body = await request.json();
  const { secret } = body;

  if (!secret) {
    return errorResponse('Secret is required', 400);
  }

  const success = await services.secret.revoke(secret);
  return successResponse({ success });
}

// WebSocket
async function handleWebSocket(request, env, services, url) {
  const chittyId = url.searchParams.get('chittyId');
  return services.websocket.createConnection(chittyId);
}

// Utility endpoints
async function handleHealth(request, env) {
  return successResponse({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      pipeline: true,
      validation: true,
      search: true,
      secrets: true,
      websocket: true,
      kv: !!env.CHITTY_IDS,
      analytics: !!env.CHITTY_ANALYTICS,
      ai: !!env.AI
    }
  });
}

async function handleSpec() {
  return successResponse({
    format: 'VV-G-LLL-SSSS-T-YYMM-C-XX',
    components: {
      VV: 'Version (2 digits): 01-05',
      G: 'Geographic region (1 digit): 1-9',
      LLL: 'Legal jurisdiction (3 letters): USA, CAN, etc.',
      SSSS: 'Sequential ID (4 digits): 0001-9999',
      T: 'Entity type (1 letter): P=Person, L=Location, T=Thing, E=Event',
      YM: 'Year-Month code (2-3 digits)',
      C: 'Trust level (1 digit): 0-5',
      X: 'Mod-97 checksum (2 digits)'
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
      9: 'Digital/Virtual'
    },
    trustLevels: {
      0: 'L0 - Unverified',
      1: 'L1 - Basic',
      2: 'L2 - Standard',
      3: 'L3 - Verified',
      4: 'L4 - Premium',
      5: 'L5 - Official'
    }
  });
}

async function handleHome() {
  return successResponse({
    name: 'ChittyID Mothership',
    version: '2.0.0',
    description: 'Management system for ChittyIDs from id.chitty.cc service',
    endpoints: {
      generation: {
        'GET /api/get-chittyid': 'Get ChittyID through pipeline (requires auth)'
      },
      validation: {
        'POST /api/validate': 'Validate existing ChittyID (public)',
        'GET /api/info/{id}': 'Get ChittyID information (public)',
        'POST /api/search': 'Search ChittyIDs (public)'
      },
      secrets: {
        'POST /api/secret/generate': 'Generate ChittySecret API key',
        'POST /api/secret/validate': 'Validate ChittySecret',
        'POST /api/secret/revoke': 'Revoke ChittySecret'
      },
      realtime: {
        'GET /ws': 'WebSocket for real-time updates'
      },
      utility: {
        'GET /health': 'Health check',
        'GET /api/spec': 'ChittyID format specification',
        'GET /': 'This documentation'
      }
    },
    pipeline: {
      stages: ['Router', 'Intake', 'Trust', 'Authorization', 'Service'],
      description: 'All ChittyID generation goes through the pipeline'
    }
  });
}