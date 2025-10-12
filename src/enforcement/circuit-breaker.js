/**
 * Circuit Breaker for Pipeline Enforcement
 * Prevents system overload and ensures pipeline integrity
 */

export class PipelineCircuitBreaker {
  constructor(env) {
    this.env = env;
    this.states = {
      CLOSED: 'closed',     // Normal operation
      OPEN: 'open',         // Circuit is open, blocking requests
      HALF_OPEN: 'half_open' // Testing if service has recovered
    };

    this.config = {
      failureThreshold: 5,      // Failures before opening circuit
      recoveryTimeout: 30000,   // 30 seconds before trying half-open
      successThreshold: 3,      // Successes needed to close circuit
      monitoringWindow: 60000   // 1 minute monitoring window
    };
  }

  /**
   * Check if request should be allowed through circuit breaker
   */
  async checkCircuit(serviceName, operation) {
    const circuitKey = `circuit:${serviceName}:${operation}`;
    const circuitData = await this.env.PLATFORM_CACHE.get(circuitKey);

    if (!circuitData) {
      // No circuit data - allow through and initialize
      await this.initializeCircuit(circuitKey);
      return { allowed: true, state: this.states.CLOSED };
    }

    const circuit = JSON.parse(circuitData);
    const now = Date.now();

    switch (circuit.state) {
      case this.states.CLOSED:
        return this.handleClosedState(circuit, circuitKey);

      case this.states.OPEN:
        return this.handleOpenState(circuit, circuitKey, now);

      case this.states.HALF_OPEN:
        return this.handleHalfOpenState(circuit, circuitKey);

      default:
        // Unknown state - reset to closed
        await this.initializeCircuit(circuitKey);
        return { allowed: true, state: this.states.CLOSED };
    }
  }

  /**
   * Record success for circuit breaker
   */
  async recordSuccess(serviceName, operation) {
    const circuitKey = `circuit:${serviceName}:${operation}`;
    const circuitData = await this.env.PLATFORM_CACHE.get(circuitKey);

    if (!circuitData) {
      await this.initializeCircuit(circuitKey);
      return;
    }

    const circuit = JSON.parse(circuitData);
    const now = Date.now();

    // Clean old failures outside monitoring window
    circuit.recentFailures = circuit.recentFailures.filter(
      timestamp => (now - timestamp) < this.config.monitoringWindow
    );

    if (circuit.state === this.states.HALF_OPEN) {
      circuit.consecutiveSuccesses++;

      if (circuit.consecutiveSuccesses >= this.config.successThreshold) {
        // Close the circuit
        circuit.state = this.states.CLOSED;
        circuit.consecutiveSuccesses = 0;
        circuit.lastFailureTime = 0;
        await this.logCircuitStateChange(serviceName, operation, 'CLOSED');
      }
    } else if (circuit.state === this.states.CLOSED) {
      // Reset failure count on success
      circuit.consecutiveFailures = 0;
    }

    await this.env.PLATFORM_CACHE.put(circuitKey, JSON.stringify(circuit));
  }

  /**
   * Record failure for circuit breaker
   */
  async recordFailure(serviceName, operation, error) {
    const circuitKey = `circuit:${serviceName}:${operation}`;
    const circuitData = await this.env.PLATFORM_CACHE.get(circuitKey);

    if (!circuitData) {
      await this.initializeCircuit(circuitKey);
      return;
    }

    const circuit = JSON.parse(circuitData);
    const now = Date.now();

    // Add failure to recent failures
    circuit.recentFailures.push(now);
    circuit.consecutiveFailures++;
    circuit.lastFailureTime = now;

    // Clean old failures outside monitoring window
    circuit.recentFailures = circuit.recentFailures.filter(
      timestamp => (now - timestamp) < this.config.monitoringWindow
    );

    // Check if we should open the circuit
    if (circuit.state === this.states.CLOSED &&
        circuit.consecutiveFailures >= this.config.failureThreshold) {
      circuit.state = this.states.OPEN;
      circuit.openedAt = now;
      await this.logCircuitStateChange(serviceName, operation, 'OPEN', error);
    } else if (circuit.state === this.states.HALF_OPEN) {
      // Failure in half-open state - go back to open
      circuit.state = this.states.OPEN;
      circuit.openedAt = now;
      circuit.consecutiveSuccesses = 0;
      await this.logCircuitStateChange(serviceName, operation, 'OPEN_FROM_HALF', error);
    }

    await this.env.PLATFORM_CACHE.put(circuitKey, JSON.stringify(circuit));
  }

  /**
   * Handle closed state
   */
  async handleClosedState(circuit, circuitKey) {
    // Circuit is closed - allow request through
    return {
      allowed: true,
      state: this.states.CLOSED,
      failures: circuit.consecutiveFailures
    };
  }

  /**
   * Handle open state
   */
  async handleOpenState(circuit, circuitKey, now) {
    // Check if recovery timeout has passed
    if (now - circuit.openedAt >= this.config.recoveryTimeout) {
      // Try half-open state
      circuit.state = this.states.HALF_OPEN;
      circuit.consecutiveSuccesses = 0;
      await this.env.PLATFORM_CACHE.put(circuitKey, JSON.stringify(circuit));

      await this.logCircuitStateChange(
        circuitKey.split(':')[1],
        circuitKey.split(':')[2],
        'HALF_OPEN'
      );

      return {
        allowed: true,
        state: this.states.HALF_OPEN,
        message: 'Circuit testing recovery'
      };
    }

    // Circuit is still open - block request
    return {
      allowed: false,
      state: this.states.OPEN,
      timeUntilRetry: this.config.recoveryTimeout - (now - circuit.openedAt),
      failures: circuit.consecutiveFailures
    };
  }

  /**
   * Handle half-open state
   */
  async handleHalfOpenState(circuit, circuitKey) {
    // Allow limited requests in half-open state
    return {
      allowed: true,
      state: this.states.HALF_OPEN,
      successes: circuit.consecutiveSuccesses
    };
  }

  /**
   * Initialize new circuit
   */
  async initializeCircuit(circuitKey) {
    const circuit = {
      state: this.states.CLOSED,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      recentFailures: [],
      lastFailureTime: 0,
      openedAt: 0,
      createdAt: Date.now()
    };

    await this.env.PLATFORM_CACHE.put(circuitKey, JSON.stringify(circuit));
  }

  /**
   * Log circuit state changes
   */
  async logCircuitStateChange(serviceName, operation, newState, error = null) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      service: serviceName,
      operation,
      newState,
      error: error ? error.message : null
    };

    await this.env.PLATFORM_CACHE.put(
      `circuit:log:${Date.now()}`,
      JSON.stringify(logEntry),
      { expirationTtl: 86400 * 7 } // Keep logs for 7 days
    );

    console.log(`Circuit breaker ${serviceName}:${operation} -> ${newState}`);
  }

  /**
   * Get circuit status for monitoring
   */
  async getCircuitStatus(serviceName, operation) {
    const circuitKey = `circuit:${serviceName}:${operation}`;
    const circuitData = await this.env.PLATFORM_CACHE.get(circuitKey);

    if (!circuitData) {
      return {
        exists: false,
        state: 'unknown'
      };
    }

    const circuit = JSON.parse(circuitData);
    const now = Date.now();

    return {
      exists: true,
      state: circuit.state,
      consecutiveFailures: circuit.consecutiveFailures,
      consecutiveSuccesses: circuit.consecutiveSuccesses,
      recentFailureCount: circuit.recentFailures.length,
      timeInCurrentState: now - (circuit.openedAt || circuit.createdAt),
      lastFailure: circuit.lastFailureTime,
      config: this.config
    };
  }

  /**
   * Reset circuit (for admin use)
   */
  async resetCircuit(serviceName, operation) {
    const circuitKey = `circuit:${serviceName}:${operation}`;
    await this.initializeCircuit(circuitKey);
    await this.logCircuitStateChange(serviceName, operation, 'RESET');
  }

  /**
   * Get all circuit statuses
   */
  async getAllCircuitStatuses() {
    const circuits = {};
    const keys = await this.env.PLATFORM_CACHE.list({ prefix: 'circuit:' });

    for (const key of keys.keys) {
      if (key.name.startsWith('circuit:log:')) continue;

      const parts = key.name.split(':');
      if (parts.length >= 3) {
        const serviceName = parts[1];
        const operation = parts[2];
        circuits[`${serviceName}:${operation}`] = await this.getCircuitStatus(serviceName, operation);
      }
    }

    return circuits;
  }
}

/**
 * Pipeline-specific circuit breaker for critical operations
 */
export class PipelineIntegrityBreaker extends PipelineCircuitBreaker {
  constructor(env) {
    super(env);

    // More aggressive settings for pipeline integrity
    this.config = {
      failureThreshold: 3,      // Lower threshold for pipeline failures
      recoveryTimeout: 60000,   // 1 minute recovery time
      successThreshold: 5,      // More successes needed to recover
      monitoringWindow: 30000   // 30 second monitoring window
    };

    // Critical pipeline operations
    this.criticalOperations = [
      'router-stage',
      'intake-stage',
      'trust-evaluation',
      'authorization-check',
      'id-generation',
      'session-validation',
      'auth-token-check'
    ];
  }

  /**
   * Enhanced failure detection for pipeline operations
   */
  async recordPipelineFailure(stage, operation, error, context = {}) {
    await this.recordFailure(`pipeline-${stage}`, operation, error);

    // Additional logging for pipeline failures
    const pipelineLog = {
      timestamp: new Date().toISOString(),
      stage,
      operation,
      error: error.message,
      context,
      severity: 'HIGH'
    };

    await this.env.PLATFORM_CACHE.put(
      `pipeline:failure:${Date.now()}`,
      JSON.stringify(pipelineLog),
      { expirationTtl: 86400 * 30 } // Keep pipeline failures for 30 days
    );

    // Check if multiple stages are failing
    await this.checkCascadeFailure();
  }

  /**
   * Check for cascade failures across pipeline stages
   */
  async checkCascadeFailure() {
    let failingStages = 0;

    for (const operation of this.criticalOperations) {
      const status = await this.getCircuitStatus('pipeline', operation);
      if (status.exists && status.state === this.states.OPEN) {
        failingStages++;
      }
    }

    if (failingStages >= 3) {
      // Multiple stages failing - trigger emergency mode
      await this.triggerEmergencyMode();
    }
  }

  /**
   * Trigger emergency mode for pipeline
   */
  async triggerEmergencyMode() {
    const emergencyData = {
      triggered: new Date().toISOString(),
      reason: 'PIPELINE_CASCADE_FAILURE',
      failingOperations: this.criticalOperations
    };

    await this.env.PLATFORM_CACHE.put(
      'pipeline:emergency:active',
      JSON.stringify(emergencyData),
      { expirationTtl: 3600 } // 1 hour emergency mode
    );

    console.error('PIPELINE EMERGENCY MODE ACTIVATED');
  }

  /**
   * Check if pipeline is in emergency mode
   */
  async isEmergencyMode() {
    const emergencyData = await this.env.PLATFORM_CACHE.get('pipeline:emergency:active');
    return !!emergencyData;
  }
}