/**
 * Session Sync Middleware
 * Automatically synchronizes session state across requests
 */

import { SessionSyncService } from '../services/session-sync.js';

export class SessionMiddleware {
  constructor(env) {
    this.env = env;
    this.syncService = new SessionSyncService(env);
  }

  /**
   * Process request with session synchronization
   */
  async processRequest(request, next) {
    const sessionId = this.extractSessionId(request);

    if (!sessionId) {
      // No session required, proceed
      return await next(request);
    }

    // Get or create session context
    const sessionContext = await this.getSessionContext(sessionId, request);

    // Add session to request context
    request.sessionContext = sessionContext;

    // Process request
    const response = await next(request);

    // Sync any session changes
    if (sessionContext.modified) {
      await this.syncSessionChanges(sessionContext);
    }

    return response;
  }

  /**
   * Extract session ID from request
   */
  extractSessionId(request) {
    // Check header
    const headerSession = request.headers.get('X-Session-ID');
    if (headerSession) return headerSession;

    // Check authorization token
    const auth = request.headers.get('Authorization');
    if (auth && auth.startsWith('Bearer ')) {
      // Extract session from JWT or token
      return this.extractSessionFromToken(auth.substring(7));
    }

    // Check URL parameters
    const url = new URL(request.url);
    return url.searchParams.get('sessionId');
  }

  /**
   * Get or create session context
   */
  async getSessionContext(sessionId, request) {
    let session = await this.syncService.getSession(sessionId);

    if (!session) {
      // Create new session if needed
      const { userId, projectId } = this.extractUserInfo(request);

      if (userId && projectId) {
        const result = await this.syncService.initializeSession(userId, projectId, {
          userAgent: request.headers.get('User-Agent'),
          ip: request.headers.get('CF-Connecting-IP'),
          origin: request.headers.get('Origin')
        });

        session = result.session;
      }
    }

    return {
      id: sessionId,
      session,
      modified: false,
      updates: {},
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Sync session changes after request processing
   */
  async syncSessionChanges(context) {
    if (!context.session || Object.keys(context.updates).length === 0) {
      return;
    }

    try {
      await this.syncService.syncSession(context.id, context.updates);
    } catch (error) {
      console.error('Failed to sync session changes:', error);
    }
  }

  /**
   * Extract session from token
   */
  extractSessionFromToken(token) {
    try {
      // Basic JWT decode - enhance with proper JWT library
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        return payload.sessionId || payload.sid;
      }
    } catch (error) {
      console.error('Failed to extract session from token:', error);
    }
    return null;
  }

  /**
   * Extract user info from request
   */
  extractUserInfo(request) {
    // Extract from headers or token
    const userId = request.headers.get('X-User-ID');
    const projectId = request.headers.get('X-Project-ID');

    return { userId, projectId };
  }

  /**
   * Update session context helper
   */
  updateSession(context, updates) {
    context.modified = true;
    Object.assign(context.updates, updates);
  }

  /**
   * Create session decorator for ChittyID pipeline
   */
  createPipelineDecorator() {
    return {
      beforePipeline: async (context) => {
        // Ensure session is available before pipeline processing
        const sessionId = context.request.sessionContext?.id;

        if (sessionId) {
          // Add session info to pipeline context
          context.sessionId = sessionId;
          context.session = context.request.sessionContext.session;

          // Update session with pipeline start
          this.updateSession(context.request.sessionContext, {
            pipelineStarted: new Date().toISOString(),
            currentStage: 'router'
          });
        }
      },

      afterStage: async (context, stage, result) => {
        // Update session after each pipeline stage
        if (context.request.sessionContext) {
          this.updateSession(context.request.sessionContext, {
            currentStage: stage,
            [`${stage}Result`]: result.success,
            lastStageUpdate: new Date().toISOString()
          });
        }
      },

      afterPipeline: async (context, result) => {
        // Update session with final result
        if (context.request.sessionContext) {
          this.updateSession(context.request.sessionContext, {
            pipelineCompleted: new Date().toISOString(),
            pipelineResult: result.success,
            chittyId: result.chittyId,
            currentStage: null
          });
        }
      }
    };
  }

  /**
   * Session health check
   */
  async healthCheck() {
    try {
      // Test session creation
      const testSession = await this.syncService.initializeSession('test', 'health-check', {
        type: 'health-check',
        timestamp: new Date().toISOString()
      });

      // Test sync
      const syncResult = await this.syncService.syncSession(testSession.sessionId, {
        healthCheck: true,
        timestamp: new Date().toISOString()
      });

      // Cleanup test session
      await this.env.SESSIONS?.delete(`session:${testSession.sessionId}`);

      return {
        healthy: true,
        sessionCreation: testSession.success,
        sessionSync: syncResult.success,
        services: Object.keys(this.syncService.services).length
      };

    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }
}