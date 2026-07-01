/**
 * ChittyID Worker - Refactored with Pipeline and Session Sync
 * Main entry point for the ChittyID management system
 */

import { ChittyAPI } from './api/index.js';
import { NotionBridgeAPI } from './api/notion-bridge.js';
import { SessionAPI } from './api/session.js';
import { SessionMiddleware } from './middleware/session-middleware.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Redirect direct agent access to the front door
    const userAgent = request.headers.get("user-agent") || "";
    if (userAgent.toLowerCase().includes("curl") || userAgent.toLowerCase().includes("python") || userAgent.toLowerCase().includes("claude")) {
      return new Response(JSON.stringify({
        success: false,
        error: "Direct synthetic agent access prohibited. Route through the canonical front door via `can chitty whoami`.",
        timestamp: new Date().toISOString()
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Initialize services
    const sessionMiddleware = new SessionMiddleware(env);

    // Route to appropriate API
    try {
      // Session API routes
      if (path.startsWith('/api/session')) {
        const sessionAPI = new SessionAPI(env);
        return await sessionAPI.handleRequest(request);
      }

      // Notion Bridge API routes
      if (path.startsWith('/bridges/notion')) {
        const notionAPI = new NotionBridgeAPI(env);
        return await notionAPI.handleRequest(request);
      }

      // Main ChittyID API routes (with session middleware)
      const chittyAPI = new ChittyAPI(env);

      // Apply session middleware to main API requests
      return await sessionMiddleware.processRequest(request, async (req) => {
        return await chittyAPI.handleRequest(req);
      });

    } catch (error) {
      console.error('Worker error:', error);

      return new Response(JSON.stringify({
        success: false,
        error: 'Internal server error',
        message: error.message,
        timestamp: new Date().toISOString()
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  /**
   * Scheduled handler for background tasks
   */
  async scheduled(event, env, ctx) {
    const sessionMiddleware = new SessionMiddleware(env);

    try {
      // Process retry queues
      console.log('Processing session retry queue...');
      await sessionMiddleware.syncService.processRetryQueue();

      // Clean up expired sessions
      console.log('Cleaning up expired sessions...');
      const cleanupResult = await sessionMiddleware.syncService.cleanupSessions();
      console.log(`Cleaned up ${cleanupResult.cleaned} expired sessions`);

      // Process Notion sync retry queue if configured
      if (env.NOTION_TOKEN && env.NOTION_DATABASE_ID_ATOMIC_FACTS) {
        console.log('Processing Notion sync DLQ...');
        const notionAPI = new NotionBridgeAPI(env);
        await notionAPI.handleDlqProcess({ json: () => ({ maxItems: 50 }) }, {});
      }

    } catch (error) {
      console.error('Scheduled task error:', error);
    }
  },

  /**
   * Durable Object for WebSocket connections
   */
  async webSocket(state, env) {
    return {
      async fetch(request) {
        const url = new URL(request.url);
        const chittyId = url.searchParams.get('chittyId');

        // WebSocket upgrade
        if (request.headers.get('Upgrade') === 'websocket') {
          const pair = new WebSocketPair();
          const [client, server] = Object.values(pair);

          // Accept the WebSocket connection
          server.accept();

          // Handle WebSocket events
          server.addEventListener('message', async (event) => {
            try {
              const message = JSON.parse(event.data);

              switch (message.type) {
                case 'subscribe':
                  // Subscribe to ChittyID updates
                  await this.subscribe(chittyId, server);
                  server.send(JSON.stringify({
                    type: 'subscribed',
                    chittyId,
                    timestamp: new Date().toISOString()
                  }));
                  break;

                case 'session_sync':
                  // Handle real-time session sync
                  const sessionAPI = new SessionAPI(env);
                  const result = await sessionAPI.syncService.syncSession(
                    message.sessionId,
                    message.updates
                  );

                  server.send(JSON.stringify({
                    type: 'session_synced',
                    success: result.success,
                    sessionId: message.sessionId,
                    timestamp: new Date().toISOString()
                  }));
                  break;

                default:
                  server.send(JSON.stringify({
                    type: 'error',
                    message: 'Unknown message type',
                    timestamp: new Date().toISOString()
                  }));
              }
            } catch (error) {
              server.send(JSON.stringify({
                type: 'error',
                message: error.message,
                timestamp: new Date().toISOString()
              }));
            }
          });

          server.addEventListener('close', () => {
            console.log(`WebSocket closed for ChittyID: ${chittyId}`);
          });

          return new Response(null, {
            status: 101,
            webSocket: client
          });
        }

        return new Response('WebSocket endpoint', { status: 400 });
      },

      async subscribe(chittyId, websocket) {
        // Store WebSocket connection for this ChittyID
        // Implementation depends on Durable Objects storage
        console.log(`Subscribed to updates for ChittyID: ${chittyId}`);
      }
    };
  }
};