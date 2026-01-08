/**
 * Authentication Middleware for ChittyID
 * Validates tokens via ChittyAuth service
 */

import { ChittyAuthClient } from '../services/chittyauth-client.js';

export class AuthMiddleware {
  constructor(env) {
    this.env = env;
    this.chittyAuth = new ChittyAuthClient(env);

    // Public endpoints that don't require authentication
    this.publicEndpoints = new Set([
      '/health',
      '/api/health',
      '/api/validate',
      '/api/spec',
      '/api/info/',
      '/'
    ]);

    // Scope requirements for different endpoints
    this.scopeRequirements = {
      '/api/get-chittyid': 'chittyid:generate',
      '/v1/mint': 'chittyid:generate',
      '/api/registry/register': 'admin:*',
      '/api/registry/deregister': 'admin:*',
      '/v1/tokens/stats': 'admin:*'
    };
  }

  /**
   * Authenticate request
   */
  async authenticate(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Check if endpoint is public
    if (this.isPublicEndpoint(path)) {
      return { authenticated: true, public: true };
    }

    // Extract token from request
    const token = this.chittyAuth.extractToken(request);
    if (!token) {
      return {
        authenticated: false,
        response: this.unauthorizedResponse('Authorization header required')
      };
    }

    // Determine required scope
    const requiredScope = this.getRequiredScope(path);

    // Validate with ChittyAuth
    const validation = requiredScope
      ? await this.chittyAuth.validateScope(token, requiredScope)
      : await this.chittyAuth.validateToken(token);

    if (!validation.valid && !validation.authorized) {
      return {
        authenticated: false,
        response: this.unauthorizedResponse(validation.error)
      };
    }

    // Log successful authentication
    await this.logAuthEvent({
      eventType: 'authentication_success',
      chittyId: validation.chittyId,
      path,
      scope: validation.scope,
      timestamp: Date.now()
    });

    return {
      authenticated: true,
      chittyId: validation.chittyId,
      scope: validation.scope,
      tokenId: validation.tokenId
    };
  }

  /**
   * Middleware wrapper for routes
   */
  async withAuth(request, handler) {
    const auth = await this.authenticate(request);

    if (!auth.authenticated) {
      return auth.response;
    }

    // Add auth context to request
    request.auth = {
      chittyId: auth.chittyId,
      scope: auth.scope,
      tokenId: auth.tokenId,
      public: auth.public
    };

    // Call the handler
    return await handler(request);
  }

  /**
   * Check if endpoint is public
   */
  isPublicEndpoint(path) {
    // Exact match
    if (this.publicEndpoints.has(path)) {
      return true;
    }

    // Prefix match for /api/info/*
    for (const endpoint of this.publicEndpoints) {
      if (endpoint.endsWith('/') && path.startsWith(endpoint)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get required scope for endpoint
   */
  getRequiredScope(path) {
    // Check exact match
    if (this.scopeRequirements[path]) {
      return this.scopeRequirements[path];
    }

    // Check prefix match
    for (const [endpoint, scope] of Object.entries(this.scopeRequirements)) {
      if (endpoint.endsWith('/') && path.startsWith(endpoint)) {
        return scope;
      }
    }

    // Default: require read access
    return 'chittyid:read';
  }

  /**
   * Log authentication event
   */
  async logAuthEvent(event) {
    if (!this.env.AUTH_AUDIT) {
      return;
    }

    const eventId = `auth_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    try {
      await this.env.AUTH_AUDIT.put(
        `event:${eventId}`,
        JSON.stringify(event),
        { expirationTtl: 86400 * 30 } // 30 days
      );
    } catch (error) {
      console.error('Failed to log auth event:', error);
    }
  }

  /**
   * Create unauthorized response
   */
  unauthorizedResponse(message) {
    return new Response(JSON.stringify({
      success: false,
      error: 'UNAUTHORIZED',
      message,
      timestamp: new Date().toISOString(),
      help: {
        message: 'API tokens are required for all ChittyID operations',
        howToGetToken: 'Request a token from https://auth.chitty.cc/v1/tokens/provision',
        documentation: 'https://docs.chitty.cc/auth/tokens'
      }
    }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Bearer realm="ChittyID API"'
      }
    });
  }

  /**
   * Create forbidden response
   */
  forbiddenResponse(message, requiredScope, availableScope) {
    return new Response(JSON.stringify({
      success: false,
      error: 'FORBIDDEN',
      message,
      requiredScope,
      availableScope,
      timestamp: new Date().toISOString()
    }), {
      status: 403,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}

/**
 * Factory function to create auth middleware
 */
export function createAuthMiddleware(env) {
  const middleware = new AuthMiddleware(env);
  return async (request, handler) => {
    return await middleware.withAuth(request, handler);
  };
}
