import { DurableObject } from 'cloudflare:workers';

interface Env {
  CHITTY_IDS: KVNamespace;
  CHITTY_UPDATES: DurableObjectNamespace;
}

interface ChittyIDUpdate {
  type: 'create' | 'update' | 'validate' | 'revoke';
  chittyId: string;
  timestamp: string;
  data?: any;
  clientId?: string;
}

export class ChittyIDWebSocketHandler extends DurableObject {
  private sessions: Map<WebSocket, { id: string; chittyId?: string; permissions?: string[] }> = new Map();
  private state: DurableObjectState;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/websocket') {
      // Upgrade to WebSocket
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected WebSocket', { status: 400 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // Accept the WebSocket connection
      server.accept();

      // Get authentication from query params or headers
      const chittyId = url.searchParams.get('chittyId');
      const sessionId = crypto.randomUUID();

      // Store session information
      this.sessions.set(server, {
        id: sessionId,
        chittyId: chittyId || undefined
      });

      // Set up event handlers
      server.addEventListener('message', async (event) => {
        await this.handleMessage(server, event);
      });

      server.addEventListener('close', () => {
        this.sessions.delete(server);
      });

      server.addEventListener('error', (error) => {
        console.error('WebSocket error:', error);
        this.sessions.delete(server);
      });

      // Send initial connection confirmation
      server.send(JSON.stringify({
        type: 'connected',
        sessionId,
        timestamp: new Date().toISOString()
      }));

      return new Response(null, {
        status: 101,
        webSocket: client
      });
    }

    return new Response('Not Found', { status: 404 });
  }

  async handleMessage(ws: WebSocket, event: MessageEvent) {
    const session = this.sessions.get(ws);
    if (!session) return;

    try {
      const message = JSON.parse(event.data as string);

      switch (message.type) {
        case 'subscribe':
          await this.handleSubscribe(ws, session, message);
          break;

        case 'unsubscribe':
          await this.handleUnsubscribe(ws, session, message);
          break;

        case 'update':
          await this.broadcastUpdate(message);
          break;

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
          break;

        default:
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Unknown message type',
            timestamp: new Date().toISOString()
          }));
      }
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format',
        timestamp: new Date().toISOString()
      }));
    }
  }

  async handleSubscribe(ws: WebSocket, session: any, message: any) {
    if (message.chittyId) {
      session.chittyId = message.chittyId;

      // Store subscription in Durable Object state
      const subscriptions = await this.state.storage.get<Set<string>>('subscriptions') || new Set();
      subscriptions.add(message.chittyId);
      await this.state.storage.put('subscriptions', subscriptions);

      ws.send(JSON.stringify({
        type: 'subscribed',
        chittyId: message.chittyId,
        timestamp: new Date().toISOString()
      }));
    }
  }

  async handleUnsubscribe(ws: WebSocket, session: any, message: any) {
    if (message.chittyId && session.chittyId === message.chittyId) {
      session.chittyId = undefined;

      // Remove subscription from Durable Object state
      const subscriptions = await this.state.storage.get<Set<string>>('subscriptions') || new Set();
      subscriptions.delete(message.chittyId);
      await this.state.storage.put('subscriptions', subscriptions);

      ws.send(JSON.stringify({
        type: 'unsubscribed',
        chittyId: message.chittyId,
        timestamp: new Date().toISOString()
      }));
    }
  }

  async broadcastUpdate(update: ChittyIDUpdate) {
    const message = JSON.stringify({
      ...update,
      timestamp: update.timestamp || new Date().toISOString()
    });

    // Broadcast to all connected clients watching this ChittyID
    for (const [ws, session] of this.sessions) {
      if (!update.chittyId || session.chittyId === update.chittyId) {
        try {
          ws.send(message);
        } catch (error) {
          // Connection might be closed, remove it
          this.sessions.delete(ws);
        }
      }
    }

    // Store update in history
    const history = await this.state.storage.get<ChittyIDUpdate[]>('history') || [];
    history.push(update);

    // Keep only last 100 updates
    if (history.length > 100) {
      history.shift();
    }

    await this.state.storage.put('history', history);
  }

  async getHistory(chittyId?: string): Promise<ChittyIDUpdate[]> {
    const history = await this.state.storage.get<ChittyIDUpdate[]>('history') || [];

    if (chittyId) {
      return history.filter(update => update.chittyId === chittyId);
    }

    return history;
  }
}

export class ChittyIDRealTimeAPI {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  async notifyUpdate(update: ChittyIDUpdate) {
    // Get or create Durable Object for this ChittyID
    const id = this.env.CHITTY_UPDATES.idFromName(update.chittyId);
    const stub = this.env.CHITTY_UPDATES.get(id);

    // Send update to Durable Object to broadcast to connected clients
    await stub.fetch(new Request('https://internal/update', {
      method: 'POST',
      body: JSON.stringify(update)
    }));
  }

  async createWebSocketConnection(chittyId?: string): Promise<Response> {
    // Create a unique ID for this connection
    const connectionId = chittyId || 'global';
    const id = this.env.CHITTY_UPDATES.idFromName(connectionId);
    const stub = this.env.CHITTY_UPDATES.get(id);

    // Create WebSocket connection
    const url = new URL('https://internal/websocket');
    if (chittyId) {
      url.searchParams.set('chittyId', chittyId);
    }

    return await stub.fetch(url, {
      headers: {
        'Upgrade': 'websocket'
      }
    });
  }
}