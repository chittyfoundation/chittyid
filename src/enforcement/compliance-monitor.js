/**
 * Compliance Monitor for Pipeline Enforcement
 * Ensures 100% compliance with mandatory pipeline architecture
 */

export class ComplianceMonitor {
  constructor(env) {
    this.env = env;
    this.complianceRules = {
      // RULE 1: No ChittyID generation without pipeline
      mandatoryPipeline: true,

      // RULE 2: All stages must be completed
      requiredStages: [
        "router",
        "intake",
        "trust",
        "authorization",
        "generation",
      ],

      // RULE 3: Session validation is mandatory
      sessionRequired: true,

      // RULE 4: Authentication is mandatory
      authRequired: true,

      // RULE 5: No bypass mechanisms allowed
      bypassProhibited: true,
    };

    this.violations = new Map();
    this.alerts = [];
  }

  /**
   * Monitor compliance for all requests
   */
  async monitor(request, stage, context = {}) {
    const monitoringId = this.generateMonitoringId();
    const timestamp = new Date().toISOString();

    try {
      // Check each compliance rule
      const violations = await this.checkCompliance(request, stage, context);

      if (violations.length > 0) {
        await this.recordViolations(monitoringId, violations, request, stage);
        await this.triggerAlerts(violations, request, stage);

        return {
          compliant: false,
          violations,
          monitoringId,
          action: "BLOCK",
        };
      }

      // Record successful compliance
      await this.recordCompliance(monitoringId, request, stage, context);

      return {
        compliant: true,
        monitoringId,
        action: "ALLOW",
      };
    } catch (error) {
      console.error("Compliance monitoring error:", error);

      // Fail secure - block if monitoring fails
      return {
        compliant: false,
        violations: [
          {
            rule: "MONITORING_FAILURE",
            severity: "CRITICAL",
            message: "Compliance monitoring system failure",
          },
        ],
        monitoringId,
        action: "BLOCK",
      };
    }
  }

  /**
   * Check all compliance rules
   */
  async checkCompliance(request, stage, context) {
    const violations = [];

    // RULE 1: Mandatory Pipeline Check
    if (this.isGenerationRequest(request)) {
      const pipelineViolation = await this.checkMandatoryPipeline(
        request,
        context,
      );
      if (pipelineViolation) {
        violations.push(pipelineViolation);
      }
    }

    // RULE 2: Stage Completion Check
    const stageViolation = await this.checkStageCompletion(
      request,
      stage,
      context,
    );
    if (stageViolation) {
      violations.push(stageViolation);
    }

    // RULE 3: Session Validation Check
    const sessionViolation = await this.checkSessionRequirement(
      request,
      context,
    );
    if (sessionViolation) {
      violations.push(sessionViolation);
    }

    // RULE 4: Authentication Check
    const authViolation = await this.checkAuthRequirement(request, context);
    if (authViolation) {
      violations.push(authViolation);
    }

    // RULE 5: Bypass Detection Check
    const bypassViolation = await this.checkBypassAttempts(request, context);
    if (bypassViolation) {
      violations.push(bypassViolation);
    }

    return violations;
  }

  /**
   * Check if request is for ChittyID generation
   */
  isGenerationRequest(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    return (
      path.includes("get-chittyid") ||
      path.includes("generate") ||
      path.includes("create") ||
      path.includes("mint")
    );
  }

  /**
   * Check mandatory pipeline compliance
   */
  async checkMandatoryPipeline(request, context) {
    if (!this.complianceRules.mandatoryPipeline) {
      return null;
    }

    // Check if request has pipeline context
    const sessionId = request.headers.get("X-Session-ID");
    const pipelineToken = request.headers.get("X-Pipeline-Token");

    if (!sessionId || !pipelineToken) {
      return {
        rule: "MANDATORY_PIPELINE",
        severity: "CRITICAL",
        message: "ChittyID generation requires completed pipeline",
        details: {
          missingSessionId: !sessionId,
          missingPipelineToken: !pipelineToken,
        },
      };
    }

    // Verify pipeline completion in session
    const sessionData = await this.env.MCP_SESSIONS.get(`session:${sessionId}`);
    if (!sessionData) {
      return {
        rule: "MANDATORY_PIPELINE",
        severity: "CRITICAL",
        message: "Invalid or expired session",
        details: { sessionId },
      };
    }

    const session = JSON.parse(sessionData);
    const completedStages = session.pipeline?.completedStages || [];

    const missingStages = this.complianceRules.requiredStages.filter(
      (stage) => !completedStages.includes(stage),
    );

    if (missingStages.length > 0) {
      return {
        rule: "MANDATORY_PIPELINE",
        severity: "CRITICAL",
        message: "Pipeline stages incomplete",
        details: {
          completed: completedStages,
          missing: missingStages,
          required: this.complianceRules.requiredStages,
        },
      };
    }

    return null;
  }

  /**
   * Check stage completion requirements
   */
  async checkStageCompletion(request, stage, context) {
    // This would check stage-specific requirements
    // For now, basic validation
    return null;
  }

  /**
   * Check session requirement compliance
   */
  async checkSessionRequirement(request, context) {
    if (!this.complianceRules.sessionRequired) {
      return null;
    }

    const sessionId = request.headers.get("X-Session-ID");

    if (!sessionId) {
      return {
        rule: "SESSION_REQUIRED",
        severity: "HIGH",
        message: "Session ID is required for all ChittyID operations",
      };
    }

    // Verify session exists and is valid
    const sessionData = await this.env.MCP_SESSIONS.get(`session:${sessionId}`);
    if (!sessionData) {
      return {
        rule: "SESSION_REQUIRED",
        severity: "HIGH",
        message: "Session is invalid or expired",
        details: { sessionId },
      };
    }

    return null;
  }

  /**
   * Check authentication requirement compliance
   */
  async checkAuthRequirement(request, context) {
    if (!this.complianceRules.authRequired) {
      return null;
    }

    const authHeader = request.headers.get("Authorization");

    if (!authHeader) {
      return {
        rule: "AUTH_REQUIRED",
        severity: "HIGH",
        message: "Authentication is required for ChittyID operations",
      };
    }

    // Basic auth header format check
    if (!authHeader.startsWith("Bearer ")) {
      return {
        rule: "AUTH_REQUIRED",
        severity: "HIGH",
        message: "Invalid authentication format",
        details: { format: "Bearer token required" },
      };
    }

    return null;
  }

  /**
   * Check for bypass attempts
   */
  async checkBypassAttempts(request, context) {
    if (!this.complianceRules.bypassProhibited) {
      return null;
    }

    // Check for bypass headers
    const suspiciousHeaders = [
      "x-bypass-pipeline",
      "x-skip-auth",
      "x-admin-override",
      "x-emergency-access",
    ];

    for (const [name, value] of request.headers) {
      if (suspiciousHeaders.includes(name.toLowerCase())) {
        return {
          rule: "BYPASS_PROHIBITED",
          severity: "CRITICAL",
          message: "Bypass attempts are strictly prohibited",
          details: {
            header: name,
            value: value.substring(0, 50), // Truncate for logging
          },
        };
      }
    }

    // Check URL for bypass parameters
    const url = new URL(request.url);
    const suspiciousParams = ["bypass", "skip", "override", "direct"];

    for (const param of suspiciousParams) {
      if (url.searchParams.has(param)) {
        return {
          rule: "BYPASS_PROHIBITED",
          severity: "CRITICAL",
          message: "Bypass parameters are strictly prohibited",
          details: {
            parameter: param,
            value: url.searchParams.get(param),
          },
        };
      }
    }

    return null;
  }

  /**
   * Record compliance violations
   */
  async recordViolations(monitoringId, violations, request, stage) {
    const violationRecord = {
      id: monitoringId,
      timestamp: new Date().toISOString(),
      url: request.url,
      method: request.method,
      stage,
      violations,
      severity: this.getMaxSeverity(violations),
      ip: request.headers.get("CF-Connecting-IP"),
      userAgent: request.headers.get("User-Agent"),
    };

    // Store violation record
    await this.env.PLATFORM_CACHE.put(
      `compliance:violation:${monitoringId}`,
      JSON.stringify(violationRecord),
      { expirationTtl: 86400 * 90 }, // Keep for 90 days
    );

    // Update violation counters
    for (const violation of violations) {
      const counterKey = `metrics:violations:${violation.rule}`;
      const current = await this.env.PLATFORM_CACHE.get(counterKey);
      const count = current ? parseInt(current) + 1 : 1;

      await this.env.PLATFORM_CACHE.put(counterKey, count.toString(), {
        expirationTtl: 86400,
      });
    }
  }

  /**
   * Record successful compliance
   */
  async recordCompliance(monitoringId, request, stage, context) {
    const complianceRecord = {
      id: monitoringId,
      timestamp: new Date().toISOString(),
      url: request.url,
      method: request.method,
      stage,
      status: "COMPLIANT",
    };

    // Store compliance record (sampling for performance)
    if (Math.random() < 0.1) {
      // Sample 10%
      await this.env.PLATFORM_CACHE.put(
        `compliance:success:${monitoringId}`,
        JSON.stringify(complianceRecord),
        { expirationTtl: 86400 * 7 }, // Keep for 7 days
      );
    }

    // Update compliance counter
    const counterKey = "metrics:compliance:success";
    const current = await this.env.PLATFORM_CACHE.get(counterKey);
    const count = current ? parseInt(current) + 1 : 1;

    await this.env.PLATFORM_CACHE.put(counterKey, count.toString(), {
      expirationTtl: 86400,
    });
  }

  /**
   * Trigger alerts for violations
   */
  async triggerAlerts(violations, request, stage) {
    const criticalViolations = violations.filter(
      (v) => v.severity === "CRITICAL",
    );

    if (criticalViolations.length > 0) {
      const alert = {
        timestamp: new Date().toISOString(),
        type: "COMPLIANCE_VIOLATION",
        severity: "CRITICAL",
        stage,
        url: request.url,
        violations: criticalViolations,
        ip: request.headers.get("CF-Connecting-IP"),
      };

      // Store alert
      await this.env.PLATFORM_CACHE.put(
        `alert:compliance:${Date.now()}`,
        JSON.stringify(alert),
        { expirationTtl: 86400 * 30 }, // Keep alerts for 30 days
      );

      console.error("CRITICAL COMPLIANCE VIOLATION:", alert);
    }
  }

  /**
   * Get maximum severity from violations
   */
  getMaxSeverity(violations) {
    const severityLevels = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
    let maxLevel = 0;
    let maxSeverity = "LOW";

    for (const violation of violations) {
      const level = severityLevels[violation.severity] || 1;
      if (level > maxLevel) {
        maxLevel = level;
        maxSeverity = violation.severity;
      }
    }

    return maxSeverity;
  }

  /**
   * Generate unique monitoring ID
   */
  generateMonitoringId() {
    return `monitor-${Date.now()}`;
  }

  /**
   * Get compliance statistics
   */
  async getComplianceStats() {
    const stats = {
      violations: {},
      totalCompliant: 0,
      totalViolations: 0,
    };

    // Get violation counts
    const violationKeys = await this.env.PLATFORM_CACHE.list({
      prefix: "metrics:violations:",
    });
    for (const key of violationKeys.keys) {
      const rule = key.name.replace("metrics:violations:", "");
      const count = await this.env.PLATFORM_CACHE.get(key.name);
      stats.violations[rule] = parseInt(count) || 0;
      stats.totalViolations += stats.violations[rule];
    }

    // Get compliance count
    const complianceCount = await this.env.PLATFORM_CACHE.get(
      "metrics:compliance:success",
    );
    stats.totalCompliant = parseInt(complianceCount) || 0;

    // Calculate compliance rate
    const total = stats.totalCompliant + stats.totalViolations;
    stats.complianceRate =
      total > 0 ? (stats.totalCompliant / total) * 100 : 100;

    return stats;
  }

  /**
   * Reset compliance monitoring (admin function)
   */
  async resetMonitoring() {
    // Clear violation counters
    const violationKeys = await this.env.PLATFORM_CACHE.list({
      prefix: "metrics:violations:",
    });
    for (const key of violationKeys.keys) {
      await this.env.PLATFORM_CACHE.delete(key.name);
    }

    // Clear compliance counter
    await this.env.PLATFORM_CACHE.delete("metrics:compliance:success");

    console.log("Compliance monitoring statistics reset");
  }

  /**
   * Generate comprehensive compliance report
   */
  async generateComplianceReport(request) {
    const reportId = `report-${Date.now()}`;
    const stats = await this.getComplianceStats();

    // Get recent violations
    const violationKeys = await this.env.PLATFORM_CACHE.list({
      prefix: "compliance:violation:",
      limit: 100,
    });

    const violations = [];
    for (const key of violationKeys.keys) {
      const data = await this.env.PLATFORM_CACHE.get(key.name);
      if (data) violations.push(JSON.parse(data));
    }

    const report = {
      id: reportId,
      timestamp: new Date().toISOString(),
      period: {
        start: new Date(Date.now() - 86400000 * 30).toISOString(), // Last 30 days
        end: new Date().toISOString(),
      },
      statistics: stats,
      recentViolations: violations.slice(0, 10),
      complianceLevel:
        stats.complianceRate >= 99
          ? "EXCELLENT"
          : stats.complianceRate >= 95
            ? "GOOD"
            : stats.complianceRate >= 90
              ? "ACCEPTABLE"
              : "POOR",
      recommendations: this.generateRecommendations(stats, violations),
    };

    // Store the report
    await this.env.PLATFORM_CACHE.put(
      `compliance:report:${reportId}`,
      JSON.stringify(report),
      { expirationTtl: 86400 * 90 }, // Keep for 90 days
    );

    return report;
  }

  /**
   * Generate compliance recommendations
   */
  generateRecommendations(stats, violations) {
    const recommendations = [];

    if (stats.complianceRate < 95) {
      recommendations.push({
        priority: "HIGH",
        action: "Increase monitoring and enforcement",
        reason: "Compliance rate below target threshold",
      });
    }

    // Check for frequent violation types
    for (const [rule, count] of Object.entries(stats.violations)) {
      if (count > 10) {
        recommendations.push({
          priority: "MEDIUM",
          action: `Review and address ${rule} violations`,
          reason: `High frequency of ${rule} violations (${count})`,
        });
      }
    }

    return recommendations;
  }

  /**
   * SOX Segregation of Duties check
   */
  async segregationOfDuties(request, action) {
    const userId = request.headers.get("X-User-ID");
    const role = request.headers.get("X-User-Role");

    // SOX requires separation between development and production access
    const restrictedCombinations = {
      developer: ["production_deploy", "financial_approval"],
      admin: ["code_commit", "audit_modify"],
      auditor: ["system_modify", "data_delete"],
    };

    if (role && restrictedCombinations[role]) {
      if (restrictedCombinations[role].includes(action)) {
        return {
          compliant: false,
          violation: {
            rule: "SOX_SEGREGATION_OF_DUTIES",
            severity: "CRITICAL",
            message: `Role ${role} cannot perform action ${action}`,
            details: {
              userId,
              role,
              action,
              requirement: "SOX Section 404",
            },
          },
        };
      }
    }

    // Log the action for audit trail
    await this.env.PLATFORM_CACHE.put(
      `sox:audit:${Date.now()}`,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        userId,
        role,
        action,
        result: "ALLOWED",
      }),
      { expirationTtl: 86400 * 2555 }, // Keep for 7 years per SOX
    );

    return { compliant: true };
  }

  /**
   * HIPAA Minimum Necessary check
   */
  async minimumNecessary(request, dataRequested) {
    const userId = request.headers.get("X-User-ID");
    const purpose = request.headers.get("X-Access-Purpose");
    const role = request.headers.get("X-User-Role");

    // HIPAA requires limiting data access to minimum necessary
    const dataClassification = this.classifyData(dataRequested);

    if (dataClassification === "PHI" || dataClassification === "PII") {
      // Check if user has legitimate purpose
      if (!purpose || purpose === "general") {
        return {
          compliant: false,
          violation: {
            rule: "HIPAA_MINIMUM_NECESSARY",
            severity: "HIGH",
            message: "Access to PHI/PII requires specific purpose",
            details: {
              userId,
              dataRequested,
              classification: dataClassification,
            },
          },
        };
      }

      // Check role-based access
      const allowedRoles = ["healthcare_provider", "billing", "admin"];
      if (!allowedRoles.includes(role)) {
        return {
          compliant: false,
          violation: {
            rule: "HIPAA_MINIMUM_NECESSARY",
            severity: "HIGH",
            message: "Role not authorized for PHI/PII access",
            details: {
              userId,
              role,
              dataRequested,
            },
          },
        };
      }

      // Log access for audit
      await this.env.PLATFORM_CACHE.put(
        `hipaa:access:${Date.now()}`,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          userId,
          role,
          purpose,
          dataAccessed: dataRequested,
          classification: dataClassification,
        }),
        { expirationTtl: 86400 * 2190 }, // Keep for 6 years per HIPAA
      );
    }

    return { compliant: true };
  }

  /**
   * Classify data type for compliance
   */
  classifyData(data) {
    // Check for PHI indicators
    if (
      data.includes("medical") ||
      data.includes("health") ||
      data.includes("diagnosis") ||
      data.includes("treatment")
    ) {
      return "PHI";
    }

    // Check for PII indicators
    if (
      data.includes("ssn") ||
      data.includes("social_security") ||
      data.includes("date_of_birth") ||
      data.includes("address")
    ) {
      return "PII";
    }

    // Check for financial data
    if (
      data.includes("credit_card") ||
      data.includes("bank_account") ||
      data.includes("payment")
    ) {
      return "FINANCIAL";
    }

    return "GENERAL";
  }

  /**
   * PCI DSS Log Data Sanitization
   */
  sanitizeLogData(data) {
    if (!data) return data;

    // Convert to string for processing
    let sanitized =
      typeof data === "object" ? JSON.stringify(data) : String(data);

    // PCI DSS requires masking of sensitive data in logs
    const patterns = [
      // Credit card numbers (keep first 6 and last 4 digits)
      {
        regex: /\b(\d{6})\d{6}(\d{4})\b/g,
        replacement: "$1******$2",
      },
      // CVV codes (completely mask)
      {
        regex: /\b(cvv|cvc|cvv2|cvc2)[:\s]*\d{3,4}\b/gi,
        replacement: "$1:***",
      },
      // SSN (mask middle digits)
      {
        regex: /\b(\d{3})-?(\d{2})-?(\d{4})\b/g,
        replacement: "$1-**-$3",
      },
      // API Keys and tokens
      {
        regex:
          /(api[_-]?key|token|secret)[:\s]*["']?([a-zA-Z0-9]{8})[a-zA-Z0-9]+["']?/gi,
        replacement: "$1:$2********",
      },
      // Email addresses (partial masking)
      {
        regex:
          /\b([a-zA-Z0-9._%+-]{1,3})[a-zA-Z0-9._%+-]*@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g,
        replacement: "$1***@$2",
      },
      // Phone numbers
      {
        regex: /\b(\d{3})[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
        replacement: "$1-***-****",
      },
    ];

    // Apply all sanitization patterns
    for (const pattern of patterns) {
      sanitized = sanitized.replace(pattern.regex, pattern.replacement);
    }

    // Parse back to object if original was object
    if (typeof data === "object") {
      try {
        return JSON.parse(sanitized);
      } catch {
        return sanitized;
      }
    }

    return sanitized;
  }

  /**
   * ISO 27001 Risk Assessment
   */
  async assessRisk(request, context) {
    const riskFactors = {
      authentication: 0,
      authorization: 0,
      dataClassification: 0,
      accessPattern: 0,
      geolocation: 0,
    };

    // Check authentication strength
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
      riskFactors.authentication = 10;
    } else if (authHeader.includes("Basic")) {
      riskFactors.authentication = 5;
    } else if (authHeader.includes("Bearer")) {
      riskFactors.authentication = 2;
    }

    // Check authorization level
    const role = request.headers.get("X-User-Role");
    if (role === "admin" || role === "root") {
      riskFactors.authorization = 8;
    } else if (role === "user") {
      riskFactors.authorization = 3;
    } else {
      riskFactors.authorization = 5;
    }

    // Check data classification
    const dataType = context.dataType || "general";
    if (dataType === "confidential" || dataType === "restricted") {
      riskFactors.dataClassification = 9;
    } else if (dataType === "internal") {
      riskFactors.dataClassification = 5;
    } else {
      riskFactors.dataClassification = 2;
    }

    // Check access pattern anomalies
    const ip = request.headers.get("CF-Connecting-IP");
    const accessKey = `access:pattern:${ip}`;
    const recentAccess = await this.env.PLATFORM_CACHE.get(accessKey);

    if (recentAccess) {
      const accessCount = parseInt(recentAccess);
      if (accessCount > 100) {
        riskFactors.accessPattern = 8;
      } else if (accessCount > 50) {
        riskFactors.accessPattern = 5;
      }
    }

    // Update access counter
    await this.env.PLATFORM_CACHE.put(
      accessKey,
      String((parseInt(recentAccess) || 0) + 1),
      { expirationTtl: 3600 }, // Reset hourly
    );

    // Check geolocation risk
    const country = request.headers.get("CF-IPCountry");
    const highRiskCountries = ["XX", "T1"]; // Tor, proxy
    if (highRiskCountries.includes(country)) {
      riskFactors.geolocation = 10;
    }

    // Calculate overall risk score
    const totalRisk = Object.values(riskFactors).reduce(
      (sum, risk) => sum + risk,
      0,
    );
    const maxRisk = Object.keys(riskFactors).length * 10;
    const riskPercentage = (totalRisk / maxRisk) * 100;

    return {
      riskScore: riskPercentage,
      riskLevel:
        riskPercentage > 70 ? "HIGH" : riskPercentage > 40 ? "MEDIUM" : "LOW",
      factors: riskFactors,
      recommendation:
        riskPercentage > 70
          ? "BLOCK"
          : riskPercentage > 40
            ? "ADDITIONAL_VERIFICATION"
            : "ALLOW",
    };
  }
}

/**
 * Middleware factory for compliance monitoring
 */
export function createComplianceMonitor(env) {
  const monitor = new ComplianceMonitor(env);

  return async (request, stage, context = {}) => {
    return monitor.monitor(request, stage, context);
  };
}
