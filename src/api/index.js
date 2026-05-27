/**
 * ChittyID API - Refactored with Pipeline Architecture
 */

import { ChittyPipeline } from '../pipeline/index.js';
import { ValidationService } from '../services/validation.js';
import { SearchService } from '../services/search.js';
import { SecretService } from '../services/secret.js';

export class ChittyAPI {
  constructor(env) {
    this.env = env;
    this.pipeline = new ChittyPipeline(env);
    this.validation = new ValidationService(env);
    this.search = new SearchService(env);
    this.secret = new SecretService(env);
  }

  /**
   * Main request handler
   */
  async handleRequest(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS headers
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Content-Type': 'application/json'
    };

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    try {
      // Route to appropriate handler
      const route = this.matchRoute(path, method);

      if (!route) {
        return this.errorResponse('Endpoint not found', 404, headers);
      }

      const result = await route.handler(request, url);
      return new Response(JSON.stringify(result), { headers });

    } catch (error) {
      console.error('API Error:', error);
      return this.errorResponse(error.message, 500, headers);
    }
  }

  /**
   * Route matching
   */
  matchRoute(path, method) {
    const routes = [
      // Pipeline endpoint - Generate ChittyID
      {
        pattern: /^\/api\/get-chittyid$/,
        method: 'GET',
        handler: async (request, url) => {
          const purpose = url.searchParams.get('for') || 'general';
          const entityTypeOverride = url.searchParams.get('entity_type') || null;
          return await this.pipeline.process(request, purpose, entityTypeOverride);
        }
      },

      // Direct endpoints - No pipeline needed
      {
        pattern: /^\/api\/validate$/,
        method: 'POST',
        handler: async (request) => {
          const { id, context } = await request.json();
          return await this.validation.validate(id, context);
        }
      },

      {
        pattern: /^\/api\/info\/(.+)$/,
        method: 'GET',
        handler: async (request, url) => {
          const match = path.match(/^\/api\/info\/(.+)$/);
          const chittyId = match[1];
          return await this.validation.getInfo(chittyId);
        }
      },

      {
        pattern: /^\/api\/search$/,
        method: 'POST',
        handler: async (request) => {
          const { query, limit = 10 } = await request.json();
          return await this.search.search(query, limit);
        }
      },

      {
        pattern: /^\/api\/secret\/generate$/,
        method: 'POST',
        handler: async (request) => {
          const params = await request.json();
          return await this.secret.generate(params);
        }
      },

      {
        pattern: /^\/api\/secret\/validate$/,
        method: 'POST',
        handler: async (request) => {
          const { secret } = await request.json();
          return await this.secret.validate(secret);
        }
      },

      {
        pattern: /^\/api\/secret\/revoke$/,
        method: 'POST',
        handler: async (request) => {
          const { secret } = await request.json();
          return await this.secret.revoke(secret);
        }
      },

      // Specification endpoint
      {
        pattern: /^\/api\/spec$/,
        method: 'GET',
        handler: async () => {
          return this.getSpecification();
        }
      },

      // Health check
      {
        pattern: /^\/api\/health$/,
        method: 'GET',
        handler: async () => {
          return {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            services: {
              pipeline: true,
              validation: true,
              search: true,
              secrets: true
            }
          };
        }
      },

      // Root endpoint
      {
        pattern: /^\/$/,
        method: 'GET',
        handler: async () => {
          return {
            name: 'ChittyID Mothership API',
            version: '2.0.0',
            description: 'ChittyID management system for IDs from id.chitty.cc',
            endpoints: {
              pipeline: [
                'GET /api/get-chittyid?for={purpose} - Get ChittyID through pipeline'
              ],
              direct: [
                'POST /api/validate - Validate existing ChittyID',
                'GET /api/info/{id} - Get ChittyID information',
                'POST /api/search - Search ChittyIDs',
                'POST /api/secret/generate - Generate API secret',
                'POST /api/secret/validate - Validate API secret',
                'POST /api/secret/revoke - Revoke API secret',
                'GET /api/spec - Get format specification',
                'GET /api/health - Health check'
              ]
            },
            authentication: 'Required for pipeline endpoints via Authorization header',
            documentation: 'https://github.com/chittyfoundation/chittyid'
          };
        }
      }
    ];

    // Find matching route
    for (const route of routes) {
      if (route.pattern.test(path) && route.method === method) {
        return route;
      }
    }

    return null;
  }

  /**
   * Get ChittyID specification
   */
  getSpecification() {
    return {
      format: 'VV-G-LLL-SSSS-T-YYMM-C-XX',
      components: {
        VV: {
          name: 'Version',
          length: 2,
          values: {
            '01': 'Deprecated',
            '02': 'Legacy',
            '03': 'Current',
            '04': 'Beta',
            '05': 'Experimental'
          }
        },
        G: {
          name: 'Geographic Region',
          length: 1,
          values: {
            '1': 'North America',
            '2': 'South America',
            '3': 'Europe',
            '4': 'Asia',
            '5': 'Africa',
            '6': 'Oceania',
            '7': 'Antarctica',
            '8': 'International Waters',
            '9': 'Digital/Virtual'
          }
        },
        LLL: {
          name: 'Legal Jurisdiction',
          length: 3,
          format: 'ISO 3166-1 alpha-3',
          examples: ['USA', 'CAN', 'GBR', 'DEU', 'JPN']
        },
        SSSS: {
          name: 'Sequential ID',
          length: 4,
          range: '0001-9999'
        },
        T: {
          name: 'Entity Type',
          length: 1,
          values: {
            'P': 'Person',
            'L': 'Location',
            'T': 'Thing',
            'E': 'Event',
            'A': 'Authority'
          }
        },
        YM: {
          name: 'Year-Month',
          length: '2-4',
          format: 'YYMM or YMM'
        },
        C: {
          name: 'Trust Level',
          length: 1,
          values: {
            '0': 'L0 - Unverified',
            '1': 'L1 - Basic',
            '2': 'L2 - Standard',
            '3': 'L3 - Verified',
            '4': 'L4 - Premium',
            '5': 'L5 - Official'
          }
        },
        X: {
          name: 'Checksum',
          length: 2,
          algorithm: 'Mod-97'
        }
      },
      pipeline: {
        description: 'All ChittyID generation goes through mandatory pipeline',
        stages: [
          'Router - Request context determination',
          'Intake - User/project validation',
          'Trust - Trust level evaluation',
          'Authorization - Permission verification',
          'Generation - ID creation via id.chitty.cc'
        ]
      }
    };
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