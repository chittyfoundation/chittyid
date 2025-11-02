/**
 * ChittyAuth Client for ChittyID
 * Validates API tokens via ChittyAuth service
 */

export class ChittyAuthClient {
  constructor(env) {
    this.env = env;
    this.baseUrl = env.CHITTYAUTH_URL || 'https://auth.chitty.cc';
    this.timeout = 5000; // 5 seconds
    this.cache = new Map(); // In-memory cache for validation results
    this.cacheTTL = 60000; // 1 minute cache
  }

  /**
   * Validate Bearer token with ChittyAuth
   */
  async validateToken(token) {
    if (!token) {
      return { valid: false, error: 'No token provided' };
    }

    // Remove 'Bearer ' prefix if present
    token = token.replace(/^Bearer\s+/i, '');

    // Check cache first
    const cached = this.getCached(token);
    if (cached) {
      return cached;
    }

    try {
      const response = await this.makeRequest('/v1/tokens/validate', {
        method: 'POST',
        body: JSON.stringify({ token })
      });

      if (!response.ok) {
        return {
          valid: false,
          error: `ChittyAuth validation failed: ${response.statusText}`
        };
      }

      const result = await response.json();

      // Cache the result
      if (result.valid) {
        this.setCached(token, result);
      }

      return result;

    } catch (error) {
      console.error('ChittyAuth client error:', error);
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Validate token and check for specific scope
   */
  async validateScope(token, requiredScope) {
    const validation = await this.validateToken(token);

    if (!validation.valid) {
      return { authorized: false, error: validation.error };
    }

    // Check if token has required scope
    const hasScope = validation.scope.includes(requiredScope) ||
                     validation.scope.includes('admin:*');

    if (!hasScope) {
      return {
        authorized: false,
        error: `Insufficient permissions. Required: ${requiredScope}`,
        available: validation.scope
      };
    }

    return {
      authorized: true,
      chittyId: validation.chittyId,
      scope: validation.scope,
      tokenId: validation.tokenId
    };
  }

  /**
   * Extract token from request headers
   */
  extractToken(request) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return null;
    }

    // Handle 'Bearer <token>' format
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    return match ? match[1] : authHeader;
  }

  /**
   * Middleware function to validate requests
   */
  async validateRequest(request, requiredScope = null) {
    const token = this.extractToken(request);

    if (!token) {
      return {
        authorized: false,
        error: 'Authorization header required',
        response: new Response(JSON.stringify({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'Authorization header required'
        }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        })
      };
    }

    // Validate with ChittyAuth
    let validation;
    if (requiredScope) {
      validation = await this.validateScope(token, requiredScope);
    } else {
      validation = await this.validateToken(token);
    }

    if (!validation.valid && !validation.authorized) {
      return {
        authorized: false,
        error: validation.error,
        response: new Response(JSON.stringify({
          success: false,
          error: 'UNAUTHORIZED',
          message: validation.error
        }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        })
      };
    }

    return {
      authorized: true,
      chittyId: validation.chittyId,
      scope: validation.scope,
      tokenId: validation.tokenId
    };
  }

  /**
   * Make HTTP request to ChittyAuth
   */
  async makeRequest(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;

    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'ChittyID/2.0',
      ...(options.headers || {})
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      return response;

    } catch (error) {
      clearTimeout(timeoutId);

      // If ChittyAuth is down, log error but don't crash
      console.error('ChittyAuth unreachable:', error.message);
      throw new Error('Authentication service temporarily unavailable');
    }
  }

  /**
   * Get cached validation result
   */
  getCached(token) {
    const cached = this.cache.get(token);
    if (!cached) {
      return null;
    }

    // Check if cache is still valid
    if (Date.now() - cached.timestamp > this.cacheTTL) {
      this.cache.delete(token);
      return null;
    }

    return cached.data;
  }

  /**
   * Set cached validation result
   */
  setCached(token, data) {
    this.cache.set(token, {
      data,
      timestamp: Date.now()
    });

    // Clean up old cache entries (simple LRU)
    if (this.cache.size > 1000) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  /**
   * Clear validation cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Health check for ChittyAuth
   */
  async healthCheck() {
    try {
      const response = await this.makeRequest('/health', {
        method: 'GET'
      });

      return {
        healthy: response.ok,
        status: response.status
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }
}
