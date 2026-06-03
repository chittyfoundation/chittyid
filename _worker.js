import { ChittyIDValidator } from './src/agents/validator.js';
import { SecurityAgent } from './src/agents/security.js';
import { RoutingAgent } from './src/agents/routing.js';
import { PerformanceAgent } from './src/agents/performance.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Initialize AI agents
    const validator = new ChittyIDValidator(env);
    const security = new SecurityAgent(env);
    const routing = new RoutingAgent(env);
    const performance = new PerformanceAgent(env);

    try {
      // Route handling
      switch (url.pathname) {
        case '/validate':
          return handleValidation(request, { validator, security, env });

        case '/route':
          return handleRouting(request, { routing, performance, env });

        case '/agent-status':
          return handleAgentStatus({ validator, security, routing, performance });

        case '/api/chittyid/validate':
          return handleAPIValidation(request, { validator, security, env });

        case '/api/chittyid/route':
          return handleAPIRouting(request, { routing, performance, env });

        default:
          return new Response(`<!DOCTYPE html>
<html>
<head>
    <title>ChittyID</title>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; }
        h1 { color: #333; }
        .status { background: #e8f5e8; padding: 20px; border-radius: 4px; margin: 20px 0; }
        .endpoint { background: #f0f0f0; padding: 15px; margin: 10px 0; border-radius: 4px; }
        code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 ChittyID</h1>
        <div class="status">
            <strong>Status:</strong> AI Agent System Active<br>
            <strong>Version:</strong> 1.0.0<br>
            <strong>Agents:</strong> Validator, Security, Routing, Performance
        </div>

        <h2>API Endpoints</h2>
        <div class="endpoint">
            <strong>POST /validate</strong><br>
            Validate ChittyID format and security
        </div>
        <div class="endpoint">
            <strong>POST /route</strong><br>
            Get optimized routing for ChittyID
        </div>
        <div class="endpoint">
            <strong>GET /agent-status</strong><br>
            View AI agent system status
        </div>

        <h2>ChittyID Format</h2>
        <p>Official format: <code>VV-G-LLL-SSSS-T-YYMM-C-XX</code></p>
        <ul>
            <li><strong>VV:</strong> Version (2 digits)</li>
            <li><strong>G:</strong> Geographic region</li>
            <li><strong>LLL:</strong> Legal jurisdiction (3 letters)</li>
            <li><strong>SSSS:</strong> Sequential ID (4 digits)</li>
            <li><strong>T:</strong> Entity type (ChittyPerson/Location/Thing/Event)</li>
            <li><strong>YM:</strong> Year-Month code</li>
            <li><strong>C:</strong> Trust level (L0-L5)</li>
            <li><strong>X:</strong> Mod-97 checksum</li>
        </ul>
    </div>
</body>
</html>`, {
            headers: { 'Content-Type': 'text/html' }
          });
      }
    } catch (error) {
      return new Response(`Error: ${error.message}`, { status: 500 });
    }
  }
};

async function handleValidation(request, { validator, security, env }) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const { chittyId } = await request.json();

  // Run validation through AI agents
  const validationResult = await validator.validate(chittyId);
  const securityCheck = await security.analyze(chittyId, validationResult);

  // Store results in AUTH_CACHE
  await env.AUTH_CACHE.put(`validation:${chittyId}`, JSON.stringify({
    valid: validationResult.valid,
    security: securityCheck,
    timestamp: Date.now()
  }), { expirationTtl: 3600 });

  return Response.json({
    valid: validationResult.valid,
    details: validationResult.details,
    security: securityCheck,
    trustLevel: validationResult.trustLevel
  });
}

async function handleRouting(request, { routing, performance, env }) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const { chittyId, source } = await request.json();

  // AI-powered routing optimization
  const route = await routing.optimizeRoute(chittyId, source);
  const perfMetrics = await performance.analyzeRequest(chittyId, route);

  // Update routing vectors
  await routing.updateVectors(chittyId, route, perfMetrics);

  return Response.json({
    route: route.endpoint,
    region: route.region,
    performance: perfMetrics,
    optimization: route.optimization
  });
}

async function handleAgentStatus(agents) {
  const status = {};

  for (const [name, agent] of Object.entries(agents)) {
    status[name] = await agent.getStatus();
  }

  return Response.json({
    system: 'ChittyID AI Agent System',
    agents: status,
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
}

async function handleAPIValidation(request, { validator, security, env }) {
  return handleValidation(request, { validator, security, env });
}

async function handleAPIRouting(request, { routing, performance, env }) {
  return handleRouting(request, { routing, performance, env });
}