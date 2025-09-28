export class SecurityAgent {
  constructor(env) {
    this.ai = env.AI;
    this.authCache = env.AUTH_CACHE;
    this.sessions = env.SESSIONS;
    this.vectors = env.CHITTY_VECTORS;
  }

  async analyze(chittyId, validationResult) {
    const checks = await Promise.all([
      this.checkAnomalies(chittyId),
      this.checkTrustEscalation(chittyId),
      this.checkPatternAnalysis(chittyId),
      this.checkRateLimit(chittyId),
    ]);

    const riskScore = this.calculateRiskScore(checks);

    // Store security event
    await this.logSecurityEvent(chittyId, riskScore, checks);

    return {
      riskScore,
      threatLevel: this.getThreatLevel(riskScore),
      checks: {
        anomalies: checks[0],
        trustEscalation: checks[1],
        patterns: checks[2],
        rateLimit: checks[3],
      },
      action: this.determineAction(riskScore),
    };
  }

  async checkAnomalies(chittyId) {
    try {
      const parts = chittyId.split("-");
      const [version, geo, legal, sequential, type, yearMonth, trust] = parts;

      // Get historical patterns
      const pattern = await this.authCache.get(
        `pattern:${geo}:${legal}:${type}`,
      );
      const historicalData = pattern ? JSON.parse(pattern) : null;

      // AI anomaly detection
      const prompt = `Analyze ChittyID for anomalies:
      ID: ${chittyId}
      Historical pattern: ${JSON.stringify(historicalData)}

      Check for:
      - Unusual geographical/legal combinations
      - Suspicious sequential patterns
      - Trust level anomalies
      - Time-based irregularities

      Return JSON with 'anomalous' boolean and 'details' array.`;

      const response = await this.ai.run("@cf/meta/llama-3.1-8b-instruct", {
        prompt,
        max_tokens: 256,
      });

      return JSON.parse(response.response);
    } catch (error) {
      return { anomalous: false, details: ["AI analysis unavailable"] };
    }
  }

  async checkTrustEscalation(chittyId) {
    const parts = chittyId.split("-");
    const currentTrust = parts[6]; // Trust level (L0-L5)

    // Check historical trust levels for this entity pattern
    const entityKey = `${parts[1]}-${parts[2]}-${parts[3]}`; // geo-legal-sequential
    const history = await this.authCache.get(`trust_history:${entityKey}`);

    if (!history) {
      return { escalation: false, reason: "No history available" };
    }

    const trustHistory = JSON.parse(history);
    const lastTrust = trustHistory.levels[trustHistory.levels.length - 1];

    const currentLevel = parseInt(currentTrust.slice(1));
    const lastLevel = parseInt(lastTrust.slice(1));

    // Flag suspicious trust escalations
    if (currentLevel > lastLevel + 1) {
      return {
        escalation: true,
        reason: "Suspicious trust level jump",
        from: lastTrust,
        to: currentTrust,
      };
    }

    return { escalation: false };
  }

  async checkPatternAnalysis(chittyId) {
    try {
      // Use vectorization for pattern similarity
      const embedding = await this.createEmbedding(chittyId);

      // Query similar IDs
      const similar = await this.vectors.query(embedding, {
        topK: 10,
        returnMetadata: true,
      });

      // Analyze pattern deviation
      const patterns = similar.matches.map((match) => match.metadata);

      return {
        similarityFound: similar.matches.length > 0,
        patterns: patterns.slice(0, 3), // Top 3 similar patterns
        deviation: this.calculatePatternDeviation(chittyId, patterns),
      };
    } catch (error) {
      return {
        similarityFound: false,
        error: "Vector analysis unavailable",
      };
    }
  }

  async checkRateLimit(chittyId) {
    const parts = chittyId.split("-");
    const sourceKey = `${parts[1]}-${parts[2]}`; // geo-legal combination

    const rateLimitKey = `rate_limit:${sourceKey}:${Math.floor(Date.now() / 60000)}`;
    const currentCount = await this.authCache.get(rateLimitKey);

    const count = currentCount ? parseInt(currentCount) + 1 : 1;
    await this.authCache.put(rateLimitKey, count.toString(), {
      expirationTtl: 120,
    });

    const limit = 100; // Max IDs per minute per geo-legal combo

    return {
      exceeded: count > limit,
      current: count,
      limit: limit,
      timeWindow: "1 minute",
    };
  }

  calculateRiskScore(checks) {
    let score = 0;

    if (checks[0].anomalous) score += 30;
    if (checks[1].escalation) score += 40;
    if (checks[2].deviation > 0.8) score += 20;
    if (checks[3].exceeded) score += 50;

    return Math.min(score, 100);
  }

  getThreatLevel(riskScore) {
    if (riskScore >= 80) return "CRITICAL";
    if (riskScore >= 60) return "HIGH";
    if (riskScore >= 40) return "MEDIUM";
    if (riskScore >= 20) return "LOW";
    return "MINIMAL";
  }

  determineAction(riskScore) {
    if (riskScore >= 80) return "BLOCK";
    if (riskScore >= 60) return "REQUIRE_ADDITIONAL_VERIFICATION";
    if (riskScore >= 40) return "FLAG_FOR_REVIEW";
    return "ALLOW";
  }

  async createEmbedding(chittyId) {
    const response = await this.ai.run("@cf/baai/bge-base-en-v1.5", {
      text: [chittyId],
    });
    return response.data[0];
  }

  calculatePatternDeviation(chittyId, patterns) {
    // Simple pattern deviation calculation
    if (!patterns.length) return 0;

    const parts = chittyId.split("-");
    let deviation = 0;

    patterns.forEach((pattern) => {
      const patternParts = pattern.id.split("-");
      if (parts[1] !== patternParts[1]) deviation += 0.2; // geo
      if (parts[2] !== patternParts[2]) deviation += 0.3; // legal
      if (parts[4] !== patternParts[4]) deviation += 0.3; // type
      if (parts[6] !== patternParts[6]) deviation += 0.2; // trust
    });

    return deviation / patterns.length;
  }

  async logSecurityEvent(chittyId, riskScore, checks) {
    const event = {
      chittyId,
      timestamp: Date.now(),
      riskScore,
      checks,
      threatLevel: this.getThreatLevel(riskScore),
    };

    await this.authCache.put(
      `security_event:${Date.now()}`,
      JSON.stringify(event),
      {
        expirationTtl: 86400, // 24 hours
      },
    );
  }

  async getStatus() {
    return {
      name: "Security Agent",
      status: "active",
      capabilities: [
        "anomaly_detection",
        "trust_escalation_check",
        "pattern_analysis",
        "rate_limiting",
      ],
      threatLevels: ["MINIMAL", "LOW", "MEDIUM", "HIGH", "CRITICAL"],
    };
  }

  async analyzeRequest(request) {
    try {
      const url = typeof request === "string" ? request : request.url;
      const headers =
        typeof request === "object" && request.headers
          ? Object.fromEntries(request.headers.entries())
          : {};

      // Analyze request with AI
      const aiAnalysis = await this.ai.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [
          {
            role: "system",
            content:
              "You are a security analyst. Analyze HTTP requests for threats and suspicious patterns.",
          },
          {
            role: "user",
            content: `Analyze this request for security threats:

URL: ${url}
Headers: ${JSON.stringify(headers)}

Return JSON with:
- threat_level: 'minimal', 'low', 'medium', 'high', or 'critical'
- threats: array of detected threats
- recommendations: array of security recommendations`,
          },
        ],
        max_tokens: 512,
      });

      const result = JSON.parse(aiAnalysis.response);

      // Log analysis to cache
      if (this.authCache) {
        await this.authCache.put(
          `security_analysis:${Date.now()}`,
          JSON.stringify({ url, analysis: result }),
          { expirationTtl: 3600 },
        );
      }

      return {
        threat_level: result.threat_level || "low",
        threats: result.threats || [],
        recommendations: result.recommendations || [],
        timestamp: new Date().toISOString(),
        analyzed_by: "ai",
      };
    } catch (error) {
      console.error("Request analysis failed:", error);
      return {
        threat_level: "low",
        threats: [],
        recommendations: ["Analysis unavailable"],
        error: error.message,
      };
    }
  }

  async validateJWT(token) {
    try {
      // Basic JWT structure validation
      const parts = token.split(".");
      if (parts.length !== 3) {
        return {
          valid: false,
          error: "Invalid JWT structure",
        };
      }

      // Decode header and payload (without verification)
      const header = JSON.parse(atob(parts[0]));
      const payload = JSON.parse(atob(parts[1]));

      // Basic validation checks
      const now = Math.floor(Date.now() / 1000);
      const isExpired = payload.exp && payload.exp < now;
      const isNotYetValid = payload.nbf && payload.nbf > now;

      return {
        valid: !isExpired && !isNotYetValid,
        header,
        payload,
        expired: isExpired,
        not_yet_valid: isNotYetValid,
        algorithm: header.alg,
        issued_at: payload.iat,
        expires_at: payload.exp,
      };
    } catch (error) {
      return {
        valid: false,
        error: "JWT parsing failed: " + error.message,
      };
    }
  }

  async trackAbuse(ip, pattern) {
    try {
      const cacheKey = `abuse:${ip}`;

      // Get existing abuse record
      const existingData = await this.authCache?.get(cacheKey);
      const abuse = existingData
        ? JSON.parse(existingData)
        : {
            ip,
            first_seen: new Date().toISOString(),
            patterns: [],
            count: 0,
          };

      // Update abuse record
      abuse.patterns.push({
        pattern,
        timestamp: new Date().toISOString(),
      });
      abuse.count += 1;
      abuse.last_seen = new Date().toISOString();

      // Determine if should be flagged
      const shouldFlag =
        abuse.count >= 3 ||
        abuse.patterns.some((p) => p.pattern.includes("suspicious"));

      // Store updated record
      if (this.authCache) {
        await this.authCache.put(cacheKey, JSON.stringify(abuse), {
          expirationTtl: 86400, // 24 hours
        });
      }

      return {
        flagged: shouldFlag,
        count: abuse.count,
        patterns: abuse.patterns.length,
        threat_level: shouldFlag ? "high" : "medium",
        recommendation: shouldFlag ? "block_ip" : "monitor",
      };
    } catch (error) {
      console.error("Abuse tracking failed:", error);
      return {
        flagged: false,
        error: error.message,
      };
    }
  }
}
