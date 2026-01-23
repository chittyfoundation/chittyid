/**
 * drand Beacon Integration for ChittyID
 *
 * Provides verifiable randomness from Cloudflare's drand beacon
 * for deterministic SSSS field generation in ChittyIDs.
 *
 * drand is a distributed randomness beacon providing publicly
 * verifiable, unpredictable, and unbiasable random values.
 *
 * @see https://drand.love/docs/overview/
 * @see https://developers.cloudflare.com/workers/runtime-apis/drand/
 */

export class DrandBeaconService {
  constructor(env) {
    this.env = env;
    this.beaconUrl =
      env?.DRAND_BEACON_URL || "https://api.drand.sh/public/latest";
    this.chainHash =
      "dbd506d6ef76e5f386f41c651dcb808c5bcbd75471cc4eafa3f4df7ad4e4c493"; // Quicknet chain
  }

  /**
   * Fetch latest drand beacon value
   * @returns {Promise<DrandBeacon>}
   */
  async fetchLatest() {
    try {
      const response = await fetch(this.beaconUrl);

      if (!response.ok) {
        throw new Error(`drand beacon returned ${response.status}`);
      }

      const beacon = await response.json();

      // Validate beacon structure
      if (!beacon.round || !beacon.randomness || !beacon.signature) {
        throw new Error("Invalid drand beacon structure");
      }

      return {
        round: beacon.round,
        randomness: beacon.randomness,
        signature: beacon.signature,
        previous_signature: beacon.previous_signature,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(`Failed to fetch drand beacon: ${error.message}`);
    }
  }

  /**
   * Fetch specific round from drand beacon
   * @param {number} round - Round number
   * @returns {Promise<DrandBeacon>}
   */
  async fetchRound(round) {
    try {
      const url = `https://api.drand.sh/${this.chainHash}/public/${round}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(
          `drand beacon returned ${response.status} for round ${round}`,
        );
      }

      const beacon = await response.json();

      return {
        round: beacon.round,
        randomness: beacon.randomness,
        signature: beacon.signature,
        previous_signature: beacon.previous_signature,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(`Failed to fetch drand round ${round}: ${error.message}`);
    }
  }

  /**
   * Generate VRF-based sequential field using drand beacon
   *
   * This replaces Math.random() with deterministic, verifiable randomness.
   * The SSSS field is derived from:
   * - drand beacon randomness
   * - drand round number
   * - content hash (SHA256 of entity data)
   * - namespace
   * - entity type
   *
   * @param {Object} params - Generation parameters
   * @param {string} params.contentHash - SHA256 hash of content
   * @param {string} params.namespace - 3-letter namespace
   * @param {string} params.entityType - Entity type (P/L/T/E)
   * @param {string} params.region - Geographic region
   * @param {DrandBeacon} beacon - drand beacon value
   * @returns {string} 4-digit SSSS field
   */
  async generateSequentialField(params, beacon) {
    const { contentHash, namespace, entityType, region } = params;

    // Combine all components for VRF input
    const vrfInput = [
      beacon.randomness,
      beacon.round.toString(),
      contentHash,
      namespace,
      entityType,
      region,
    ].join("|");

    // Use Web Crypto API for SHA256 (available in Cloudflare Workers)
    const encoder = new TextEncoder();
    const data = encoder.encode(vrfInput);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));

    // Convert to 4-digit sequential field (0000-9999)
    // Use >>> 0 to ensure unsigned 32-bit integer (prevents negative values)
    const hash32 = (hashArray
      .slice(0, 4)
      .reduce((acc, byte) => (acc << 8) | byte, 0)) >>> 0;
    const sequential = (hash32 % 10000).toString().padStart(4, "0");

    return sequential;
  }

  /**
   * Generate content hash for binding to ChittyID
   *
   * @param {Object} content - Entity content/metadata
   * @returns {Promise<string>} SHA256 hash in hex
   */
  async generateContentHash(content) {
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(content));
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    return hashHex;
  }

  /**
   * Verify drand signature (optional - for high-security use cases)
   *
   * @param {DrandBeacon} beacon - Beacon to verify
   * @returns {Promise<boolean>}
   */
  async verifyBeacon(beacon) {
    // TODO: Implement BLS signature verification
    // This requires BLS12-381 signature verification
    // For now, trust the Cloudflare endpoint (over HTTPS)
    return true;
  }

  /**
   * Store beacon value for audit trail
   *
   * @param {DrandBeacon} beacon - Beacon to store
   * @param {string} chittyId - Generated ChittyID
   */
  async storeBeaconAudit(beacon, chittyId) {
    if (!this.env.CHITTYID_KV) {
      return; // Skip if KV not available
    }

    const auditKey = `beacon:${chittyId}`;
    const auditData = {
      chittyId,
      beacon: {
        round: beacon.round,
        randomness: beacon.randomness,
        signature: beacon.signature,
      },
      timestamp: beacon.timestamp,
    };

    await this.env.CHITTYID_KV.put(
      auditKey,
      JSON.stringify(auditData),
      { expirationTtl: 86400 * 365 }, // 1 year retention
    );
  }
}

/**
 * @typedef {Object} DrandBeacon
 * @property {number} round - Round number
 * @property {string} randomness - Hex-encoded random value
 * @property {string} signature - BLS signature
 * @property {string} previous_signature - Previous round signature
 * @property {string} timestamp - ISO timestamp
 */
