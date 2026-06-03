/**
 * Pipeline Enforcement Middleware
 * Ensures all ChittyID generation goes through the mandatory pipeline
 */

export class PipelineEnforcer {
  constructor(env) {
    this.env = env;
    this.blockedPaths = [
      '/api/generate',           // Legacy endpoint - completely blocked
      '/api/create',             // Direct creation - blocked
      '/api/create-id',          // Direct creation variant - blocked
      '/api/mint',               // Direct minting - blocked
      '/api/issue',              // Direct issuing - blocked
      '/direct/',                // Any direct access
      '/bypass/',                // Any bypass attempts
    ];

    this.allowedDirectPaths = [
      '/api/validate',           // Public validation allowed
      '/api/info/',              // Info retrieval allowed
      '/api/search',             // Search allowed
      '/api/spec',               // Specification allowed
      '/api/health',             // Health checks allowed
      '/bridges/',               // Bridge endpoints allowed
      '/webhooks/',              // Webhook endpoints allowed
    ];

    this.pipelineRequiredPaths = [
      '/api/get-chittyid',       // MUST go through pipeline
      '/api/request-id',         // MUST go through pipeline
      '/api/chittyid',           // MUST go through pipeline
    ];
  }

  /**
   * Enforce pipeline for all requests
   */
  async enforce(request, next) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Check for completely blocked legacy endpoints
    const isBlocked = this.blockedPaths.some(blocked =>
      path.startsWith(blocked) || path.includes(blocked)
    );

    if (isBlocked) {
      return this.createPipelineRequiredResponse(path, 'LEGACY_ENDPOINT_BLOCKED');
    }

    // Check if this is a pipeline-required endpoint
    const requiresPipeline = this.pipelineRequiredPaths.some(required =>
      path.startsWith(required)
    );

    if (requiresPipeline) {
      return this.enforcePipelineFlow(request, next);
    }

    // Check if this is an allowed direct endpoint
    const isAllowedDirect = this.allowedDirectPaths.some(allowed =>
      path.startsWith(allowed)
    );

    if (isAllowedDirect) {
      // Add pipeline enforcement headers even for allowed endpoints
      const response = await next(request);
      return this.addEnforcementHeaders(response);
    }

    // Default: require pipeline for any unrecognized endpoint
    return this.enforcePipelineFlow(request, next);
  }

  /**
   * Enforce pipeline flow for ChittyID generation
   */
  async enforcePipelineFlow(request, next) {
    try {
      // Check for pipeline session token
      const pipelineToken = request.headers.get('X-Pipeline-Token');
      const sessionId = request.headers.get('X-Session-ID');
      const authToken = request.headers.get('Authorization');

      // CRITICAL: No token = immediate rejection
      if (!authToken) {
        return this.createPipelineRequiredResponse(
          request.url,
          'MISSING_AUTH_TOKEN'
        );
      }

      // Check if request has valid pipeline context
      const pipelineContext = await this.validatePipelineContext(
        pipelineToken,
        sessionId,
        authToken
      );

      if (!pipelineContext.valid) {
        return this.createPipelineRequiredResponse(
          request.url,
          pipelineContext.reason,
          pipelineContext.missingStages
        );
      }

      // Valid pipeline context - allow through
      const response = await next(request);
      return this.addPipelineTrackingHeaders(response, pipelineContext);

    } catch (error) {
      console.error('Pipeline enforcement error:', error);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'PIPELINE_ENFORCEMENT_ERROR',
          message: 'Internal error during pipeline enforcement',
          timestamp: new Date().toISOString()
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'X-Pipeline-Required': 'true',
            'X-ChittyOS-Service': 'chittyid'
          }
        }
      );
    }
  }

  /**
   * Validate pipeline context
   */
  async validatePipelineContext(pipelineToken, sessionId, authToken) {
    // Check for pipeline session
    if (!sessionId) {
      return {
        valid: false,
        reason: 'MISSING_SESSION_ID'
      };
    }

    // Validate session exists and has pipeline context
    const sessionData = await this.env.MCP_SESSIONS.get(`session:${sessionId}`);
    if (!sessionData) {
      return {
        valid: false,
        reason: 'INVALID_SESSION'
      };
    }

    const session = JSON.parse(sessionData);

    // Check if session has completed pipeline stages
    const requiredStages = ['router', 'intake', 'trust', 'authorization'];
    const completedStages = session.pipeline?.completedStages || [];

    const missingStages = requiredStages.filter(stage =>
      !completedStages.includes(stage)
    );

    if (missingStages.length > 0) {
      return {
        valid: false,
        reason: 'INCOMPLETE_PIPELINE',
        missingStages
      };
    }

    // Validate pipeline token matches session
    if (pipelineToken !== session.pipeline?.token) {
      return {
        valid: false,
        reason: 'INVALID_PIPELINE_TOKEN'
      };
    }

    // Check token expiry
    const tokenExpiry = session.pipeline?.tokenExpiry;
    if (tokenExpiry && new Date(tokenExpiry) < new Date()) {
      return {
        valid: false,
        reason: 'EXPIRED_PIPELINE_TOKEN'
      };
    }

    // Validate auth token
    const authValid = await this.validateAuthToken(authToken, session);
    if (!authValid.valid) {
      return authValid;
    }

    return {
      valid: true,
      session,
      stages: completedStages,
      trustLevel: session.pipeline?.trustLevel || 0
    };
  }

  /**
   * Validate authentication token
   */
  async validateAuthToken(authToken, session) {
    const startTime = Date.now();
    try {
      // Extract token from Bearer header
      const token = authToken.replace('Bearer ', '');

      // Check token in auth cache
      const authData = await this.env.PLATFORM_CACHE.get(`auth:${token}`);

      // Consistent timing - ensure minimum 100ms processing time
      const elapsed = Date.now() - startTime;
      if (elapsed < 100) {
        await new Promise(resolve => setTimeout(resolve, 100 - elapsed));
      }

      if (!authData) {
        return {
          valid: false,
          reason: 'INVALID_AUTH_TOKEN'
        };
      }

      const auth = JSON.parse(authData);

      // Validate token belongs to session user
      if (auth.userId !== session.userId) {
        return {
          valid: false,
          reason: 'AUTH_TOKEN_USER_MISMATCH'
        };
      }

      // Check token expiry
      if (auth.expiresAt && new Date(auth.expiresAt) < new Date()) {
        return {
          valid: false,
          reason: 'EXPIRED_AUTH_TOKEN'
        };
      }

      return { valid: true, auth };

    } catch (error) {
      // Ensure consistent timing even for errors
      const elapsed = Date.now() - startTime;
      if (elapsed < 100) {
        await new Promise(resolve => setTimeout(resolve, 100 - elapsed));
      }

      return {
        valid: false,
        reason: 'AUTH_TOKEN_VALIDATION_ERROR'
      };
    }
  }

  /**
   * Create pipeline required response
   */
  createPipelineRequiredResponse(requestUrl, reason, missingStages = null) {
    const errorResponses = {
      'LEGACY_ENDPOINT_BLOCKED': {
        status: 410,
        title: 'Legacy Endpoint Removed',
        message: 'This endpoint has been permanently removed. Use the pipeline instead.',
        action: 'Use GET /api/get-chittyid with proper authentication'
      },
      'MISSING_AUTH_TOKEN': {
        status: 401,
        title: 'Authentication Required',
        message: 'ChittyID generation requires authentication through the pipeline.',
        action: 'Provide Authorization header with valid token'
      },
      'MISSING_SESSION_ID': {
        status: 400,
        title: 'Session Required',
        message: 'ChittyID generation requires an active session.',
        action: 'Initialize session with POST /api/session/init'
      },
      'INVALID_SESSION': {
        status: 401,
        title: 'Invalid Session',
        message: 'The provided session ID is invalid or expired.',
        action: 'Initialize new session with POST /api/session/init'
      },
      'INCOMPLETE_PIPELINE': {
        status: 403,
        title: 'Pipeline Not Completed',
        message: 'All pipeline stages must be completed before ChittyID generation.',
        action: 'Complete pipeline: Router → Intake → Trust → Authorization → Generation'
      },
      'INVALID_PIPELINE_TOKEN': {
        status: 403,
        title: 'Invalid Pipeline Token',
        message: 'The pipeline token is invalid or does not match the session.',
        action: 'Restart pipeline process with valid session'
      },
      'EXPIRED_PIPELINE_TOKEN': {
        status: 403,
        title: 'Pipeline Token Expired',
        message: 'The pipeline token has expired.',
        action: 'Restart pipeline process'
      }
    };

    const errorResponse = errorResponses[reason] || {
      status: 403,
      title: 'Pipeline Required',
      message: 'This operation requires completion of the ChittyID pipeline.',
      action: 'Follow proper pipeline: Router → Intake → Trust → Authorization → Generation'
    };

    const responseBody = {
      success: false,
      error: 'PIPELINE_REQUIRED',
      reason,
      ...errorResponse,
      pipeline: {
        required: true,
        stages: ['router', 'intake', 'trust', 'authorization', 'generation'],
        documentation: 'https://docs.chitty.cc/pipeline'
      },
      enforcement: {
        level: 'MANDATORY',
        bypassable: false,
        enforcedAt: new Date().toISOString()
      },
      requestUrl
    };

    // Add missingStages for INCOMPLETE_PIPELINE errors
    if (reason === 'INCOMPLETE_PIPELINE' && missingStages) {
      responseBody.missingStages = missingStages;
    }

    return new Response(
      JSON.stringify(responseBody),
      {
        status: errorResponse.status,
        headers: {
          'Content-Type': 'application/json',
          'X-Pipeline-Required': 'true',
          'X-Pipeline-Enforcement': 'MANDATORY',
          'X-ChittyOS-Service': 'chittyid',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Expose-Headers': 'X-Pipeline-Required,X-Pipeline-Enforcement'
        }
      }
    );
  }

  /**
   * Add enforcement headers to allowed responses
   */
  addEnforcementHeaders(response) {
    const headers = new Headers(response.headers);
    headers.set('X-Pipeline-Enforcement', 'ACTIVE');
    headers.set('X-ChittyOS-Service', 'chittyid');
    headers.set('X-Pipeline-Info', 'Generation requires pipeline completion');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  /**
   * Add pipeline tracking headers
   */
  addPipelineTrackingHeaders(response, pipelineContext) {
    const headers = new Headers(response.headers);
    headers.set('X-Pipeline-Completed', 'true');
    headers.set('X-Pipeline-Stages', pipelineContext.stages.join(','));
    headers.set('X-Pipeline-Trust-Level', pipelineContext.trustLevel.toString());
    headers.set('X-ChittyOS-Service', 'chittyid');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  /**
   * Block attempt logging for security monitoring
   */
  async logBlockedAttempt(request, reason) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      url: request.url,
      method: request.method,
      reason,
      ip: request.headers.get('CF-Connecting-IP'),
      userAgent: request.headers.get('User-Agent'),
      referer: request.headers.get('Referer')
    };

    // Store in security logs
    await this.env.PLATFORM_CACHE.put(
      `security:blocked:${Date.now()}`,
      JSON.stringify(logEntry),
      { expirationTtl: 86400 * 7 } // Keep for 7 days
    );

    // Increment blocked attempts counter
    const counterKey = `metrics:blocked:${reason}`;
    const current = await this.env.PLATFORM_CACHE.get(counterKey);
    const count = current ? parseInt(current) + 1 : 1;

    await this.env.PLATFORM_CACHE.put(
      counterKey,
      count.toString(),
      { expirationTtl: 86400 }
    );
  }
}

/**
 * Middleware factory for pipeline enforcement
 */
export function createPipelineEnforcer(env) {
  const enforcer = new PipelineEnforcer(env);

  return async (request, next) => {
    return enforcer.enforce(request, next);
  };
}