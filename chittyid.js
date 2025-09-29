/**
 * ChittyID Client - STRICT SERVER-ONLY VERSION
 *
 * SECURITY UPDATE: This file has been updated to enforce server-only generation.
 * Previous versions contained local generation which violated security policy.
 *
 * ALL ChittyID operations must be performed by authorized servers only.
 * NO LOCAL GENERATION - NO EXCEPTIONS
 */

class ChittyIDClient {
  constructor(config = {}) {
    this.serverUrl =
      config.serverUrl ||
      process.env.CHITTY_SERVER_URL ||
      "https://id.chitty.cc";
    this.apiKey = config.apiKey || process.env.CHITTY_API_KEY;

    if (!this.apiKey) {
      console.warn(
        "WARNING: CHITTY_API_KEY not configured. " +
          "ChittyID requests will fail. " +
          "NO LOCAL GENERATION IS AVAILABLE.",
      );
    }
  }

  /**
   * Request ChittyID from server - NO LOCAL GENERATION
   * @param {string} region - Region code
   * @param {string} jurisdiction - 3-letter jurisdiction
   * @param {string} entityType - Entity type (P/L/T/E)
   * @param {number} trustLevel - Trust level (0-5)
   * @returns {Promise<string>} Server-generated ChittyID
   */
  async generate(region, jurisdiction, entityType, trustLevel) {
    if (!this.apiKey) {
      throw new Error(
        "CHITTYID_ERROR: API key required. " +
          "Configure CHITTY_API_KEY environment variable. " +
          "NO LOCAL GENERATION AVAILABLE.",
      );
    }

    if (!region || !jurisdiction || !entityType || trustLevel === undefined) {
      throw new Error("All parameters are required for server request");
    }

    try {
      const response = await fetch(`${this.serverUrl}/api/v2/chittyid/mint`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "X-ChittyOS-Pipeline": "Router→Intake→Trust→Authorization→Generation",
        },
        body: JSON.stringify({
          region,
          jurisdiction,
          entity: entityType,
          trustLevel,
          format: "official",
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          `Server generation failed: ${error.error || response.statusText}. ` +
            "NO LOCAL GENERATION AVAILABLE.",
        );
      }

      const result = await response.json();
      return result.chittyId;
    } catch (error) {
      throw new Error(
        `ChittyID generation failed: ${error.message}. ` +
          "NO LOCAL GENERATION AVAILABLE. " +
          "Ensure server connectivity to " +
          this.serverUrl,
      );
    }
  }

  /**
   * Verify ChittyID with server
   * @param {string} chittyId - The ChittyID to verify
   * @returns {Promise<Object>} Verification result
   */
  async verify(chittyId) {
    if (!this.apiKey) {
      throw new Error("CHITTYID_ERROR: API key required for verification");
    }

    try {
      const response = await fetch(`${this.serverUrl}/api/v2/chittyid/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ chittyId }),
      });

      if (!response.ok) {
        throw new Error(`Verification failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      throw new Error(`ChittyID verification failed: ${error.message}`);
    }
  }

  /**
   * REMOVED METHODS - NO LOCAL OPERATIONS
   * The following methods have been removed as they violated security policy:
   * - mod97Checksum() - Local checksum calculation
   * - getCurrentYearMonth() - Local time calculation
   * - generateSequential() - Local sequence generation
   *
   * ALL ChittyID operations MUST go through the server
   */

  /**
   * Legacy method - throws error directing to server
   */
  mod97Checksum() {
    throw new Error(
      "LOCAL CALCULATION REMOVED: This method has been removed for security. " +
        "All ChittyID operations must use the server at " +
        this.serverUrl,
    );
  }

  getCurrentYearMonth() {
    throw new Error(
      "LOCAL CALCULATION REMOVED: This method has been removed for security. " +
        "All ChittyID operations must use the server at " +
        this.serverUrl,
    );
  }

  generateSequential() {
    throw new Error(
      "LOCAL GENERATION REMOVED: This method has been removed for security. " +
        "All ChittyID operations must use the server at " +
        this.serverUrl,
    );
  }

  /**
   * Get server health status
   */
  async getServerStatus() {
    try {
      const response = await fetch(`${this.serverUrl}/health`, {
        method: "GET",
        headers: {
          "User-Agent": "ChittyIDClient-ServerOnly/2.0",
        },
      });

      if (response.ok) {
        const data = await response.json();
        return {
          online: true,
          ...data,
        };
      } else {
        return {
          online: false,
          error: `Server responded with ${response.status}`,
        };
      }
    } catch (error) {
      return {
        online: false,
        error: error.message,
      };
    }
  }
}

// Backward compatibility - but enforce server-only
class ChittyID extends ChittyIDClient {
  constructor(config = {}) {
    super(config);
    console.warn(
      "DEPRECATION WARNING: ChittyID class is deprecated. " +
        "Use ChittyIDClient for server-only operations. " +
        "NO LOCAL GENERATION IS AVAILABLE.",
    );
  }
}

// Export for use
if (typeof module !== "undefined" && module.exports) {
  module.exports = { ChittyID, ChittyIDClient };
} else if (typeof window !== "undefined") {
  window.ChittyID = ChittyID;
  window.ChittyIDClient = ChittyIDClient;
}
