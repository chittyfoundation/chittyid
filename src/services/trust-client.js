/**
 * ChittyTrust Client for Trust Level Resolution
 *
 * Integrates with ChittyTrust (trust.chitty.cc) for certificate policy trust levels
 * and ChittyScore (score.chitty.cc) for TY/VY/RY DRL reckoning.
 *
 * Trust Level Mapping:
 *   L0 (0) - Anonymous: No identity verification
 *   L1 (1) - Basic: Email verified
 *   L2 (2) - Enhanced: Identity document verified
 *   L3 (3) - Professional: Organization verified
 *   L4 (4) - Institutional: Full compliance audit
 *   L5 (5) - Official: Reserved for ChittyOS system services
 */

export class TrustClient {
  constructor(env) {
    this.env = env;
    this.trustUrl = env?.CHITTYTRUST_URL || 'https://trust.chitty.cc';
    this.scoreUrl = env?.CHITTYSCORE_URL || 'https://score.chitty.cc';
    this.serviceToken = env?.CHITTY_SERVICE_TOKEN;
  }

  /**
   * Resolve trust level for a ChittyID minting request
   *
   * @param {Object} context - Request context
   * @param {string} context.authToken - Bearer token from request (if authenticated)
   * @param {string} context.chittyId - Existing ChittyID of requestor (if known)
   * @param {string} context.entityType - Type being minted (P/L/T/E/A)
   * @returns {Promise<TrustResolution>}
   */
  async resolveTrustLevel(context) {
    const { authToken, chittyId, entityType } = context;

    // L5 (Official) - Only for internal system services
    if (this.isSystemService(authToken)) {
      return {
        level: 5,
        source: 'system',
        reason: 'Authenticated system service',
        verified: true
      };
    }

    // Try ChittyTrust policy-based trust level
    if (authToken) {
      try {
        const policyTrust = await this.getPolicyTrustLevel(authToken);
        if (policyTrust) {
          return policyTrust;
        }
      } catch (error) {
        console.warn('ChittyTrust lookup failed:', error.message);
      }
    }

    // Try ChittyScore behavioral trust (when available)
    if (chittyId) {
      try {
        const scoreTrust = await this.getScoreTrustLevel(chittyId);
        if (scoreTrust) {
          return scoreTrust;
        }
      } catch (error) {
        console.warn('ChittyScore lookup failed:', error.message);
      }
    }

    // Default: L0 for unauthenticated, L1 for authenticated but unverified
    return {
      level: authToken ? 1 : 0,
      source: 'default',
      reason: authToken ? 'Authenticated but no trust record' : 'Unauthenticated request',
      verified: false
    };
  }

  /**
   * Check if request is from a system service
   */
  isSystemService(authToken) {
    if (!authToken || !this.serviceToken) return false;
    // System services use service tokens, not user tokens
    return authToken.startsWith('CHITTY_SERVICE_') ||
           authToken === this.serviceToken;
  }

  /**
   * Get trust level from ChittyTrust certificate policies
   */
  async getPolicyTrustLevel(authToken) {
    try {
      const response = await fetch(`${this.trustUrl}/api/v1/policies/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          action: 'resolve_trust_level'
        })
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      if (data.success && data.data?.trustLevel) {
        // Convert L0-L4 to 0-4
        const levelNum = parseInt(data.data.trustLevel.replace('L', ''));
        return {
          level: levelNum,
          source: 'chittytrust',
          policyOid: data.data.policyOid,
          reason: `Certificate policy ${data.data.policyOid}`,
          verified: true
        };
      }

      return null;
    } catch (error) {
      console.error('ChittyTrust API error:', error);
      return null;
    }
  }

  /**
   * Get trust level from ChittyScore DRL reckoning (TY/VY/RY model)
   *
   * Per TY-VY-RY White Paper v2.1:
   * - TY: idenTitY / ontological identity (0-1)
   * - VY: connectiVitY / behavioral record and network experience (0-1)
   * - RY: authoRitY / earned, revocable authority (0-1)
   * - Trust level derived: floor((ty + vy + ry) / 3 * 5)
   */
  async getScoreTrustLevel(chittyId) {
    try {
      const response = await fetch(`${this.scoreUrl}/v1/reckon/${encodeURIComponent(chittyId)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Source-Service': 'chittyid'
        }
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      if (data.ty !== undefined) {
        const composite = (data.ty + data.vy + data.ry) / 3;
        const trustLevel = Math.min(5, Math.floor(composite * 5));
        return {
          level: trustLevel,
          source: 'chittyscore',
          score: composite,
          ty: data.ty,
          vy: data.vy,
          ry: data.ry,
          reason: `TY/VY/RY reckoning: ${data.ty.toFixed(2)}/${data.vy.toFixed(2)}/${data.ry.toFixed(2)}`,
          verified: data.confidence > 0.5
        };
      }

      return null;
    } catch (error) {
      // ChittyScore not available
      return null;
    }
  }

  /**
   * Validate that a requested trust level is allowed
   *
   * @param {number} requestedLevel - Trust level requested by caller
   * @param {TrustResolution} resolved - Resolved trust level
   * @returns {number} - Allowed trust level (min of requested and resolved)
   */
  validateRequestedLevel(requestedLevel, resolved) {
    // Can't request higher than what you're entitled to
    if (requestedLevel > resolved.level) {
      console.warn(`Trust level ${requestedLevel} requested but only ${resolved.level} allowed`);
      return resolved.level;
    }
    // Can request lower if desired (e.g., anonymous mode)
    return requestedLevel;
  }
}

/**
 * @typedef {Object} TrustResolution
 * @property {number} level - Trust level 0-5
 * @property {string} source - Where trust was resolved from (system/chittytrust/chittyscore/default)
 * @property {string} reason - Human-readable reason
 * @property {boolean} verified - Whether trust was actively verified
 * @property {string} [policyOid] - Certificate policy OID (if from ChittyTrust)
 * @property {number} [score] - Composite score (if from ChittyScore)
 * @property {number} [ty] - TY idenTitY (0-1, if from ChittyScore)
 * @property {number} [vy] - VY connectiVitY (0-1, if from ChittyScore)
 * @property {number} [ry] - RY authoRitY (0-1, if from ChittyScore)
 */
