/**
 * ChittyOS Service Registry
 * Central service discovery and health monitoring for the ecosystem
 */

import { ChittyConfig } from "../config/index.js";

export class ServiceRegistry {
  constructor(env) {
    this.env = env;
    this.services = new Map();
    this.healthChecks = new Map();
    this.lastHealthCheck = new Map();
    this.serviceCache = env.CHITTYOS_CACHE;
    this.analytics = env.CHITTY_ANALYTICS;

    // Initialize with config
    this.initializeServices();
  }

  /**
   * Initialize services from configuration
   */
  initializeServices() {
    for (const [serviceName, config] of Object.entries(ChittyConfig.services)) {
      this.registerService(serviceName, {
        ...config,
        lastSeen: null,
        healthStatus: "unknown",
        responseTime: null,
        errorCount: 0,
        successCount: 0,
      });
    }
  }

  /**
   * Register a new service
   */
  registerService(serviceName, config) {
    const service = {
      name: config.name || serviceName,
      endpoint: config.endpoint,
      priority: config.priority !== undefined ? config.priority : 2,
      timeout: config.timeout || 10000,
      retries: config.retries || 3,
      status: config.status || "unknown",
      registeredAt: new Date().toISOString(),
      lastSeen: config.lastSeen,
      healthStatus: config.healthStatus || "unknown",
      responseTime: config.responseTime,
      errorCount: config.errorCount || 0,
      successCount: config.successCount || 0,
      metadata: config.metadata || {},
    };

    this.services.set(serviceName, service);

    // Store in cache for persistence
    this.persistServiceRegistry();

    return service;
  }

  /**
   * Get service configuration
   */
  getService(serviceName) {
    return this.services.get(serviceName);
  }

  /**
   * Get all services
   */
  getAllServices() {
    return Array.from(this.services.entries()).map(([name, config]) => ({
      serviceName: name,
      ...config,
    }));
  }

  /**
   * Get services by priority
   */
  getServicesByPriority(priority) {
    return this.getAllServices().filter(
      (service) => service.priority === priority,
    );
  }

  /**
   * Get healthy services
   */
  getHealthyServices() {
    return this.getAllServices().filter(
      (service) =>
        service.healthStatus === "healthy" && service.status === "active",
    );
  }

  /**
   * Get service endpoint URL
   */
  getServiceEndpoint(serviceName) {
    const service = this.getService(serviceName);
    if (!service) {
      throw new Error(`Service not found: ${serviceName}`);
    }

    // Check for environment override
    const envKey = `CHITTY_${serviceName.toUpperCase()}_ENDPOINT`;
    const envEndpoint = this.env[envKey];

    if (envEndpoint) {
      return envEndpoint;
    }

    return service.endpoint.startsWith("http")
      ? service.endpoint
      : `https://${service.endpoint}`;
  }

  /**
   * Perform health check on a service
   */
  async healthCheck(serviceName) {
    const service = this.getService(serviceName);
    if (!service) {
      return { healthy: false, error: "Service not found" };
    }

    const startTime = Date.now();
    let result = {
      serviceName,
      healthy: false,
      responseTime: null,
      error: null,
      timestamp: new Date().toISOString(),
    };

    let timeoutId;

    try {
      const endpoint = this.getServiceEndpoint(serviceName);
      const healthUrl = `${endpoint}/health`;

      // Create timeout controller
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), service.timeout || 5000);

      const response = await fetch(healthUrl, {
        method: "GET",
        headers: {
          "User-Agent": "ChittyID-ServiceRegistry/1.0",
          "X-Service-Check": "health",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseTime = Math.max(Date.now() - startTime, 1); // Ensure minimum 1ms

      if (response.ok) {
        const healthData = await response.json();

        result = {
          ...result,
          healthy: true,
          responseTime,
          healthData,
          status: response.status,
        };

        // Update service stats
        service.successCount++;
        service.healthStatus = "healthy";
        service.responseTime = responseTime;
        service.lastSeen = new Date().toISOString();
      } else {
        result = {
          ...result,
          healthy: false,
          responseTime,
          error: `HTTP ${response.status}`,
          status: response.status,
        };

        service.errorCount++;
        service.healthStatus = "unhealthy";
      }
    } catch (error) {
      clearTimeout(timeoutId); // Clear timeout on error
      const responseTime = Math.max(Date.now() - startTime, 1); // Ensure minimum 1ms

      result = {
        ...result,
        healthy: false,
        responseTime,
        error: error.name === "AbortError" ? "timeout" : error.message,
      };

      service.errorCount++;
      service.healthStatus = "unhealthy";
    }

    // Store health check result
    this.healthChecks.set(serviceName, result);
    this.lastHealthCheck.set(serviceName, result.timestamp);

    // Update service in registry
    this.services.set(serviceName, service);
    this.persistServiceRegistry();

    // Log to analytics
    await this.logHealthCheck(result);

    return result;
  }

  /**
   * Perform health checks on all services
   */
  async healthCheckAll() {
    const results = new Map();
    const services = Array.from(this.services.keys());

    // Run health checks in parallel, but limit concurrency
    const batchSize = 5;
    for (let i = 0; i < services.length; i += batchSize) {
      const batch = services.slice(i, i + batchSize);
      const batchPromises = batch.map((serviceName) =>
        this.healthCheck(serviceName).catch((error) => ({
          serviceName,
          healthy: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        })),
      );

      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach((result) => {
        results.set(result.serviceName, result);
      });

      // Small delay between batches to avoid overwhelming services
      if (i + batchSize < services.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  /**
   * Get health summary
   */
  getHealthSummary() {
    const services = this.getAllServices();
    const total = services.length;
    const healthy = services.filter((s) => s.healthStatus === "healthy").length;
    const unhealthy = services.filter(
      (s) => s.healthStatus === "unhealthy",
    ).length;
    const unknown = services.filter((s) => s.healthStatus === "unknown").length;

    const summary = {
      total,
      healthy,
      unhealthy,
      unknown,
      healthPercentage: total > 0 ? Math.round((healthy / total) * 100) : 0,
      lastUpdated: new Date().toISOString(),
    };

    // Add priority breakdown
    summary.byPriority = {};
    for (let priority = 0; priority <= 2; priority++) {
      const priorityServices = this.getServicesByPriority(priority);
      summary.byPriority[priority] = {
        total: priorityServices.length,
        healthy: priorityServices.filter((s) => s.healthStatus === "healthy")
          .length,
      };
    }

    // Add top issues
    summary.topIssues = services
      .filter((s) => s.healthStatus === "unhealthy")
      .sort((a, b) => b.errorCount - a.errorCount)
      .slice(0, 5)
      .map((s) => ({
        serviceName: s.serviceName,
        errorCount: s.errorCount,
        lastError: this.healthChecks.get(s.serviceName)?.error,
      }));

    return summary;
  }

  /**
   * Discover services automatically
   */
  async discoverServices() {
    const discovered = [];

    // Check ChittyBeacon for service announcements
    try {
      const beaconService = this.getService("chittybeacon");
      if (beaconService && beaconService.healthStatus === "healthy") {
        const endpoint = this.getServiceEndpoint("chittybeacon");
        const response = await fetch(`${endpoint}/discover`, {
          headers: { "X-Service-Discovery": "true" },
        });

        if (response.ok) {
          const services = await response.json();
          for (const service of services) {
            if (!this.services.has(service.name)) {
              this.registerService(service.name, service);
              discovered.push(service.name);
            }
          }
        }
      }
    } catch (error) {
      console.warn("Service discovery failed:", error.message);
    }

    return discovered;
  }

  /**
   * Find service for routing
   */
  findServiceForRouting(criteria) {
    const services = this.getHealthyServices();

    // Filter by criteria
    let candidates = services;

    if (criteria.type) {
      candidates = candidates.filter(
        (s) =>
          s.serviceName.includes(criteria.type) ||
          s.metadata?.type === criteria.type,
      );
    }

    if (criteria.capability) {
      candidates = candidates.filter((s) =>
        s.metadata?.capabilities?.includes(criteria.capability),
      );
    }

    if (criteria.priority !== undefined) {
      candidates = candidates.filter((s) => s.priority <= criteria.priority);
    }

    // Sort by priority and response time
    candidates.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority; // Lower priority number = higher priority
      }
      return (a.responseTime || Infinity) - (b.responseTime || Infinity);
    });

    return candidates[0] || null;
  }

  /**
   * Log health check to analytics
   */
  async logHealthCheck(result) {
    if (this.analytics) {
      try {
        await this.analytics.writeDataPoint({
          blobs: ["service_health"],
          doubles: [result.healthy ? 1 : 0, result.responseTime || 0],
          indexes: [result.serviceName],
        });
      } catch (error) {
        console.warn("Failed to log health check analytics:", error);
      }
    }
  }

  /**
   * Persist service registry to cache
   */
  async persistServiceRegistry() {
    if (this.serviceCache) {
      try {
        const registryData = {
          services: Object.fromEntries(this.services),
          lastUpdated: new Date().toISOString(),
        };

        await this.serviceCache.put(
          "service_registry",
          JSON.stringify(registryData),
          { expirationTtl: 3600 }, // 1 hour
        );
      } catch (error) {
        console.warn("Failed to persist service registry:", error);
      }
    }
  }

  /**
   * Load service registry from cache
   */
  async loadServiceRegistry() {
    if (this.serviceCache) {
      try {
        const cached = await this.serviceCache.get("service_registry");
        if (cached) {
          const registryData = JSON.parse(cached);

          // Merge with current services
          for (const [serviceName, config] of Object.entries(
            registryData.services,
          )) {
            if (this.services.has(serviceName)) {
              // Update existing service with cached data
              const current = this.services.get(serviceName);
              this.services.set(serviceName, {
                ...current,
                ...config,
                // Keep current config values for critical fields
                endpoint: current.endpoint,
                timeout: current.timeout,
                retries: current.retries,
              });
            } else {
              // Register new service from cache
              this.registerService(serviceName, config);
            }
          }
        }
      } catch (error) {
        console.warn("Failed to load service registry from cache:", error);
      }
    }
  }

  /**
   * Update service status
   */
  async updateServiceStatus(serviceName, status, metadata = {}) {
    const service = this.getService(serviceName);
    if (!service) {
      throw new Error(`Service not found: ${serviceName}`);
    }

    service.status = status;
    service.lastSeen = new Date().toISOString();
    service.metadata = { ...service.metadata, ...metadata };

    this.services.set(serviceName, service);
    await this.persistServiceRegistry();

    return service;
  }

  /**
   * Get service metrics
   */
  getServiceMetrics(serviceName) {
    const service = this.getService(serviceName);
    if (!service) {
      return null;
    }

    const healthCheck = this.healthChecks.get(serviceName);

    return {
      serviceName,
      healthStatus: service.healthStatus,
      responseTime: service.responseTime,
      uptime: this.calculateUptime(serviceName),
      errorRate: this.calculateErrorRate(serviceName),
      successCount: service.successCount,
      errorCount: service.errorCount,
      lastHealthCheck: healthCheck?.timestamp,
      lastSeen: service.lastSeen,
    };
  }

  /**
   * Calculate service uptime percentage
   */
  calculateUptime(serviceName) {
    const service = this.getService(serviceName);
    if (!service) return 0;

    const total = service.successCount + service.errorCount;
    if (total === 0) return 100;

    return Math.round((service.successCount / total) * 100);
  }

  /**
   * Calculate error rate
   */
  calculateErrorRate(serviceName) {
    const service = this.getService(serviceName);
    if (!service) return 0;

    const total = service.successCount + service.errorCount;
    if (total === 0) return 0;

    return Math.round((service.errorCount / total) * 100);
  }

  /**
   * Start automatic health monitoring
   */
  startHealthMonitoring(intervalMs = 30000) {
    if (this.healthMonitorInterval) {
      clearInterval(this.healthMonitorInterval);
    }

    this.healthMonitorInterval = setInterval(async () => {
      try {
        await this.healthCheckAll();
      } catch (error) {
        console.error("Health monitoring error:", error);
      }
    }, intervalMs);

    return this.healthMonitorInterval;
  }

  /**
   * Stop health monitoring
   */
  stopHealthMonitoring() {
    if (this.healthMonitorInterval) {
      clearInterval(this.healthMonitorInterval);
      this.healthMonitorInterval = null;
    }
  }
}

export default ServiceRegistry;
