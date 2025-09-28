/**
 * API Migration Handler
 * Handles transition from old API structure to new refactored pipeline system
 */

export class APIMigration {
  constructor(env) {
    this.env = env;
    this.legacyRoutes = new Set([
      '/api/generate',
      '/api/get-chittyid'
    ]);
  }

  /**
   * Handle legacy API requests and route to new system
   */
  async handleLegacyRequest(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Check if this is a legacy route
    if (!this.isLegacyRoute(path)) {
      return null; // Not a legacy route, handle normally
    }

    // Transform legacy request to new format
    const transformedRequest = await this.transformRequest(request);

    // Route to new pipeline system
    const { ChittyAPI } = await import('../api/index.js');
    const api = new ChittyAPI(this.env);

    return await api.handleRequest(transformedRequest);
  }

  /**
   * Check if route is legacy
   */
  isLegacyRoute(path) {
    return this.legacyRoutes.has(path);
  }

  /**
   * Transform legacy request to new format
   */
  async transformRequest(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle specific legacy transformations
    switch (path) {
      case '/api/generate':
        // Old generate endpoint -> new get-chittyid
        url.pathname = '/api/get-chittyid';

        // Transform parameters
        if (request.method === 'POST') {
          // Convert POST with body to GET with query params
          const body = await request.json();

          if (body.entityType) {
            const typeMap = {
              'ChittyPerson': 'person',
              'ChittyLocation': 'location',
              'ChittyThing': 'thing',
              'ChittyEvent': 'event'
            };
            url.searchParams.set('for', typeMap[body.entityType] || 'general');
          }

          // Create new GET request
          return new Request(url.toString(), {
            method: 'GET',
            headers: {
              ...Object.fromEntries(request.headers.entries()),
              'X-Legacy-Migration': 'true',
              'X-Original-Method': 'POST'
            }
          });
        }
        break;

      case '/api/get-chittyid':
        // Already in new format, just add migration header
        return new Request(request, {
          headers: {
            ...Object.fromEntries(request.headers.entries()),
            'X-Legacy-Compatible': 'true'
          }
        });
    }

    return request;
  }

  /**
   * Transform legacy response format
   */
  transformResponse(response, originalRequest) {
    const url = new URL(originalRequest.url);

    // Add deprecation headers
    const headers = new Headers(response.headers);
    headers.set('X-API-Version', 'v2.0');
    headers.set('X-Legacy-Support', 'deprecated');
    headers.set('X-Migration-Notice', 'This endpoint is deprecated. Use /api/get-chittyid');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  /**
   * Get migration status
   */
  async getMigrationStatus() {
    const stats = {
      legacyRequestsToday: 0,
      totalRequests: 0,
      migrationPercentage: 0
    };

    try {
      // Get today's request stats from analytics
      const today = new Date().toISOString().slice(0, 10);
      const statsKey = `migration:stats:${today}`;
      const data = await this.env.CHITTY_ANALYTICS?.get(statsKey);

      if (data) {
        Object.assign(stats, JSON.parse(data));
      }
    } catch (error) {
      console.error('Failed to get migration stats:', error);
    }

    return {
      ...stats,
      legacyRoutes: Array.from(this.legacyRoutes),
      migrationComplete: stats.migrationPercentage >= 95,
      recommendedActions: this.getRecommendations(stats)
    };
  }

  /**
   * Get migration recommendations
   */
  getRecommendations(stats) {
    const recommendations = [];

    if (stats.legacyRequestsToday > 100) {
      recommendations.push('High legacy API usage detected. Consider client migration.');
    }

    if (stats.migrationPercentage < 50) {
      recommendations.push('Less than 50% migrated. Increase migration communications.');
    }

    if (stats.migrationPercentage >= 95) {
      recommendations.push('Migration nearly complete. Consider deprecation timeline.');
    }

    return recommendations;
  }

  /**
   * Log migration metrics
   */
  async logMigrationMetric(requestType, isLegacy) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const statsKey = `migration:stats:${today}`;

      // Get current stats
      const data = await this.env.CHITTY_ANALYTICS?.get(statsKey);
      const stats = data ? JSON.parse(data) : {
        legacyRequestsToday: 0,
        totalRequests: 0,
        migrationPercentage: 0
      };

      // Update stats
      stats.totalRequests++;
      if (isLegacy) {
        stats.legacyRequestsToday++;
      }

      stats.migrationPercentage = stats.totalRequests > 0
        ? ((stats.totalRequests - stats.legacyRequestsToday) / stats.totalRequests) * 100
        : 0;

      // Store updated stats
      await this.env.CHITTY_ANALYTICS?.put(statsKey, JSON.stringify(stats), {
        expirationTtl: 86400 * 7 // Keep for 7 days
      });

    } catch (error) {
      console.error('Failed to log migration metric:', error);
    }
  }
}