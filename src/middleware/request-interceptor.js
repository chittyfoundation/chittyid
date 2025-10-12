/**
 * Request Interceptor
 * Intercepts and validates all incoming requests before processing
 */

export class RequestInterceptor {
  constructor(env) {
    this.env = env;

    // Patterns that indicate ChittyID generation attempts
    this.generationPatterns = [
      /generate/i,
      /create.*id/i,
      /new.*chitty/i,
      /mint/i,
      /issue/i,
      /assign/i,
      /chittyid.*new/i,
      /id.*create/i,
    ];

    // Legacy endpoints that must be completely blocked
    this.blockedEndpoints = new Set([
      "/api/generate",
      "/api/create",
      "/api/create-id",
      "/api/new-id",
      "/api/mint",
      "/api/issue",
      "/api/direct-generate",
      "/api/bypass",
      "/legacy/",
      "/direct/",
      "/quick-generate",
      "/instant-id",
      "/admin/generate",
      "/api/admin/bypass",
      "/internal/create-id",
      "/system/override",
      "/debug/generate",
    ]);

    // Suspicious query parameters
    this.suspiciousParams = [
      "generate",
      "create",
      "bypass",
      "direct",
      "skip-pipeline",
      "quick",
      "instant",
      "legacy",
    ];
  }

  /**
   * Intercept and analyze all requests
   */
  async intercept(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Log all requests for audit
    await this.logRequest(request, url);

    // Check for blocked endpoints
    if (this.isBlockedEndpoint(path)) {
      await this.logSecurityEvent("BLOCKED_ENDPOINT", request, { path });
      return this.createBlockedResponse("ENDPOINT_PERMANENTLY_DISABLED", path);
    }

    // Check for suspicious patterns in URL
    const suspiciousUrl = this.checkSuspiciousUrl(url);
    if (suspiciousUrl.suspicious) {
      await this.logSecurityEvent("SUSPICIOUS_URL", request, suspiciousUrl);
      return this.createBlockedResponse("SUSPICIOUS_PATTERN_DETECTED", path);
    }

    // Check for bypass attempts in headers
    const bypassAttempt = this.checkBypassHeaders(request);
    if (bypassAttempt.detected) {
      await this.logSecurityEvent("BYPASS_ATTEMPT", request, bypassAttempt);
      return this.createBlockedResponse("BYPASS_ATTEMPT_DETECTED", path);
    }

    // Check request body for generation attempts
    if (method === "POST" || method === "PUT") {
      const bodyBypass = await this.checkBodyBypass(request);
      if (bodyBypass.detected) {
        await this.logSecurityEvent("BODY_BYPASS_ATTEMPT", request, bodyBypass);
        return this.createBlockedResponse("GENERATION_IN_BODY_BLOCKED", path);
      }
    }

    // Check for weak authentication tokens
    const weakAuth = this.checkWeakAuth(request);
    if (weakAuth.detected) {
      await this.logSecurityEvent("WEAK_AUTH", request, weakAuth);
      return this.createBlockedResponse("API_KEY_ABUSE_DETECTED", path);
    }

    // Check for API key abuse
    const apiKeyAbuse = await this.checkApiKeyAbuse(request);
    if (apiKeyAbuse.detected) {
      await this.logSecurityEvent("API_KEY_ABUSE", request, apiKeyAbuse);
      return this.createBlockedResponse("API_KEY_ABUSE_DETECTED", path);
    }

    // Rate limiting based on source
    const rateLimitExceeded = await this.checkRateLimit(request);
    if (rateLimitExceeded.exceeded) {
      await this.logSecurityEvent(
        "RATE_LIMIT_EXCEEDED",
        request,
        rateLimitExceeded,
      );
      return this.createBlockedResponse("RATE_LIMIT_EXCEEDED", path);
    }

    // Request passes all security checks
    return null; // Allow through
  }

  /**
   * Check if endpoint is permanently blocked
   */
  isBlockedEndpoint(path) {
    // Exact match
    if (this.blockedEndpoints.has(path)) {
      return true;
    }

    // Pattern match
    const normalizedPath = path.toLowerCase();
    for (const blocked of this.blockedEndpoints) {
      if (normalizedPath.includes(blocked.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check for suspicious URL patterns
   */
  checkSuspiciousUrl(url) {
    const path = url.pathname.toLowerCase();
    const search = url.search.toLowerCase();
    const hash = url.hash.toLowerCase();
    const fullUrl = url.toString().toLowerCase();

    // Check path for generation patterns
    for (const pattern of this.generationPatterns) {
      if (pattern.test(path)) {
        return {
          suspicious: true,
          reason: "GENERATION_PATTERN_IN_PATH",
          pattern: pattern.toString(),
          location: "path",
        };
      }
    }

    // Check query parameters
    for (const param of this.suspiciousParams) {
      if (search.includes(param)) {
        return {
          suspicious: true,
          reason: "SUSPICIOUS_QUERY_PARAM",
          param,
          location: "query",
        };
      }
    }

    // Check for bypass keywords in full URL
    const bypassKeywords = [
      "skip-auth",
      "no-pipeline",
      "direct-access",
      "bypass-security",
      "admin-override",
      "emergency-generate",
    ];

    for (const keyword of bypassKeywords) {
      if (fullUrl.includes(keyword)) {
        return {
          suspicious: true,
          reason: "BYPASS_KEYWORD",
          keyword,
          location: "url",
        };
      }
    }

    return { suspicious: false };
  }

  /**
   * Check for bypass attempts in headers
   */
  checkBypassHeaders(request) {
    const suspiciousHeaders = [
      "x-bypass-pipeline",
      "x-skip-auth",
      "x-admin-override",
      "x-emergency-access",
      "x-direct-generate",
      "x-direct-access",
      "x-legacy-mode",
      "x-force-generate",
      "x-emergency-generate",
      "x-no-validation",
      "x-user-role",
      "x-privilege-level",
      "x-access-level",
      "x-authorization-override",
    ];

    for (const [name, value] of request.headers) {
      const headerName = name.toLowerCase();

      // Check for suspicious header names
      if (suspiciousHeaders.includes(headerName)) {
        return {
          detected: true,
          reason: "SUSPICIOUS_HEADER",
          header: name,
          value,
        };
      }

      // Check for privilege escalation attempts
      if (
        headerName.includes("role") ||
        headerName.includes("privilege") ||
        headerName.includes("access-level") ||
        headerName.includes("authorization-override")
      ) {
        if (
          value.toLowerCase().includes("admin") ||
          value.toLowerCase().includes("root") ||
          value.toLowerCase().includes("system") ||
          value.toLowerCase().includes("superuser")
        ) {
          return {
            detected: true,
            reason: "PRIVILEGE_ESCALATION_ATTEMPT",
            header: name,
            value,
          };
        }
      }

      // Check for bypass patterns in header values
      const headerValue = value.toLowerCase();
      if (
        headerValue.includes("bypass") ||
        headerValue.includes("skip") ||
        headerValue.includes("override")
      ) {
        return {
          detected: true,
          reason: "BYPASS_IN_HEADER_VALUE",
          header: name,
          value,
        };
      }
    }

    return { detected: false };
  }

  /**
   * Check request body for generation attempts
   */
  async checkBodyBypass(request) {
    try {
      // Clone request to read body without consuming it
      const clonedRequest = request.clone();
      const body = await clonedRequest.text();

      if (!body) {
        return { detected: false };
      }

      const bodyLower = body.toLowerCase();

      // Check for generation keywords in body
      const generationKeywords = [
        "generate",
        "create",
        "bypass",
        "skip-pipeline",
        "direct-create",
        "force-generate",
        "admin-generate",
      ];

      for (const keyword of generationKeywords) {
        if (bodyLower.includes(keyword)) {
          return {
            detected: true,
            reason: "GENERATION_KEYWORD_IN_BODY",
            keyword,
            snippet: body.substring(0, 200), // First 200 chars for logging
          };
        }
      }

      // Check for JSON with suspicious fields
      try {
        const json = JSON.parse(body);
        const suspiciousFields = [
          "bypassPipeline",
          "skipAuth",
          "directGenerate",
          "forceCreate",
          "adminOverride",
        ];

        for (const field of suspiciousFields) {
          if (json.hasOwnProperty(field)) {
            return {
              detected: true,
              reason: "SUSPICIOUS_JSON_FIELD",
              field,
              value: json[field],
            };
          }
        }
      } catch {
        // Not JSON, continue with text analysis
      }

      return { detected: false };
    } catch (error) {
      console.error("Body bypass check error:", error);
      return { detected: false };
    }
  }

  /**
   * Check for weak authentication tokens
   */
  checkWeakAuth(request) {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return { detected: false };
    }

    const token = authHeader.substring(7);

    // Check for weak tokens
    const weakTokens = [
      "123",
      "password",
      "admin",
      "test",
      "aaaaaa",
      "1234567890",
    ];
    if (weakTokens.includes(token)) {
      return {
        detected: true,
        reason: "WEAK_TOKEN",
        token: token.substring(0, 3) + "...",
      };
    }

    // Check for predictable patterns
    if (token.length < 10 || /^(\d+|[a-z]+|[A-Z]+)$/.test(token)) {
      return {
        detected: true,
        reason: "PREDICTABLE_TOKEN",
        pattern: "simple",
      };
    }

    return { detected: false };
  }

  /**
   * Check for API key abuse patterns
   */
  async checkApiKeyAbuse(request) {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
      return { detected: false };
    }

    const token = authHeader.replace(/Bearer\s+/i, "");

    // Check if token is in abuse cache
    const cache = this.env.PLATFORM_CACHE || this.env.PLATFORM_CACHE;
    const abuseData = cache ? await cache.get(`abuse:token:${token}`) : null;
    if (abuseData) {
      const abuse = JSON.parse(abuseData);
      if (abuse.blocked) {
        return {
          detected: true,
          reason: "TOKEN_PREVIOUSLY_FLAGGED",
          attempts: abuse.attempts,
          lastAttempt: abuse.lastAttempt,
        };
      }
    }

    // Check for suspicious token patterns
    if (token.length < 10) {
      return {
        detected: true,
        reason: "TOKEN_TOO_SHORT",
        length: token.length,
      };
    }

    // Check for test/demo tokens in production
    const testPatterns = [
      /test/i,
      /demo/i,
      /sample/i,
      /fake/i,
      /mock/i,
      /dev/i,
    ];

    for (const pattern of testPatterns) {
      if (pattern.test(token)) {
        return {
          detected: true,
          reason: "TEST_TOKEN_IN_PRODUCTION",
          pattern: pattern.toString(),
        };
      }
    }

    return { detected: false };
  }

  /**
   * Check rate limiting
   */
  async checkRateLimit(request) {
    const ip =
      request.headers.get("CF-Connecting-IP") ||
      request.headers.get("X-Forwarded-For")?.split(",")[0] ||
      "unknown";

    // Different rate limits for different endpoints
    const url = new URL(request.url);
    const endpoint = url.pathname;

    let limit, window, rateLimitKey;

    if (endpoint === "/api/get-chittyid") {
      // Stricter limits for ChittyID generation
      limit = 10;
      window = 60; // 10 requests per minute
      rateLimitKey = `rate:generation:${ip}`;
    } else if (endpoint.startsWith("/api/")) {
      // Standard API rate limits
      limit = 100;
      window = 60; // 100 requests per minute
      rateLimitKey = `rate:api:${ip}`;
    } else {
      // General rate limits
      limit = 200;
      window = 60; // 200 requests per minute
      rateLimitKey = `rate:general:${ip}`;
    }

    try {
      const cache = this.env.PLATFORM_CACHE || this.env.PLATFORM_CACHE;
      const current = cache ? await cache.get(rateLimitKey) : null;
      const requests = current ? parseInt(current) : 0;

      if (requests >= limit) {
        // Log rate limit violation
        await this.logSecurityEvent("RATE_LIMIT_EXCEEDED", request, {
          ip,
          requests,
          limit,
          endpoint,
        });

        return {
          exceeded: true,
          requests,
          limit,
          window,
          ip,
          endpoint,
        };
      }

      // Increment counter with sliding window
      if (cache) {
        await cache.put(rateLimitKey, (requests + 1).toString(), {
          expirationTtl: window,
        });
      }

      return { exceeded: false, requests: requests + 1, limit };
    } catch (error) {
      // If rate limiting fails, allow through but log error
      console.error("Rate limiting error:", error);
      return { exceeded: false, error: true };
    }
  }

  /**
   * Log security events
   */
  async logSecurityEvent(eventType, request, details) {
    const event = {
      timestamp: new Date().toISOString(),
      type: eventType,
      url: request.url,
      method: request.method,
      ip: request.headers.get("CF-Connecting-IP"),
      userAgent: request.headers.get("User-Agent"),
      referer: request.headers.get("Referer"),
      details,
    };

    // Store security event and increment counter
    const cache = this.env.PLATFORM_CACHE;
    if (cache) {
      await cache.put(
        `security:${eventType}:${Date.now()}`,
        JSON.stringify(event),
        { expirationTtl: 86400 * 30 }, // Keep for 30 days
      );

      // Increment security counter
      const counterKey = `metrics:security:${eventType}`;
      const current = await cache.get(counterKey);
      const count = current ? parseInt(current) + 1 : 1;

      await cache.put(counterKey, count.toString(), {
        expirationTtl: 86400,
      });
    }
  }

  /**
   * Log all requests for audit
   */
  async logRequest(request, url) {
    const log = {
      timestamp: new Date().toISOString(),
      method: request.method,
      path: url.pathname,
      query: url.search,
      ip: request.headers.get("CF-Connecting-IP"),
      userAgent: request.headers.get("User-Agent"),
    };

    // Store request log (sampling for performance)
    const cache = this.env.PLATFORM_CACHE;
    if (cache && Math.random() < 0.1) {
      // Log 10% of requests
      await cache.put(
        `audit:request:${Date.now()}`,
        JSON.stringify(log),
        { expirationTtl: 86400 * 7 }, // Keep for 7 days
      );
    }
  }

  /**
   * Create blocked response
   */
  createBlockedResponse(reason, path) {
    const responses = {
      ENDPOINT_PERMANENTLY_DISABLED: {
        status: 410,
        title: "Endpoint Permanently Disabled",
        message:
          "This endpoint has been permanently disabled for security reasons.",
        action: "Use the mandatory pipeline: GET /api/get-chittyid",
      },
      SUSPICIOUS_PATTERN_DETECTED: {
        status: 403,
        title: "Suspicious Pattern Detected",
        message:
          "The request contains patterns associated with bypass attempts.",
        action: "Use proper authentication and pipeline flow",
      },
      BYPASS_ATTEMPT_DETECTED: {
        status: 403,
        title: "Bypass Attempt Detected",
        message:
          "Request headers indicate an attempt to bypass security controls.",
        action: "Remove bypass headers and use proper authentication",
      },
      GENERATION_IN_BODY_BLOCKED: {
        status: 403,
        title: "Direct Generation Blocked",
        message: "Request body contains direct generation attempts.",
        action: "Use the pipeline API: GET /api/get-chittyid",
      },
      API_KEY_ABUSE_DETECTED: {
        status: 403,
        title: "API Key Abuse Detected",
        message:
          "The provided API key has been flagged for suspicious activity.",
        action: "Contact support for API key review",
      },
      RATE_LIMIT_EXCEEDED: {
        status: 429,
        title: "Rate Limit Exceeded",
        message: "Too many requests. Please slow down.",
        action: "Wait before making additional requests",
      },
    };

    const response = responses[reason] || {
      status: 403,
      title: "Request Blocked",
      message: "This request has been blocked by security controls.",
      action: "Use proper authentication and pipeline flow",
    };

    return new Response(
      JSON.stringify({
        success: false,
        error: "REQUEST_BLOCKED",
        reason,
        ...response,
        security: {
          enforcementLevel: "MAXIMUM",
          bypassable: false,
          pipeline: {
            required: true,
            stages: [
              "router",
              "intake",
              "trust",
              "authorization",
              "generation",
            ],
          },
        },
        blockedAt: new Date().toISOString(),
        path,
      }),
      {
        status: response.status,
        headers: {
          "Content-Type": "application/json",
          "X-Security-Block": "true",
          "X-Block-Reason": reason,
          "X-Pipeline-Required": "true",
          "X-ChittyOS-Service": "chittyid-mothership",
        },
      },
    );
  }
}

/**
 * Middleware factory for request interception
 */
export function createRequestInterceptor(env) {
  const interceptor = new RequestInterceptor(env);

  return async (request) => {
    return interceptor.intercept(request);
  };
}
