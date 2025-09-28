/**
 * ChittyID Pipeline Architecture
 * All ChittyID generation must go through this pipeline
 */

export class ChittyPipeline {
  constructor(env) {
    this.env = env;
    this.stages = {
      router: new RouterStage(env),
      intake: new IntakeStage(env),
      trust: new TrustStage(env),
      authorization: new AuthorizationStage(env),
      generation: new GenerationStage(env)
    };
  }

  /**
   * Process ChittyID request through complete pipeline
   * @param {Request} request - Incoming HTTP request
   * @param {string} purpose - Purpose of ID request (e.g., 'work-item', 'document')
   * @returns {Promise<PipelineResult>}
   */
  async process(request, purpose = 'general') {
    const context = {
      request,
      purpose,
      timestamp: new Date().toISOString(),
      stages: {}
    };

    try {
      // Stage 1: Router - Determine context and validate request
      context.stages.router = await this.stages.router.process(context);
      if (!context.stages.router.success) {
        return this.createFailureResponse('router', context.stages.router.error);
      }

      // Stage 2: Intake - Validate user/project registration
      context.stages.intake = await this.stages.intake.process(context);
      if (!context.stages.intake.success) {
        return this.createFailureResponse('intake', context.stages.intake.error);
      }

      // Stage 3: Trust - Evaluate trust level
      context.stages.trust = await this.stages.trust.process(context);
      if (!context.stages.trust.success) {
        return this.createFailureResponse('trust', context.stages.trust.error);
      }

      // Stage 4: Authorization - Final authorization check
      context.stages.authorization = await this.stages.authorization.process(context);
      if (!context.stages.authorization.success) {
        return this.createFailureResponse('authorization', context.stages.authorization.error);
      }

      // Stage 5: Generation - Request ID from id.chitty.cc service
      context.stages.generation = await this.stages.generation.process(context);
      if (!context.stages.generation.success) {
        return this.createFailureResponse('generation', context.stages.generation.error);
      }

      // Success - Return generated ChittyID
      return {
        success: true,
        chittyId: context.stages.generation.chittyId,
        metadata: {
          pipeline: 'complete',
          stages: Object.keys(context.stages).map(stage => ({
            name: stage,
            success: context.stages[stage].success
          })),
          context: {
            user: context.stages.intake.user,
            project: context.stages.intake.project,
            trustLevel: context.stages.trust.trustLevel,
            purpose
          },
          timestamp: context.timestamp
        }
      };
    } catch (error) {
      return this.createFailureResponse('pipeline', error.message);
    }
  }

  createFailureResponse(stage, error) {
    return {
      success: false,
      error: `Pipeline failed at ${stage} stage: ${error}`,
      stage,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Router Stage - Determines context and routing
 */
class RouterStage {
  constructor(env) {
    this.env = env;
  }

  async process(context) {
    const { request } = context;

    // Extract request metadata
    const userAgent = request.headers.get('User-Agent') || 'unknown';
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const authToken = request.headers.get('Authorization');

    // Basic validation
    if (!authToken) {
      return {
        success: false,
        error: 'Authorization required - register your initiative first'
      };
    }

    return {
      success: true,
      routing: {
        userAgent,
        ip,
        authToken,
        region: request.headers.get('CF-IPCountry') || 'US'
      }
    };
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
    const { authToken } = context.stages.router.routing;

    // Validate auth token against session store
    const sessionKey = `session:${authToken}`;
    const sessionData = await this.env.SESSIONS?.get(sessionKey);

    if (!sessionData) {
      return {
        success: false,
        error: 'Invalid session - please authenticate through ChittyChat'
      };
    }

    const session = JSON.parse(sessionData);

    // Validate project registration
    if (!session.project?.registered) {
      return {
        success: false,
        error: 'Project not registered - register your initiative first'
      };
    }

    return {
      success: true,
      user: session.user,
      project: session.project
    };
  }
}

/**
 * Trust Stage - Evaluates trust level based on user/project factors
 */
class TrustStage {
  constructor(env) {
    this.env = env;
  }

  async process(context) {
    const { user, project } = context.stages.intake;

    // Calculate trust level based on multiple factors
    let trustLevel = 0;
    const factors = [];

    // User verification status
    if (user.verified) {
      trustLevel++;
      factors.push('user_verified');
    }

    // Project registration status
    if (project.registered) {
      trustLevel++;
      factors.push('project_registered');
    }

    // Historical compliance
    const complianceKey = `compliance:${user.id}`;
    const complianceData = await this.env.AUTH_CACHE?.get(complianceKey);
    if (complianceData) {
      const compliance = JSON.parse(complianceData);
      if (compliance.score > 0.8) {
        trustLevel++;
        factors.push('high_compliance');
      }
    }

    // Additional verification layers
    if (user.twoFactorEnabled) {
      trustLevel++;
      factors.push('2fa_enabled');
    }

    if (project.verified) {
      trustLevel++;
      factors.push('project_verified');
    }

    return {
      success: true,
      trustLevel: Math.min(trustLevel, 5), // Cap at 5
      factors
    };
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
    const { user, project } = context.stages.intake;
    const { trustLevel } = context.stages.trust;

    // Check rate limits
    const rateLimitKey = `ratelimit:${user.id}:${new Date().toISOString().slice(0, 10)}`;
    const currentCount = await this.env.AUTH_CACHE?.get(rateLimitKey);
    const count = currentCount ? parseInt(currentCount) : 0;

    // Trust level determines rate limit
    const maxRequests = (trustLevel + 1) * 100; // 100, 200, 300, etc.

    if (count >= maxRequests) {
      return {
        success: false,
        error: `Rate limit exceeded - maximum ${maxRequests} requests per day for trust level ${trustLevel}`
      };
    }

    // Update rate limit counter
    await this.env.AUTH_CACHE?.put(rateLimitKey, (count + 1).toString(), {
      expirationTtl: 86400 // 24 hours
    });

    // Check project permissions
    if (!project.permissions?.includes('generate_id')) {
      return {
        success: false,
        error: 'Project lacks permission to generate ChittyIDs'
      };
    }

    return {
      success: true,
      authorized: true,
      rateLimit: {
        current: count + 1,
        max: maxRequests
      }
    };
  }
}

/**
 * Generation Stage - Requests ChittyID from id.chitty.cc service
 */
class GenerationStage {
  constructor(env) {
    this.env = env;
  }

  async process(context) {
    const { user, project } = context.stages.intake;
    const { trustLevel } = context.stages.trust;
    const { purpose } = context;

    try {
      // Prepare parameters for id.chitty.cc service
      const params = {
        region: this.determineRegion(user),
        jurisdiction: this.determineJurisdiction(user),
        entityType: this.mapPurposeToEntityType(purpose),
        trustLevel: trustLevel.toString(),
        metadata: {
          userId: user.id,
          projectId: project.id,
          projectName: project.name,
          purpose,
          timestamp: context.timestamp
        }
      };

      // Call id.chitty.cc service (simulated for now)
      const chittyId = await this.requestFromService(params);

      // Store ChittyID with metadata
      await this.env.CHITTY_IDS?.put(chittyId, JSON.stringify({
        chittyId,
        ...params,
        createdAt: context.timestamp,
        pipeline: 'v2',
        stages: Object.keys(context.stages)
      }));

      // Log to analytics
      if (this.env.CHITTY_ANALYTICS) {
        this.env.CHITTY_ANALYTICS.writeDataPoint({
          indexes: ['chittyid_generated', project.id],
          doubles: [trustLevel, Date.now()],
          blobs: [chittyId, purpose]
        });
      }

      return {
        success: true,
        chittyId,
        parameters: params
      };
    } catch (error) {
      return {
        success: false,
        error: `Service error: ${error.message}`
      };
    }
  }

  determineRegion(user) {
    const regionMap = {
      'US': '1', 'CA': '1', 'MX': '1', // North America
      'BR': '2', 'AR': '2', 'CL': '2', // South America
      'GB': '3', 'DE': '3', 'FR': '3', // Europe
      'CN': '4', 'JP': '4', 'IN': '4', // Asia
      'ZA': '5', 'NG': '5', 'EG': '5', // Africa
      'AU': '6', 'NZ': '6', // Oceania
      'AQ': '7', // Antarctica
      'INT': '8', // International Waters
      'DIGITAL': '9' // Digital/Virtual
    };
    return regionMap[user.country] || '9';
  }

  determineJurisdiction(user) {
    // Use ISO 3-letter country codes
    const jurisdictionMap = {
      'US': 'USA',
      'CA': 'CAN',
      'GB': 'GBR',
      'DE': 'DEU',
      'FR': 'FRA',
      'JP': 'JPN',
      'CN': 'CHN',
      'AU': 'AUS',
      'BR': 'BRA'
    };
    return jurisdictionMap[user.country] || 'INT';
  }

  mapPurposeToEntityType(purpose) {
    const mapping = {
      'person': 'P',
      'location': 'L',
      'thing': 'T',
      'event': 'E',
      'work-item': 'T',
      'document': 'T',
      'asset': 'T',
      'general': 'T'
    };
    return mapping[purpose.toLowerCase()] || 'T';
  }

  async requestFromService(params) {
    // TODO: Actual call to id.chitty.cc service
    // For now, simulate the service response
    const version = '03'; // Current version
    const yearMonth = new Date().toISOString().slice(2, 7).replace('-', '');
    const sequential = Math.floor(Math.random() * 9999).toString().padStart(4, '0');

    const baseId = `${version}-${params.region}-${params.jurisdiction}-${sequential}-${params.entityType}-${yearMonth}-${params.trustLevel}`;
    const checksum = this.calculateChecksum(baseId);

    return `${baseId}-${checksum}`;
  }

  calculateChecksum(baseId) {
    // Simple Mod-97 checksum calculation
    const cleanId = baseId.replace(/-/g, '');
    let sum = 0;
    for (let i = 0; i < cleanId.length; i++) {
      const char = cleanId[i];
      const value = isNaN(char) ? char.charCodeAt(0) - 55 : parseInt(char);
      sum += value * (i + 1);
    }
    return (sum % 97).toString().padStart(2, '0');
  }
}