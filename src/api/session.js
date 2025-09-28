/**
 * Session API - Distributed session management endpoints
 * Handles session synchronization across ChittyOS ecosystem
 */

import { SessionSyncService } from '../services/session-sync.js';

export class SessionAPI {
  constructor(env) {
    this.env = env;
    this.syncService = new SessionSyncService(env);
  }

  /**
   * Handle session API requests
   */
  async handleRequest(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Session-ID'
    };

    if (method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    try {
      // Route to handler
      const handler = this.getHandler(path, method);
      if (!handler) {
        return this.errorResponse('Endpoint not found', 404, headers);
      }

      const result = await handler(request, url);
      return new Response(JSON.stringify(result), { headers });

    } catch (error) {
      console.error('Session API error:', error);
      return this.errorResponse(error.message, 500, headers);
    }
  }

  /**
   * Get request handler
   */
  getHandler(path, method) {
    const routes = {
      'POST /api/session/init': async (request) => {
        const { userId, projectId, metadata } = await request.json();
        return await this.syncService.initializeSession(userId, projectId, metadata);
      },

      'POST /api/session/sync': async (request) => {
        const body = await request.json();

        // Handle incoming sync from other services
        if (body.operation === 'upsert') {
          return await this.handleIncomingSync(body);
        }

        // Handle outgoing sync request
        const { sessionId, updates } = body;
        return await this.syncService.syncSession(sessionId, updates);
      },

      'GET /api/session/:id': async (request, url) => {
        const sessionId = this.extractSessionId(url.pathname);
        const session = await this.syncService.getSession(sessionId);

        if (!session) {
          return { success: false, error: 'Session not found' };
        }

        return { success: true, session };
      },

      'GET /api/session/:id/status': async (request, url) => {
        const sessionId = this.extractSessionId(url.pathname);
        return await this.syncService.getSyncStatus(sessionId);
      },

      'POST /api/session/:id/checkpoint': async (request, url) => {
        const sessionId = this.extractSessionId(url.pathname);
        const session = await this.syncService.getSession(sessionId);

        if (!session) {
          return { success: false, error: 'Session not found' };
        }

        await this.syncService.createCheckpoint(sessionId, session);
        return { success: true, checkpoint: true };
      },

      'POST /api/session/:id/invalidate': async (request, url) => {
        const sessionId = this.extractSessionId(url.pathname);
        return await this.invalidateSession(sessionId);
      },

      'GET /api/session/health': async () => {
        return await this.getHealthStatus();
      },

      'POST /api/session/retry': async () => {
        await this.syncService.processRetryQueue();
        return { success: true, processed: true };
      },

      'POST /api/session/cleanup': async () => {
        const result = await this.syncService.cleanupSessions();
        return { success: true, ...result };
      }
    };

    // Match route
    for (const [pattern, handler] of Object.entries(routes)) {
      const [routeMethod, routePath] = pattern.split(' ');

      if (method !== routeMethod) continue;

      // Handle parameterized routes
      if (routePath.includes(':id')) {
        const baseRoute = routePath.replace(':id', '');
        if (path.startsWith(baseRoute.replace('/api/session/', '/api/session/'))) {
          return handler;
        }
      } else if (path === routePath) {
        return handler;
      }
    }

    return null;
  }

  /**
   * Handle incoming sync from other services
   */
  async handleIncomingSync(syncData) {
    const { session, timestamp, priority } = syncData;

    try {
      // Validate sync token
      const token = syncData.headers?.['X-Sync-Token'];
      if (!await this.validateSyncToken(token, session.id)) {
        return {
          success: false,
          error: 'Invalid sync token'
        };
      }

      // Apply the sync
      await this.syncService.storeLocal(session);

      // Calculate response checksum
      const checksum = this.syncService.calculateChecksum(session);

      return {
        success: true,
        version: session.version,
        checksum,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Incoming sync failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Invalidate session across all services
   */
  async invalidateSession(sessionId) {
    const session = await this.syncService.getSession(sessionId);

    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    // Mark as invalidated
    session.state = 'invalidated';
    session.invalidatedAt = new Date().toISOString();

    // Sync invalidation across all nodes
    const result = await this.syncService.syncSession(sessionId, session);

    // Remove from local storage
    await this.env.SESSIONS?.delete(`session:${sessionId}`);

    return {
      success: true,
      invalidated: true,
      synced: result.success,
      nodes: result.syncedNodes
    };
  }

  /**
   * Get health status of session sync system
   */
  async getHealthStatus() {
    const services = {};

    // Check each service health
    for (const [service, config] of Object.entries(this.syncService.services)) {
      const healthKey = `health:${service}`;
      const healthData = await this.env.SESSIONS?.get(healthKey);

      services[service] = healthData ? JSON.parse(healthData) : {
        healthy: false,
        lastCheck: 'never'
      };
    }

    // Get retry queue size
    const retryQueue = await this.env.SESSIONS?.list({ prefix: 'retry:' });
    const retryCount = retryQueue?.keys?.length || 0;

    // Get active sessions count
    const sessions = await this.env.SESSIONS?.list({ prefix: 'session:' });
    const sessionCount = sessions?.keys?.length || 0;

    return {
      status: 'operational',
      timestamp: new Date().toISOString(),
      services,
      queues: {
        retry: retryCount,
        retryThreshold: 100,
        retryAlert: retryCount > 100
      },
      sessions: {
        active: sessionCount,
        max: this.syncService.config.maxSessions,
        utilizationPercent: (sessionCount / this.syncService.config.maxSessions) * 100
      },
      metrics: this.syncService.metrics
    };
  }

  /**
   * Validate sync token
   */
  async validateSyncToken(token, sessionId) {
    if (!token) return false;

    // Simple validation - enhance with proper JWT or HMAC
    try {
      const decoded = atob(token);
      return decoded.includes(sessionId);
    } catch {
      return false;
    }
  }

  /**
   * Extract session ID from path
   */
  extractSessionId(path) {
    const parts = path.split('/');
    return parts[parts.length - 1] === 'status' || parts[parts.length - 1] === 'checkpoint' || parts[parts.length - 1] === 'invalidate'
      ? parts[parts.length - 2]
      : parts[parts.length - 1];
  }

  /**
   * Error response helper
   */
  errorResponse(message, status, headers) {
    return new Response(JSON.stringify({
      success: false,
      error: message,
      timestamp: new Date().toISOString()
    }), {
      status,
      headers
    });
  }
}