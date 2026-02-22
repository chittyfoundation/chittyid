/**
 * ChittyID Pipeline Service
 * Orchestrates the complete flow: Router → Intake → Trust → Authorization → ID Service
 */

export class ChittyPipeline {
  constructor(env) {
    this.env = env;
    this.stages = {
      router: new RouterStage(env),
      intake: new IntakeStage(env),
      trust: new TrustStage(env),
      authorization: new AuthorizationStage(env),
      service: new ChittyIDServiceClient(env)
    };
  }

  /**
   * Process a ChittyID request through the complete pipeline
   * @param {Request} request - The incoming request
   * @param {string} purpose - The purpose of the ChittyID (work-item, document, person, etc.)
   * @returns {Promise<PipelineResult>} The pipeline result including ChittyID or error
   */
  async process(request, purpose = 'general') {
    const context = {
      request,
      purpose,
      metadata: {},
      timestamp: new Date().toISOString()
    };

    try {
      // Stage 1: Router - Determine context and route
      const routerResult = await this.stages.router.process(context);
      if (!routerResult.success) {
        return this.createErrorResult('ROUTER_FAILED', routerResult.error);
      }
      context.routing = routerResult.data;

      // Stage 2: Intake - Validate user and project registration
      const intakeResult = await this.stages.intake.process(context);
      if (!intakeResult.success) {
        return this.createErrorResult('INTAKE_FAILED', intakeResult.error);
      }
      context.registration = intakeResult.data;

      // Stage 3: Trust - Evaluate trust level
      const trustResult = await this.stages.trust.process(context);
      if (!trustResult.success) {
        return this.createErrorResult('TRUST_FAILED', trustResult.error);
      }
      context.trust = trustResult.data;

      // Stage 4: Authorization - Final authorization check
      const authResult = await this.stages.authorization.process(context);
      if (!authResult.success) {
        return this.createErrorResult('AUTH_FAILED', authResult.error);
      }
      context.authorization = authResult.data;

      // Stage 5: Get ChittyID from id.chitty.cc service
      const chittyId = await this.stages.service.getChittyID(context);

      // Store in KV with full context
      await this.storeChittyID(chittyId, context);

      return {
        success: true,
        chittyId,
        context: {
          purpose: context.purpose,
          trustLevel: context.trust.level,
          project: context.registration.project,
          timestamp: context.timestamp
        }
      };
    } catch (error) {
      return this.createErrorResult('PIPELINE_ERROR', error.message);
    }
  }

  async storeChittyID(chittyId, context) {
    const data = {
      chittyId,
      purpose: context.purpose,
      user: context.registration.user,
      project: context.registration.project,
      trustLevel: context.trust.level,
      createdAt: context.timestamp,
      routing: context.routing,
      authorization: context.authorization
    };

    await this.env.CHITTY_IDS?.put(chittyId, JSON.stringify(data));

    // Track in analytics
    this.env.CHITTY_ANALYTICS?.writeDataPoint({
      indexes: ['chittyid_created', context.purpose],
      blobs: [chittyId, context.registration.project.id],
      doubles: [Date.now(), context.trust.level]
    });
  }

  createErrorResult(code, message) {
    return {
      success: false,
      error: {
        code,
        message,
        timestamp: new Date().toISOString()
      }
    };
  }
}

/**
 * Router Stage - Determines request context and routing
 */
class RouterStage {
  constructor(env) {
    this.env = env;
  }

  async process(context) {
    try {
      const { request, purpose } = context;

      // Extract request metadata
      const userAgent = request.headers.get('User-Agent') || '';
      const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '';
      const authorization = request.headers.get('Authorization');

      // Determine routing based on purpose
      const route = this.determineRoute(purpose);

      return {
        success: true,
        data: {
          userAgent,
          ip,
          authorization,
          route,
          purpose,
          region: this.detectRegion(ip),
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // @canon: chittycanon://gov/governance#core-types
  determineRoute(purpose) {
    const routes = {
      'person': { type: 'P', priority: 'high' },
      'location': { type: 'L', priority: 'medium' },
      'thing': { type: 'T', priority: 'medium' },
      'event': { type: 'E', priority: 'high' },
      'authority': { type: 'A', priority: 'high' },
      'claude': { type: 'P', priority: 'high' },
      'context': { type: 'P', priority: 'high' },
      'work-item': { type: 'T', priority: 'low' },
      'document': { type: 'T', priority: 'low' },
      'general': { type: 'T', priority: 'low' }
    };

    return routes[purpose] || routes.general;
  }

  detectRegion(ip) {
    // In production, use Cloudflare's CF-IPCountry header
    // For now, default to North America
    return '1';
  }
}

/**
 * Intake Stage - Validates user and project registration
 */
class IntakeStage {
  constructor(env) {
    this.env = env;
  }

  async process(context) {
    try {
      const { authorization } = context.routing;

      if (!authorization) {
        return {
          success: false,
          error: 'Authorization required. Please authenticate first.'
        };
      }

      // Parse authorization token
      const token = authorization.replace('Bearer ', '');

      // Validate token and get user/project info
      const validation = await this.validateToken(token);
      if (!validation.valid) {
        return {
          success: false,
          error: 'Invalid or expired authorization token'
        };
      }

      // Get user and project details
      const user = await this.getUser(validation.userId);
      const project = await this.getProject(validation.projectId);

      if (!user || !project) {
        return {
          success: false,
          error: 'User or project not found. Please register first.'
        };
      }

      if (!project.active) {
        return {
          success: false,
          error: 'Project is not active. Please contact support.'
        };
      }

      return {
        success: true,
        data: {
          user: {
            id: user.id,
            region: user.region || '1',
            jurisdiction: user.jurisdiction || 'USA',
            verified: user.verified || false
          },
          project: {
            id: project.id,
            name: project.name,
            registered: true,
            tier: project.tier || 'basic'
          }
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async validateToken(token) {
    // Check token in KV cache
    const cached = await this.env.PLATFORM_CACHE?.get(`token:${token}`);
    if (cached) {
      return JSON.parse(cached);
    }

    // In production, validate against auth service
    // For now, mock validation
    const validation = {
      valid: true,
      userId: 'user_' + token.substring(0, 8),
      projectId: 'proj_' + token.substring(8, 16),
      expiresAt: new Date(Date.now() + 3600000).toISOString()
    };

    // Cache validation result
    await this.env.PLATFORM_CACHE?.put(
      `token:${token}`,
      JSON.stringify(validation),
      { expirationTtl: 3600 }
    );

    return validation;
  }

  async getUser(userId) {
    const cached = await this.env.MCP_SESSIONS?.get(`user:${userId}`);
    if (cached) {
      return JSON.parse(cached);
    }

    // Mock user data
    return {
      id: userId,
      region: '1',
      jurisdiction: 'USA',
      verified: true,
      createdAt: new Date().toISOString()
    };
  }

  async getProject(projectId) {
    const cached = await this.env.MCP_SESSIONS?.get(`project:${projectId}`);
    if (cached) {
      return JSON.parse(cached);
    }

    // Mock project data
    return {
      id: projectId,
      name: 'Default Project',
      active: true,
      tier: 'basic',
      createdAt: new Date().toISOString()
    };
  }
}

/**
 * Trust Stage - Evaluates trust level based on multiple factors
 */
class TrustStage {
  constructor(env) {
    this.env = env;
  }

  async process(context) {
    try {
      const { user, project } = context.registration;

      // Calculate trust score based on multiple factors
      let trustScore = 0;
      const factors = [];

      // User verification
      if (user.verified) {
        trustScore += 30;
        factors.push('user_verified');
      }

      // Project tier
      const tierScores = {
        'basic': 10,
        'standard': 20,
        'premium': 30,
        'enterprise': 40
      };
      trustScore += tierScores[project.tier] || 10;
      factors.push(`project_tier_${project.tier}`);

      // History check (would check actual history in production)
      const history = await this.checkHistory(user.id, project.id);
      trustScore += history.score;
      factors.push(...history.factors);

      // Map score to trust level
      const trustLevel = this.mapScoreToLevel(trustScore);

      return {
        success: true,
        data: {
          level: trustLevel,
          score: trustScore,
          factors,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async checkHistory(userId, projectId) {
    // Check user/project history in KV
    const historyKey = `history:${userId}:${projectId}`;
    const history = await this.env.CHITTY_IDS?.get(historyKey);

    if (history) {
      const data = JSON.parse(history);
      return {
        score: Math.min(data.count * 5, 30), // Max 30 points from history
        factors: [`history_count_${data.count}`]
      };
    }

    return { score: 0, factors: ['no_history'] };
  }

  mapScoreToLevel(score) {
    if (score >= 80) return '5'; // L5 - Official
    if (score >= 65) return '4'; // L4 - Premium
    if (score >= 50) return '3'; // L3 - Verified
    if (score >= 35) return '2'; // L2 - Standard
    if (score >= 20) return '1'; // L1 - Basic
    return '0'; // L0 - Unverified
  }
}

/**
 * Authorization Stage - Final authorization check
 */
class AuthorizationStage {
  constructor(env) {
    this.env = env;
  }

  async process(context) {
    try {
      const { trust, registration, purpose } = context;

      // Check if trust level is sufficient for purpose
      const requiredLevel = this.getRequiredLevel(purpose);
      if (parseInt(trust.level) < requiredLevel) {
        return {
          success: false,
          error: `Insufficient trust level. Required: L${requiredLevel}, Current: L${trust.level}`
        };
      }

      // Check rate limits
      const rateLimitOk = await this.checkRateLimit(registration.user.id, registration.project.id);
      if (!rateLimitOk) {
        return {
          success: false,
          error: 'Rate limit exceeded. Please try again later.'
        };
      }

      // All checks passed
      return {
        success: true,
        data: {
          authorized: true,
          trustLevel: trust.level,
          requiredLevel,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  getRequiredLevel(purpose) {
    const requirements = {
      'person': 3,      // L3 - Verified
      'location': 2,    // L2 - Standard
      'thing': 1,       // L1 - Basic
      'event': 2,       // L2 - Standard
      'authority': 4,   // L4 - Premium
      'claude': 3,      // L3 - Verified
      'context': 3,     // L3 - Verified
      'work-item': 1,   // L1 - Basic
      'document': 1,    // L1 - Basic
      'general': 0      // L0 - Unverified
    };

    return requirements[purpose] || 0;
  }

  async checkRateLimit(userId, projectId) {
    const key = `ratelimit:${userId}:${projectId}:${Math.floor(Date.now() / 60000)}`;
    const count = await this.env.CHITTY_IDS?.get(key);

    if (count && parseInt(count) >= 10) {
      return false; // Rate limit exceeded (10 per minute)
    }

    await this.env.CHITTY_IDS?.put(key, String((parseInt(count) || 0) + 1), {
      expirationTtl: 60 // Expire after 1 minute
    });

    return true;
  }
}

/**
 * ChittyID Service Client - Communicates with id.chitty.cc service
 */
class ChittyIDServiceClient {
  constructor(env) {
    this.env = env;
    this.serviceUrl = 'https://id.chitty.cc';
  }

  async getChittyID(context) {
    const { registration, trust, routing, purpose } = context;

    // Prepare request to id.chitty.cc service
    const serviceRequest = {
      region: registration.user.region,
      jurisdiction: registration.user.jurisdiction,
      entityType: routing.route.type,
      trustLevel: trust.level,
      metadata: {
        purpose,
        project: registration.project.id,
        user: registration.user.id,
        factors: trust.factors
      }
    };

    try {
      // Call the actual id.chitty.cc service
      const response = await fetch(`${this.serviceUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ChittyOS-Token': this.env.CHITTYOS_SERVICE_TOKEN || 'dev-token'
        },
        body: JSON.stringify(serviceRequest)
      });

      if (!response.ok) {
        throw new Error(`Service error: ${response.status}`);
      }

      const data = await response.json();
      return data.chittyId;
    } catch (error) {
      // Fallback to local generation for development
      console.error('Service call failed, using local generation:', error);
      return this.generateLocalChittyID(serviceRequest);
    }
  }

  generateLocalChittyID(request) {
    // Local generation for development/fallback
    const version = '03';
    const yearMonth = new Date().toISOString().slice(2, 7).replace('-', '');
    const sequential = Math.floor(Math.random() * 9999).toString().padStart(4, '0');

    const baseId = [
      version,
      request.region,
      request.jurisdiction,
      sequential,
      request.entityType,
      yearMonth,
      request.trustLevel
    ].join('-');

    const checksum = this.calculateChecksum(baseId);

    return `${baseId}-${checksum}`;
  }

  calculateChecksum(baseId) {
    // Simple mod-97 checksum
    const clean = baseId.replace(/-/g, '');
    let sum = 0;
    for (let i = 0; i < clean.length; i++) {
      sum += clean.charCodeAt(i);
    }
    return (sum % 97).toString().padStart(2, '0');
  }
}

export default ChittyPipeline;