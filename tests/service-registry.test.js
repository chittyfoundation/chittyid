/**
 * Service Registry Tests
 * Tests for ChittyOS service discovery and health monitoring
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ServiceRegistry } from "../src/services/service-registry.js";

describe("Service Registry", () => {
  let registry;
  let mockEnv;

  beforeEach(() => {
    global.fetch = vi.fn();

    mockEnv = {
      CHITTYOS_CACHE: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
      },
      CHITTY_ANALYTICS: {
        writeDataPoint: vi.fn(),
      },
    };

    registry = new ServiceRegistry(mockEnv);
  });

  afterEach(() => {
    vi.clearAllMocks();
    registry.stopHealthMonitoring();
  });

  describe("Service Registration", () => {
    it("should initialize with default ChittyOS services", () => {
      const services = registry.getAllServices();

      expect(services.length).toBeGreaterThan(30); // 51+ modules

      // Check core services
      expect(
        services.find((s) => s.serviceName === "chittycore"),
      ).toBeDefined();
      expect(services.find((s) => s.serviceName === "chittyid")).toBeDefined();
      expect(
        services.find((s) => s.serviceName === "chittyrouter"),
      ).toBeDefined();
      expect(
        services.find((s) => s.serviceName === "chittyauth"),
      ).toBeDefined();
    });

    it("should register new service successfully", () => {
      const newService = {
        name: "Test Service",
        endpoint: "test.chitty.cc",
        priority: 1,
        timeout: 5000,
        retries: 2,
      };

      const result = registry.registerService("testservice", newService);

      expect(result.name).toBe("Test Service");
      expect(result.endpoint).toBe("test.chitty.cc");
      expect(result.status).toBe("unknown");
      expect(result.registeredAt).toBeDefined();

      // Should be available in registry
      const retrieved = registry.getService("testservice");
      expect(retrieved).toEqual(result);
    });

    it("should persist service registry to cache", () => {
      registry.registerService("persistent-service", {
        endpoint: "persistent.chitty.cc",
      });

      expect(mockEnv.CHITTYOS_CACHE.put).toHaveBeenCalledWith(
        "service_registry",
        expect.stringContaining('"persistent-service"'),
        { expirationTtl: 3600 },
      );
    });

    it("should override service configuration with environment variables", () => {
      mockEnv.CHITTY_CHITTYAUTH_ENDPOINT = "override-auth.chitty.cc";

      const endpoint = registry.getServiceEndpoint("chittyauth");

      expect(endpoint).toBe("override-auth.chitty.cc");
    });
  });

  describe("Service Discovery", () => {
    it("should discover services via ChittyBeacon", async () => {
      // Mock healthy beacon service
      registry.services.set("chittybeacon", {
        healthStatus: "healthy",
        endpoint: "beacon.chitty.cc",
      });

      // Mock discovery response
      global.fetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              name: "discovered-service",
              endpoint: "discovered.chitty.cc",
              priority: 2,
            },
          ]),
      });

      const discovered = await registry.discoverServices();

      expect(discovered).toContain("discovered-service");
      expect(registry.getService("discovered-service")).toBeDefined();

      expect(global.fetch).toHaveBeenCalledWith(
        "https://beacon.chitty.cc/discover",
        expect.objectContaining({
          headers: { "X-Service-Discovery": "true" },
        }),
      );
    });

    it("should handle discovery failure gracefully", async () => {
      registry.services.set("chittybeacon", {
        healthStatus: "healthy",
        endpoint: "beacon.chitty.cc",
      });

      global.fetch.mockRejectedValue(new Error("Network error"));

      const discovered = await registry.discoverServices();

      expect(discovered).toEqual([]);
    });

    it("should skip discovery when beacon is unhealthy", async () => {
      registry.services.set("chittybeacon", {
        healthStatus: "unhealthy",
      });

      const discovered = await registry.discoverServices();

      expect(discovered).toEqual([]);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe("Health Monitoring", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should perform health check on individual service", async () => {
      registry.registerService("test-service", {
        endpoint: "test.chitty.cc",
        timeout: 5000,
      });

      // Mock successful health response
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "healthy",
            version: "1.0.0",
            uptime: 3600,
          }),
      });

      const result = await registry.healthCheck("test-service");

      expect(result.healthy).toBe(true);
      expect(result.serviceName).toBe("test-service");
      expect(result.responseTime).toBeGreaterThan(0);
      expect(result.healthData).toHaveProperty("status", "healthy");

      expect(global.fetch).toHaveBeenCalledWith(
        "https://test.chitty.cc/health",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            "User-Agent": "ChittyID-ServiceRegistry/1.0",
            "X-Service-Check": "health",
          }),
        }),
      );

      // Service should be updated
      const service = registry.getService("test-service");
      expect(service.healthStatus).toBe("healthy");
      expect(service.successCount).toBe(1);
      expect(service.errorCount).toBe(0);
    });

    it("should handle unhealthy service responses", async () => {
      registry.registerService("unhealthy-service", {
        endpoint: "unhealthy.chitty.cc",
      });

      global.fetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await registry.healthCheck("unhealthy-service");

      expect(result.healthy).toBe(false);
      expect(result.error).toBe("HTTP 500");

      const service = registry.getService("unhealthy-service");
      expect(service.healthStatus).toBe("unhealthy");
      expect(service.errorCount).toBe(1);
    });

    it("should handle network errors", async () => {
      registry.registerService("network-error-service", {
        endpoint: "error.chitty.cc",
      });

      global.fetch.mockRejectedValue(new Error("Network timeout"));

      const result = await registry.healthCheck("network-error-service");

      expect(result.healthy).toBe(false);
      expect(result.error).toBe("Network timeout");

      const service = registry.getService("network-error-service");
      expect(service.healthStatus).toBe("unhealthy");
      expect(service.errorCount).toBe(1);
    });

    it("should check all services in parallel batches", async () => {
      // Use real timers — healthCheckAll uses setTimeout for batch delays
      vi.useRealTimers();

      // Clear default services to isolate this test
      registry.services.clear();

      // Register exactly 12 test services
      for (let i = 1; i <= 12; i++) {
        registry.registerService(`service-${i}`, {
          endpoint: `https://service${i}.chitty.cc`,
        });
      }

      // Mock responses
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: "healthy" }),
      });

      const results = await registry.healthCheckAll();

      expect(results.size).toBe(12);
      expect(global.fetch).toHaveBeenCalledTimes(12);

      // Restore fake timers for remaining tests in this describe
      vi.useFakeTimers();
    });

    it("should respect timeout settings", async () => {
      // Use real timers — healthCheck uses setTimeout for AbortController
      vi.useRealTimers();

      // Clear defaults and register only the timeout test service
      registry.services.clear();
      registry.registerService("timeout-service", {
        endpoint: "https://timeout.chitty.cc",
        timeout: 500,
      });

      // Mock fetch that respects AbortSignal — delays longer than timeout
      global.fetch = vi.fn().mockImplementation(
        (_url, options) =>
          new Promise((resolve, reject) => {
            const timer = setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: () => Promise.resolve({}),
                }),
              3000,
            );
            if (options?.signal) {
              options.signal.addEventListener("abort", () => {
                clearTimeout(timer);
                reject(new DOMException("The operation was aborted", "AbortError"));
              });
            }
          }),
      );

      const result = await registry.healthCheck("timeout-service");

      expect(result.healthy).toBe(false);
      expect(result.error).toContain("timeout");

      // Restore fake timers for remaining tests in this describe
      vi.useFakeTimers();
    });

    it("should start and stop automatic health monitoring", async () => {
      const interval = registry.startHealthMonitoring(1000); // 1 second

      expect(interval).toBeDefined();

      // Mock health check
      vi.spyOn(registry, "healthCheckAll").mockResolvedValue(new Map());

      // Fast-forward time
      vi.advanceTimersByTime(1000);

      expect(registry.healthCheckAll).toHaveBeenCalled();

      registry.stopHealthMonitoring();

      // Clear the spy call count
      registry.healthCheckAll.mockClear();

      // Advance time again - should not call health check
      vi.advanceTimersByTime(1000);

      expect(registry.healthCheckAll).not.toHaveBeenCalled();
    });

    it("should log health check analytics", async () => {
      registry.registerService("analytics-service", {
        endpoint: "analytics.chitty.cc",
      });

      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await registry.healthCheck("analytics-service");

      expect(mockEnv.CHITTY_ANALYTICS.writeDataPoint).toHaveBeenCalledWith({
        blobs: ["service_health"],
        doubles: [1, expect.any(Number)], // healthy=1, response_time
        indexes: ["analytics-service"],
      });
    });
  });

  describe("Service Routing", () => {
    beforeEach(() => {
      // Register test services with different priorities and health
      registry.registerService("high-priority", {
        endpoint: "high.chitty.cc",
        priority: 0,
        status: "active",
        healthStatus: "healthy",
        responseTime: 100,
      });

      registry.registerService("medium-priority", {
        endpoint: "medium.chitty.cc",
        priority: 1,
        status: "active",
        healthStatus: "healthy",
        responseTime: 200,
      });

      registry.registerService("low-priority", {
        endpoint: "low.chitty.cc",
        priority: 2,
        status: "active",
        healthStatus: "healthy",
        responseTime: 50,
      });

      registry.registerService("unhealthy-service", {
        endpoint: "unhealthy.chitty.cc",
        priority: 0,
        status: "active",
        healthStatus: "unhealthy",
      });
    });

    it("should find service by routing criteria", () => {
      const service = registry.findServiceForRouting({
        priority: 1,
      });

      expect(service).toBeDefined();
      expect(service.priority).toBeLessThanOrEqual(1);
      expect(service.healthStatus).toBe("healthy");
    });

    it("should prioritize by priority level then response time", () => {
      const service = registry.findServiceForRouting({});

      // Should select high-priority service even though low-priority has better response time
      expect(service.serviceName).toBe("high-priority");
    });

    it("should filter by service type", () => {
      registry.registerService("chittyauth-primary", {
        endpoint: "auth1.chitty.cc",
        status: "active",
        healthStatus: "healthy",
        metadata: { type: "authentication" },
      });

      registry.registerService("chittyauth-secondary", {
        endpoint: "auth2.chitty.cc",
        status: "active",
        healthStatus: "healthy",
        metadata: { type: "authentication" },
      });

      const service = registry.findServiceForRouting({
        type: "authentication",
      });

      expect(service.serviceName).toContain("chittyauth");
      expect(service.metadata.type).toBe("authentication");
    });

    it("should filter by capability", () => {
      registry.registerService("capable-service", {
        endpoint: "capable.chitty.cc",
        status: "active",
        healthStatus: "healthy",
        metadata: {
          capabilities: ["validate", "generate", "search"],
        },
      });

      const service = registry.findServiceForRouting({
        capability: "validate",
      });

      expect(service.serviceName).toBe("capable-service");
      expect(service.metadata.capabilities).toContain("validate");
    });

    it("should return null when no services match criteria", () => {
      const service = registry.findServiceForRouting({
        type: "nonexistent",
      });

      expect(service).toBeNull();
    });
  });

  describe("Service Metrics", () => {
    it("should calculate service metrics correctly", () => {
      // Set up service with some history
      const service = registry.registerService("metrics-service", {
        endpoint: "metrics.chitty.cc",
        successCount: 90,
        errorCount: 10,
        responseTime: 250,
      });

      registry.healthChecks.set("metrics-service", {
        timestamp: "2023-10-01T12:00:00Z",
        healthy: true,
      });

      const metrics = registry.getServiceMetrics("metrics-service");

      expect(metrics.serviceName).toBe("metrics-service");
      expect(metrics.uptime).toBe(90); // 90/(90+10) * 100
      expect(metrics.errorRate).toBe(10); // 10/(90+10) * 100
      expect(metrics.responseTime).toBe(250);
      expect(metrics.lastHealthCheck).toBe("2023-10-01T12:00:00Z");
    });

    it("should handle services with no metrics", () => {
      registry.registerService("no-metrics", {
        endpoint: "no-metrics.chitty.cc",
      });

      const metrics = registry.getServiceMetrics("no-metrics");

      expect(metrics.uptime).toBe(100); // No requests = 100% uptime
      expect(metrics.errorRate).toBe(0);
    });

    it("should return null for nonexistent service", () => {
      const metrics = registry.getServiceMetrics("nonexistent");

      expect(metrics).toBeNull();
    });
  });

  describe("Health Summary", () => {
    beforeEach(() => {
      // Clear existing services and add test data
      registry.services.clear();

      registry.registerService("healthy-1", {
        endpoint: "h1.chitty.cc",
        priority: 0,
        healthStatus: "healthy",
        errorCount: 1,
      });

      registry.registerService("healthy-2", {
        endpoint: "h2.chitty.cc",
        priority: 1,
        healthStatus: "healthy",
        errorCount: 0,
      });

      registry.registerService("unhealthy-1", {
        endpoint: "uh1.chitty.cc",
        priority: 0,
        healthStatus: "unhealthy",
        errorCount: 5,
      });

      registry.registerService("unknown-1", {
        endpoint: "uk1.chitty.cc",
        priority: 2,
        healthStatus: "unknown",
        errorCount: 0,
      });

      // Mock health check data
      registry.healthChecks.set("unhealthy-1", {
        error: "Connection timeout",
      });
    });

    it("should generate comprehensive health summary", () => {
      const summary = registry.getHealthSummary();

      expect(summary.total).toBe(4);
      expect(summary.healthy).toBe(2);
      expect(summary.unhealthy).toBe(1);
      expect(summary.unknown).toBe(1);
      expect(summary.healthPercentage).toBe(50); // 2/4 * 100

      expect(summary.byPriority).toHaveProperty("0");
      expect(summary.byPriority["0"].total).toBe(2);
      expect(summary.byPriority["0"].healthy).toBe(1);

      expect(summary.topIssues).toHaveLength(1);
      expect(summary.topIssues[0].serviceName).toBe("unhealthy-1");
      expect(summary.topIssues[0].errorCount).toBe(5);
      expect(summary.topIssues[0].lastError).toBe("Connection timeout");
    });

    it("should handle empty registry", () => {
      registry.services.clear();

      const summary = registry.getHealthSummary();

      expect(summary.total).toBe(0);
      expect(summary.healthPercentage).toBe(0);
      expect(summary.topIssues).toHaveLength(0);
    });
  });

  describe("Service Management", () => {
    it("should update service status", async () => {
      registry.registerService("status-service", {
        endpoint: "status.chitty.cc",
      });

      const updated = await registry.updateServiceStatus(
        "status-service",
        "maintenance",
        {
          reason: "Scheduled maintenance",
          duration: "2 hours",
        },
      );

      expect(updated.status).toBe("maintenance");
      expect(updated.metadata.reason).toBe("Scheduled maintenance");
      expect(updated.lastSeen).toBeDefined();

      // Should persist changes
      expect(mockEnv.CHITTYOS_CACHE.put).toHaveBeenCalled();
    });

    it("should throw error for nonexistent service", async () => {
      await expect(
        registry.updateServiceStatus("nonexistent", "active"),
      ).rejects.toThrow("Service not found: nonexistent");
    });
  });

  describe("Service Groups", () => {
    it("should get services by priority", () => {
      registry.registerService("p0-service", { priority: 0 });
      registry.registerService("p1-service", { priority: 1 });
      registry.registerService("p2-service", { priority: 2 });

      const p1Services = registry.getServicesByPriority(1);

      // Should include our registered service plus any default services with priority 1
      expect(p1Services.length).toBeGreaterThan(0);
      expect(p1Services.some((s) => s.serviceName === "p1-service")).toBe(true);
    });

    it("should get only healthy services", () => {
      registry.registerService("healthy-service", {
        healthStatus: "healthy",
        status: "active",
      });

      registry.registerService("unhealthy-service", {
        healthStatus: "unhealthy",
        status: "active",
      });

      registry.registerService("inactive-service", {
        healthStatus: "healthy",
        status: "inactive",
      });

      const healthyServices = registry.getHealthyServices();

      expect(healthyServices).toHaveLength(1);
      expect(healthyServices[0].serviceName).toBe("healthy-service");
    });
  });

  describe("Cache Management", () => {
    it("should load service registry from cache", async () => {
      const cachedData = {
        services: {
          "cached-service": {
            name: "Cached Service",
            endpoint: "cached.chitty.cc",
            healthStatus: "healthy",
            responseTime: 100,
          },
        },
        lastUpdated: "2023-10-01T12:00:00Z",
      };

      mockEnv.CHITTYOS_CACHE.get.mockResolvedValue(JSON.stringify(cachedData));

      await registry.loadServiceRegistry();

      const service = registry.getService("cached-service");
      expect(service).toBeDefined();
      expect(service.healthStatus).toBe("healthy");
      expect(service.responseTime).toBe(100);
    });

    it("should merge cached data with existing services", async () => {
      // Register a service first
      registry.registerService("existing-service", {
        endpoint: "existing.chitty.cc",
        timeout: 5000,
      });

      const cachedData = {
        services: {
          "existing-service": {
            healthStatus: "healthy",
            responseTime: 200,
            endpoint: "cached-different.chitty.cc", // Should not override
          },
        },
      };

      mockEnv.CHITTYOS_CACHE.get.mockResolvedValue(JSON.stringify(cachedData));

      await registry.loadServiceRegistry();

      const service = registry.getService("existing-service");
      expect(service.endpoint).toBe("existing.chitty.cc"); // Original endpoint preserved
      expect(service.timeout).toBe(5000); // Original timeout preserved
      expect(service.healthStatus).toBe("healthy"); // Cached status applied
      expect(service.responseTime).toBe(200); // Cached response time applied
    });

    it("should handle cache loading errors gracefully", async () => {
      mockEnv.CHITTYOS_CACHE.get.mockRejectedValue(new Error("Cache error"));

      // Should not throw
      await expect(registry.loadServiceRegistry()).resolves.toBeUndefined();
    });
  });
});
