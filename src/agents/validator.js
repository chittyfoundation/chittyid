export class ValidatorAgent {
  constructor(env) {
    this.ai = env.AI;
    this.authCache = env.AUTH_CACHE;
  }

  async validate(chittyId) {
    // ChittyID format: VV-G-LLL-SSSS-T-YYMM-C-XX
    const parts = chittyId.split("-");

    if (parts.length !== 8) {
      return {
        valid: false,
        details: "Invalid format - wrong number of parts",
      };
    }

    const [version, geo, legal, sequential, type, yearMonth, trust, checksum] =
      parts;

    // Basic format validation
    const formatValid = this.validateFormat(
      version,
      geo,
      legal,
      sequential,
      type,
      yearMonth,
      trust,
      checksum,
    );
    if (!formatValid.valid) {
      return formatValid;
    }

    // AI-powered semantic validation
    const aiValidation = await this.aiValidate(chittyId, parts);

    // Mod-97 checksum validation
    const checksumValid = this.validateChecksum(chittyId);

    return {
      valid: formatValid.valid && aiValidation.valid && checksumValid,
      details: {
        format: formatValid,
        ai: aiValidation,
        checksum: checksumValid,
      },
      trustLevel: trust,
      entityType: type,
    };
  }

  validateFormat(
    version,
    geo,
    legal,
    sequential,
    type,
    yearMonth,
    trust,
    checksum,
  ) {
    // Version: 2 digits
    if (!/^\d{2}$/.test(version)) {
      return { valid: false, reason: "Invalid version format" };
    }

    // Geo: single character
    if (!/^[A-Z0-9]$/.test(geo)) {
      return { valid: false, reason: "Invalid geographical code" };
    }

    // Legal: 3 letters
    if (!/^[A-Z]{3}$/.test(legal)) {
      return { valid: false, reason: "Invalid legal jurisdiction code" };
    }

    // Sequential: 4 digits
    if (!/^\d{4}$/.test(sequential)) {
      return { valid: false, reason: "Invalid sequential ID" };
    }

    // @canon: chittycanon://gov/governance#core-types
    const validTypes = ["P", "L", "T", "E", "A"];
    if (!validTypes.includes(type)) {
      return { valid: false, reason: "Invalid entity type" };
    }

    // Year-Month: 3 digit code (e.g., 251)
    if (!/^\d{3}$/.test(yearMonth)) {
      return { valid: false, reason: "Invalid year-month code" };
    }

    // Trust: 0-5 (single digit)
    if (!/^[0-5]$/.test(trust)) {
      return { valid: false, reason: "Invalid trust level" };
    }

    // Checksum: 2 digits (mod-97 checksum)
    if (!/^\d{2}$/.test(checksum)) {
      return { valid: false, reason: "Invalid checksum format" };
    }

    return { valid: true };
  }

  async aiValidate(chittyId, parts) {
    try {
      const prompt = `Analyze this ChittyID for semantic validity: ${chittyId}

      Components:
      - Version: ${parts[0]}
      - Geographic: ${parts[1]}
      - Legal: ${parts[2]}
      - Sequential: ${parts[3]}
      - Type: ${parts[4]}
      - Year-Month: ${parts[5]}
      - Trust: ${parts[6]}
      - Checksum: ${parts[7]}

      Validate if the components make logical sense together. Return JSON with 'valid' boolean and 'reasoning' string.`;

      const response = await this.ai.run("@cf/meta/llama-3.1-8b-instruct", {
        prompt,
        max_tokens: 256,
      });

      return JSON.parse(response.response);
    } catch (error) {
      return { valid: true, reasoning: "AI validation unavailable" };
    }
  }

  validateChecksum(chittyId) {
    // Remove 2-digit checksum for calculation
    const idWithoutChecksum = chittyId.slice(0, -2);

    // Calculate Mod-97 checksum
    let checksum = 0;
    for (let char of idWithoutChecksum.replace(/-/g, "")) {
      if (char.match(/[A-Z]/)) {
        checksum = (checksum * 100 + char.charCodeAt(0) - 55) % 97;
      } else if (char.match(/\d/)) {
        checksum = (checksum * 10 + parseInt(char)) % 97;
      }
    }

    const expectedChecksum = (98 - checksum) % 97;
    const actualChecksum = parseInt(chittyId.slice(-2));

    return expectedChecksum === actualChecksum;
  }

  async getStatus() {
    return {
      name: "ChittyID Validator",
      status: "active",
      capabilities: [
        "format_validation",
        "ai_semantic_check",
        "mod97_checksum",
      ],
      performance: await this.getPerformanceMetrics(),
    };
  }

  async getPerformanceMetrics() {
    // Get cached validation stats
    const stats = await this.authCache.get("validator:stats");
    return stats ? JSON.parse(stats) : { validations: 0, success_rate: 0 };
  }

  async validateWithAI(chittyId, options = {}) {
    try {
      const messages = [
        {
          role: "system",
          content:
            "You are a ChittyID validation expert. Analyze the provided ChittyID for format validity, semantic correctness, and contextual appropriateness.",
        },
        {
          role: "user",
          content: `Validate this ChittyID: ${chittyId}

Purpose: ${options.purpose || "general"}
Context: ${options.context || "standard validation"}

Return a JSON response with:
- valid: boolean
- confidence: number (0.0-1.0)
- ai_validation: boolean
- format_valid: boolean
- checksum_valid: boolean
- trust_level_appropriate: boolean
- reasoning: string`,
        },
      ];

      const response = await this.ai.run("@cf/meta/llama-3.1-8b-instruct", {
        messages,
        max_tokens: 512,
        temperature: 0.1,
      });

      const result = JSON.parse(response.response);

      // Combine with our built-in validation
      const builtInValidation = await this.validate(chittyId);

      // AI validation can override built-in validation for edge cases
      const overallValid =
        result.valid &&
        (builtInValidation.valid || result.checksum_valid === true); // AI says checksum is valid

      return {
        valid: overallValid,
        confidence: result.confidence || 0.5,
        ai_validation: true,
        format_valid: result.format_valid !== false,
        checksum_valid: result.checksum_valid !== false,
        trust_level_appropriate: result.trust_level_appropriate !== false,
        reasoning: result.reasoning || "AI validation completed",
        details: {
          ai_result: result,
          builtin_result: builtInValidation,
        },
      };
    } catch (error) {
      console.error("AI validation failed:", error);

      // Fallback to built-in validation
      const fallbackValidation = await this.validate(chittyId);

      return {
        valid: fallbackValidation.valid,
        confidence: 0.5,
        ai_validation: false,
        format_valid: true,
        checksum_valid: fallbackValidation.details?.checksum || false,
        trust_level_appropriate: true,
        reasoning: "AI validation unavailable, using built-in validation",
        details: {
          error: error.message,
          fallback_result: fallbackValidation,
        },
      };
    }
  }
}
