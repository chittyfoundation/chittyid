/**
 * VRF-based ChittyID Generator
 *
 * Implements Verifiable Random Function for deterministic ChittyID generation
 * using drand beacon + content binding + entity metadata.
 *
 * NO Math.random() - ALL randomness comes from drand beacon.
 * NO local generation - service-only architecture.
 *
 * ChittyID Format: VV-G-LLL-SSSS-T-YM-C-X
 * - VV: Version (03)
 * - G: Domain (C=ChittyCorp, E=Error, F=Fallback)
 * - LLL: Namespace (3 letters)
 * - SSSS: Sequential (4 digits, VRF-derived)
 * - T: Type (P/L/T/E)
 * - YM: Year/Month
 * - C: Trust (0-5)
 * - X: Checksum (2 digits, Mod-97 with content binding)
 */

import { DrandBeaconService } from "./drand-beacon.js";

export class VRFGenerator {
  constructor(env) {
    this.env = env;
    this.drand = new DrandBeaconService(env);
    this.version = "03";
  }

  /**
   * Generate ChittyID using VRF with drand + content binding
   *
   * @param {Object} params - Generation parameters
   * @param {string} params.namespace - 3-letter namespace (e.g., 'GEN', 'WRK')
   * @param {string} params.entityType - Entity type (P/L/T/E)
   * @param {string} params.region - Geographic region (1-9)
   * @param {string} params.jurisdiction - 3-letter jurisdiction (e.g., 'USA')
   * @param {number} params.trustLevel - Trust level (0-5)
   * @param {Object} params.content - Entity content/metadata for binding
   * @returns {Promise<ChittyIDResult>}
   */
  async generate(params) {
    const { namespace, entityType, region, jurisdiction, trustLevel, content } =
      params;

    // Validate required parameters
    this.validateParams(params);

    // Step 1: Fetch latest drand beacon
    const beacon = await this.drand.fetchLatest();

    // Step 2: Generate content hash for binding
    const contentHash = await this.drand.generateContentHash(content);

    // Step 3: Generate VRF-based sequential field (SSSS)
    const sequential = await this.drand.generateSequentialField(
      {
        contentHash,
        namespace,
        entityType,
        region,
      },
      beacon,
    );

    // Step 4: Build base ID components
    const domain = "C"; // ChittyCorp (production)
    const yearMonth = this.getYearMonth();

    const baseId = [
      this.version,
      domain,
      namespace,
      sequential,
      entityType,
      yearMonth,
      trustLevel.toString(),
    ].join("-");

    // Step 5: Calculate checksum with content binding
    const checksum = await this.calculateChecksumWithBinding(
      baseId,
      contentHash,
      beacon.randomness,
    );

    const chittyId = `${baseId}-${checksum}`;

    // Step 6: Store audit trail
    await this.storeAuditTrail({
      chittyId,
      beacon,
      contentHash,
      params,
      timestamp: new Date().toISOString(),
    });

    return {
      chittyId,
      metadata: {
        version: this.version,
        domain,
        namespace,
        sequential,
        entityType,
        yearMonth,
        trustLevel,
        checksum,
        contentHash,
        beacon: {
          round: beacon.round,
          randomness: beacon.randomness,
        },
      },
    };
  }

  /**
   * Calculate Mod-97 checksum with content binding
   *
   * This binds the ChittyID to the content hash and drand value,
   * making it cryptographically verifiable.
   *
   * @param {string} baseId - Base ID without checksum
   * @param {string} contentHash - SHA256 hash of content
   * @param {string} drandValue - drand randomness hex
   * @returns {Promise<string>} 2-digit checksum
   */
  async calculateChecksumWithBinding(baseId, contentHash, drandValue) {
    // Combine base ID + content hash + drand value
    const bindingInput = `${baseId}|${contentHash}|${drandValue}`;

    // Hash the combined input
    const encoder = new TextEncoder();
    const data = encoder.encode(bindingInput);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));

    // Convert to numeric value for Mod-97
    let sum = 0;
    for (let i = 0; i < hashArray.length; i++) {
      sum += hashArray[i] * (i + 1);
    }

    // Mod-97 checksum (IBAN-style)
    const checksum = (sum % 97).toString().padStart(2, "0");

    return checksum;
  }

  /**
   * Verify ChittyID integrity
   *
   * @param {string} chittyId - ChittyID to verify
   * @param {string} contentHash - Original content hash
   * @param {string} drandValue - Original drand value
   * @returns {Promise<boolean>}
   */
  async verify(chittyId, contentHash, drandValue) {
    const parts = chittyId.split("-");
    if (parts.length !== 8) {
      return false;
    }

    const baseId = parts.slice(0, 7).join("-");
    const providedChecksum = parts[7];

    const calculatedChecksum = await this.calculateChecksumWithBinding(
      baseId,
      contentHash,
      drandValue,
    );

    return providedChecksum === calculatedChecksum;
  }

  /**
   * Validate generation parameters
   *
   * @param {Object} params - Parameters to validate
   * @throws {Error} If validation fails
   */
  validateParams(params) {
    const { namespace, entityType, region, jurisdiction, trustLevel, content } =
      params;

    if (!namespace || namespace.length !== 3) {
      throw new Error("Namespace must be exactly 3 letters");
    }

    if (!["P", "L", "T", "E"].includes(entityType)) {
      throw new Error("Entity type must be P, L, T, or E");
    }

    if (!region || region < "1" || region > "9") {
      throw new Error("Region must be 1-9");
    }

    if (!jurisdiction || jurisdiction.length !== 3) {
      throw new Error("Jurisdiction must be exactly 3 letters");
    }

    if (trustLevel < 0 || trustLevel > 5) {
      throw new Error("Trust level must be 0-5");
    }

    if (!content || typeof content !== "object") {
      throw new Error("Content object required for binding");
    }
  }

  /**
   * Get current year/month encoding
   *
   * @returns {string} YM code (2 digits)
   */
  getYearMonth() {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString();
    return year + month.slice(-1);
  }

  /**
   * Store audit trail for ChittyID generation
   *
   * @param {Object} audit - Audit data
   */
  async storeAuditTrail(audit) {
    if (!this.env.CHITTYID_KV) {
      return; // Skip if KV not available
    }

    const auditKey = `audit:${audit.chittyId}`;
    await this.env.CHITTYID_KV.put(
      auditKey,
      JSON.stringify(audit),
      { expirationTtl: 86400 * 365 }, // 1 year retention
    );

    // Also store in beacon audit
    await this.drand.storeBeaconAudit(audit.beacon, audit.chittyId);
  }
}

/**
 * @typedef {Object} ChittyIDResult
 * @property {string} chittyId - Generated ChittyID
 * @property {Object} metadata - Generation metadata
 */
