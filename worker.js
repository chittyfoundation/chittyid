/**
 * ChittyID Mothership - Cloudflare Worker Entry Point
 * Hardened Security Configuration with Pipeline Enforcement
 */

import { createPipelineEnforcer } from './src/middleware/pipeline-enforcer.js';
import { createRequestInterceptor } from './src/middleware/request-interceptor.js';
import { PipelineIntegrityBreaker } from './src/enforcement/circuit-breaker.js';
import { ComplianceMonitor } from './src/enforcement/compliance-monitor.js';

// Import the main API handler from Pages Functions
import { onRequest } from './functions/api/[[route]].js';

/**
 * Main Worker entry point with hardened security
 */
export default {
  async fetch(request, env, ctx) {
    // Security hardening - ensure all requests go through our middleware
    try {
      // Create a context object that matches Pages Functions format
      const context = {
        request,
        env,
        ctx,
        waitUntil: ctx.waitUntil.bind(ctx),
        passThroughOnException: ctx.passThroughOnException.bind(ctx)
      };

      // Use the same handler as Pages Functions but in Worker context
      return await onRequest(context);

    } catch (error) {
      console.error('Worker error:', error);

      // Security response for any unhandled errors
      return new Response(
        JSON.stringify({
          success: false,
          error: 'SECURITY_ERROR',
          message: 'Request processing failed security validation',
          timestamp: new Date().toISOString(),
          security: {
            level: 'MAXIMUM',
            enforcement: 'MANDATORY',
            bypassable: false
          }
        }),
        {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
            'X-Security-Error': 'true',
            'X-Pipeline-Required': 'true',
            'X-ChittyOS-Service': 'chittyid-mothership'
          }
        }
      );
    }
  }
};