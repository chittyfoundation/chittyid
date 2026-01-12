/**
 * ChittyID MCP Module for Gateway Aggregation
 *
 * This module exports MCP tools that are aggregated into mcp.chitty.cc/id/*
 * Part of the ChittyCanon gateway pattern.
 *
 * @module mcp-id
 * @see https://mcp.chitty.cc/id
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';

// Import core from api-id
import { ChittyIDCore } from '../api-id/index';

interface Env {
  CHITTYID_KV?: KVNamespace;
}

interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// MCP Tool Definitions
const tools: MCPTool[] = [
  {
    name: 'chittyid_generate',
    description: 'Generate a new ChittyID universal identifier',
    inputSchema: {
      type: 'object',
      properties: {
        region: {
          type: 'string',
          description: 'Geographic region code (1-9)',
          enum: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
        },
        jurisdiction: {
          type: 'string',
          description: 'ISO 3166-1 alpha-3 country code (e.g., USA, GBR, DEU)',
          pattern: '^[A-Z]{3}$',
        },
        entityType: {
          type: 'string',
          description: 'Entity type: P=Person, L=Legal entity, T=Thing, M=Machine',
          enum: ['P', 'L', 'T', 'M'],
        },
        trustLevel: {
          type: 'string',
          description: 'Initial trust level (0=Unverified to 5=Official)',
          enum: ['0', '1', '2', '3', '4', '5'],
        },
      },
      required: ['jurisdiction', 'entityType'],
    },
  },
  {
    name: 'chittyid_validate',
    description: 'Validate a ChittyID and extract its components',
    inputSchema: {
      type: 'object',
      properties: {
        chittyId: {
          type: 'string',
          description: 'The ChittyID to validate (format: VV-G-LLL-SSSS-T-YM-C-X)',
        },
      },
      required: ['chittyId'],
    },
  },
  {
    name: 'chittyid_info',
    description: 'Get detailed information about a ChittyID including metadata',
    inputSchema: {
      type: 'object',
      properties: {
        chittyId: {
          type: 'string',
          description: 'The ChittyID to look up',
        },
      },
      required: ['chittyId'],
    },
  },
  {
    name: 'chittyid_spec',
    description: 'Get the ChittyID format specification',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// Create Hono app for MCP gateway
const app = new Hono<{ Bindings: Env }>();
const core = new ChittyIDCore();

// CORS middleware
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Health check
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    service: 'mcp-chittyid',
    version: '1.0.0',
    tools: tools.length,
    timestamp: new Date().toISOString(),
  });
});

// MCP Tools listing
app.get('/tools', (c) => {
  return c.json({
    tools,
    service: 'chittyid',
    version: '1.0.0',
  });
});

// SSE endpoint for MCP transport
app.get('/sse', async (c) => {
  return streamSSE(c, async (stream) => {
    // Send initial connection message
    await stream.writeSSE({
      event: 'open',
      data: JSON.stringify({
        service: 'mcp-chittyid',
        version: '1.0.0',
        tools: tools.map(t => t.name),
      }),
    });

    // Keep connection alive
    const keepAlive = setInterval(async () => {
      await stream.writeSSE({
        event: 'ping',
        data: JSON.stringify({ timestamp: new Date().toISOString() }),
      });
    }, 30000);

    // Clean up on close
    stream.onAbort(() => {
      clearInterval(keepAlive);
    });
  });
});

// MCP JSON-RPC message handler
app.post('/message', async (c) => {
  const request = await c.req.json<MCPRequest>();

  const response: MCPResponse = {
    jsonrpc: '2.0',
    id: request.id,
  };

  try {
    switch (request.method) {
      case 'initialize':
        response.result = {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: 'mcp-chittyid',
            version: '1.0.0',
          },
        };
        break;

      case 'tools/list':
        response.result = { tools };
        break;

      case 'tools/call': {
        const params = request.params as { name: string; arguments?: Record<string, unknown> };
        const toolName = params?.name;
        const args = params?.arguments || {};

        switch (toolName) {
          case 'chittyid_generate': {
            const region = (args.region as string) || '1';
            const jurisdiction = (args.jurisdiction as string) || 'USA';
            const entityType = (args.entityType as string) || 'T';
            const trustLevel = (args.trustLevel as string) || '0';

            const chittyId = await core.generate(
              region,
              jurisdiction.toUpperCase(),
              entityType.toUpperCase(),
              trustLevel,
              c.env
            );

            response.result = {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  chittyId,
                  components: { region, jurisdiction: jurisdiction.toUpperCase(), entityType: entityType.toUpperCase(), trustLevel },
                }, null, 2),
              }],
            };
            break;
          }

          case 'chittyid_validate': {
            const chittyId = args.chittyId as string;
            const result = core.validate(chittyId);

            response.result = {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: result.valid,
                  ...result,
                }, null, 2),
              }],
            };
            break;
          }

          case 'chittyid_info': {
            const chittyId = args.chittyId as string;
            const result = core.validate(chittyId);

            response.result = {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: result.valid,
                  chittyId,
                  ...result,
                }, null, 2),
              }],
            };
            break;
          }

          case 'chittyid_spec': {
            response.result = {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  format: 'VV-G-LLL-SSSS-T-YM-C-X',
                  totalLength: 32,
                  components: {
                    VV: 'Version (2 digits)',
                    G: 'Geographic region (1-9)',
                    LLL: 'Legal jurisdiction (ISO 3166-1 alpha-3)',
                    SSSS: 'Sequential ID (4 digits)',
                    T: 'Entity type (P/L/T/M)',
                    YM: 'Year-Month (Base36)',
                    C: 'Checksum (Luhn mod 36)',
                    X: 'Extension',
                  },
                  entityTypes: {
                    P: 'Person (natural person)',
                    L: 'Legal entity (organization)',
                    T: 'Thing (device, asset)',
                    M: 'Machine (service, AI agent)',
                  },
                }, null, 2),
              }],
            };
            break;
          }

          default:
            response.error = {
              code: -32601,
              message: `Unknown tool: ${toolName}`,
            };
        }
        break;
      }

      default:
        response.error = {
          code: -32601,
          message: `Method not found: ${request.method}`,
        };
    }
  } catch (error) {
    response.error = {
      code: -32603,
      message: error instanceof Error ? error.message : 'Internal error',
    };
  }

  return c.json(response);
});

export default app;
export { tools };
