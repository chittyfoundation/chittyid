/**
 * ChittyOS Registry Client
 * Handles registration with the central ChittyOS service registry
 */

export class RegistryClient {
  constructor(env) {
    this.env = env;
    this.registryEndpoints = [
      'https://registry.chitty.cc',
      'https://core.chitty.cc/registry',
      'https://chittyos.com/registry'
    ];
    this.serviceInfo = this.buildServiceInfo();
  }

  /**
   * Build service information for registration
   */
  buildServiceInfo() {
    return {
      service: 'chittyid',
      name: 'ChittyID',
      version: '2.0.0',
      description: 'Identity management system with hardened security pipeline',
      endpoint: 'https://chittyid.chitty.workers.dev',
      domain: 'https://id.chitty.cc',
      health: '/api/health',
      priority: 1,
      type: 'identity-service',
      capabilities: [
        'identity-management',
        'pipeline-enforcement',
        'security-hardening',
        'real-time-sessions',
        'chittyid-validation',
        'bypass-detection',
        'rate-limiting'
      ],
      security: {
        enforcementLevel: 'MAXIMUM',
        pipelineRequired: true,
        bypassable: false,
        features: [
          'request-interception',
          'header-injection-protection',
          'timing-attack-prevention',
          'rate-limiting',
          'legacy-endpoint-blocking'
        ]
      },
      registeredAt: new Date().toISOString(),
      registeredBy: 'chittyid-deployment'
    };
  }

  /**
   * Attempt to register with available registries
   */
  async register() {
    const results = [];

    for (const registryUrl of this.registryEndpoints) {
      try {
        const result = await this.registerWithRegistry(registryUrl);
        results.push({ registry: registryUrl, ...result });
      } catch (error) {
        results.push({
          registry: registryUrl,
          success: false,
          error: error.message
        });
      }
    }

    // Store registration results
    if (this.env.CHITTYOS_CACHE) {
      await this.env.CHITTYOS_CACHE.put(
        'registry:registration-results',
        JSON.stringify({
          results,
          lastAttempt: new Date().toISOString(),
          serviceInfo: this.serviceInfo
        }),
        { expirationTtl: 3600 }
      );
    }

    return results;
  }

  /**
   * Register with a specific registry
   */
  async registerWithRegistry(registryUrl) {
    // Check if registry is available
    const healthCheck = await this.checkRegistryHealth(registryUrl);
    if (!healthCheck.available) {
      throw new Error(`Registry not available: ${healthCheck.error}`);
    }

    // Attempt registration
    const response = await fetch(`${registryUrl}/api/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ChittyOS-Service': 'chittyid',
        'X-ChittyOS-Version': '2.0.0'
      },
      body: JSON.stringify(this.serviceInfo)
    });

    if (!response.ok) {
      throw new Error(`Registration failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    return {
      success: true,
      registry: registryUrl,
      registrationId: result.id || result.registrationId,
      status: result.status || 'registered',
      response: result
    };
  }

  /**
   * Check if registry is available
   */
  async checkRegistryHealth(registryUrl) {
    try {
      const response = await fetch(`${registryUrl}/api/health`, {
        method: 'GET',
        headers: { 'X-Service-Check': 'true' },
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });

      return {
        available: response.ok,
        status: response.status,
        url: registryUrl
      };
    } catch (error) {
      return {
        available: false,
        error: error.message,
        url: registryUrl
      };
    }
  }

  /**
   * Update service status in registry
   */
  async updateStatus(status = 'healthy') {
    const registrationResults = await this.getRegistrationResults();
    if (!registrationResults?.results) {
      return { updated: false, reason: 'No active registrations found' };
    }

    const updates = [];
    for (const registration of registrationResults.results) {
      if (registration.success && registration.registrationId) {
        try {
          const response = await fetch(`${registration.registry}/api/services/${registration.registrationId}/status`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'X-ChittyOS-Service': 'chittyid'
            },
            body: JSON.stringify({
              status,
              timestamp: new Date().toISOString(),
              health: await this.getHealthStatus()
            })
          });

          updates.push({
            registry: registration.registry,
            success: response.ok,
            status: response.status
          });
        } catch (error) {
          updates.push({
            registry: registration.registry,
            success: false,
            error: error.message
          });
        }
      }
    }

    return { updated: true, updates };
  }

  /**
   * Get current health status
   */
  async getHealthStatus() {
    try {
      const response = await fetch('https://chittyid.chitty.workers.dev/api/health');
      if (response.ok) {
        return await response.json();
      }
      return { status: 'unhealthy', error: 'Health check failed' };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }

  /**
   * Get stored registration results
   */
  async getRegistrationResults() {
    if (!this.env.CHITTYOS_CACHE) return null;

    try {
      const data = await this.env.CHITTYOS_CACHE.get('registry:registration-results');
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Failed to get registration results:', error);
      return null;
    }
  }

  /**
   * Deregister from all registries
   */
  async deregister() {
    const registrationResults = await this.getRegistrationResults();
    if (!registrationResults?.results) {
      return { deregistered: false, reason: 'No active registrations found' };
    }

    const deregistrations = [];
    for (const registration of registrationResults.results) {
      if (registration.success && registration.registrationId) {
        try {
          const response = await fetch(`${registration.registry}/api/services/${registration.registrationId}`, {
            method: 'DELETE',
            headers: {
              'X-ChittyOS-Service': 'chittyid'
            }
          });

          deregistrations.push({
            registry: registration.registry,
            success: response.ok,
            status: response.status
          });
        } catch (error) {
          deregistrations.push({
            registry: registration.registry,
            success: false,
            error: error.message
          });
        }
      }
    }

    // Clear stored registration data
    if (this.env.CHITTYOS_CACHE) {
      await this.env.CHITTYOS_CACHE.delete('registry:registration-results');
    }

    return { deregistered: true, deregistrations };
  }

  /**
   * Get service discovery information
   */
  getServiceDiscovery() {
    return {
      ...this.serviceInfo,
      lastRegistrationAttempt: null,
      registrationStatus: 'pending',
      availableRegistries: this.registryEndpoints,
      instructions: {
        manual: 'Call /api/registry/register to attempt registration',
        automatic: 'Registration attempted on service startup',
        health: 'Health status updated every 5 minutes'
      }
    };
  }
}