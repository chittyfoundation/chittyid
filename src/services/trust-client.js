/**
 * ChittyTrust Client for Trust Level Resolution
 *
 * Integrates with ChittyTrust (trust.chitty.cc) for certificate policy trust levels
 * and ChittyScore (score.chitty.cc) for 6D behavioral trust scoring.
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
   * Get trust level from ChittyScore 6D behavioral scoring
   *
   * ChittyScore dimensions (6D):
   * - Identity verification score
   * - Transaction history score
   * - Governance participation score
   * - Network reputation score
   * - Compliance record score
   * - Time-based trust decay/growth
   */
  async getScoreTrustLevel(chittyId) {
    try {
      const response = await fetch(`${this.scoreUrl}/api/v1/score/${chittyId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Token': this.serviceToken || ''
        }
      });

      if (!response.ok) {
        // ChittyScore not deployed yet - return null to use fallback
        return null;
      }

      const data = await response.json();
      if (data.success && data.data?.trustLevel !== undefined) {
        return {
          level: data.data.trustLevel,
          source: 'chittyscore',
          score: data.data.compositeScore,
          dimensions: data.data.dimensions,
          reason: `6D composite score: ${data.data.compositeScore}`,
          verified: true
        };
      }

      return null;
    } catch (error) {
      // ChittyScore not available - this is expected until it's deployed
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
 * @property {Object} [dimensions] - 6D score breakdown (if from ChittyScore)
 */
