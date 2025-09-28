/**
 * Secret Service
 * Manages ChittySecret API keys
 */

export default class SecretService {
  constructor(env) {
    this.env = env;
  }

  /**
   * Generate a new ChittySecret API key
   */
  async generate(params) {
    const {
      chittyId,
      permissions = ['read'],
      rateLimit = 100,
      expiresIn = null
    } = params;

    // Validate ChittyID exists
    if (this.env.CHITTY_IDS) {
      const exists = await this.env.CHITTY_IDS.get(chittyId);
      if (!exists) {
        throw new Error('ChittyID not found. Cannot generate secret for non-existent ID.');
      }
    }

    // Generate secure secret key
    const keyPrefix = 'cs_'; // ChittySecret prefix
    const randomBytes = crypto.getRandomValues(new Uint8Array(32));
    const hexString = Array.from(randomBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    const secret = `${keyPrefix}${hexString}`;

    // Create secret metadata
    const secretData = {
      secret,
      chittyId,
      permissions,
      rateLimit,
      createdAt: new Date().toISOString(),
      usageCount: 0,
      lastUsed: null,
      metadata: params.metadata || {}
    };

    // Add expiration if specified
    if (expiresIn) {
      const expiresAt = new Date(Date.now() + expiresIn * 1000);
      secretData.expiresAt = expiresAt.toISOString();
    }

    // Store in KV
    if (this.env.CHITTY_SECRETS) {
      await this.env.CHITTY_SECRETS.put(
        secret,
        JSON.stringify(secretData),
        expiresIn ? { expirationTtl: expiresIn } : undefined
      );

      // Also store reference from ChittyID to secrets
      await this.storeSecretReference(chittyId, secret);
    }

    // Track in analytics
    if (this.env.CHITTY_ANALYTICS) {
      this.env.CHITTY_ANALYTICS.writeDataPoint({
        indexes: ['secret_generated', chittyId],
        blobs: [secret.substring(0, 10) + '...'], // Don't log full secret
        doubles: [Date.now(), rateLimit]
      });
    }

    return {
      secret,
      chittyId,
      permissions,
      rateLimit,
      expiresAt: secretData.expiresAt || null,
      createdAt: secretData.createdAt
    };
  }

  /**
   * Validate a ChittySecret
   */
  async validate(secret) {
    if (!secret || !secret.startsWith('cs_')) {
      return {
        valid: false,
        error: 'Invalid secret format'
      };
    }

    // Get secret from KV
    if (!this.env.CHITTY_SECRETS) {
      return {
        valid: false,
        error: 'Secret storage not configured'
      };
    }

    const data = await this.env.CHITTY_SECRETS.get(secret);
    if (!data) {
      return {
        valid: false,
        error: 'Secret not found or expired'
      };
    }

    const secretData = JSON.parse(data);

    // Check expiration
    if (secretData.expiresAt) {
      const expiresAt = new Date(secretData.expiresAt);
      if (expiresAt < new Date()) {
        // Secret has expired, delete it
        await this.revoke(secret);
        return {
          valid: false,
          error: 'Secret has expired'
        };
      }
    }

    // Check rate limit
    const rateLimitOk = await this.checkRateLimit(secret, secretData.rateLimit);
    if (!rateLimitOk) {
      return {
        valid: false,
        error: 'Rate limit exceeded',
        rateLimit: secretData.rateLimit
      };
    }

    // Update usage statistics
    await this.updateUsageStats(secret, secretData);

    return {
      valid: true,
      chittyId: secretData.chittyId,
      permissions: secretData.permissions,
      rateLimit: secretData.rateLimit,
      expiresAt: secretData.expiresAt || null,
      usageCount: secretData.usageCount + 1
    };
  }

  /**
   * Revoke a ChittySecret
   */
  async revoke(secret) {
    if (!this.env.CHITTY_SECRETS) {
      return false;
    }

    // Get secret data before deletion
    const data = await this.env.CHITTY_SECRETS.get(secret);
    if (!data) {
      return false; // Already doesn't exist
    }

    const secretData = JSON.parse(data);

    // Delete the secret
    await this.env.CHITTY_SECRETS.delete(secret);

    // Remove reference from ChittyID
    await this.removeSecretReference(secretData.chittyId, secret);

    // Track in analytics
    if (this.env.CHITTY_ANALYTICS) {
      this.env.CHITTY_ANALYTICS.writeDataPoint({
        indexes: ['secret_revoked', secretData.chittyId],
        blobs: [secret.substring(0, 10) + '...'],
        doubles: [Date.now(), secretData.usageCount]
      });
    }

    return true;
  }

  /**
   * Check rate limit for a secret
   */
  async checkRateLimit(secret, limit) {
    const key = `ratelimit:${secret}:${Math.floor(Date.now() / 60000)}`;
    const count = await this.env.CHITTY_SECRETS?.get(key);

    if (count && parseInt(count) >= limit) {
      return false;
    }

    await this.env.CHITTY_SECRETS?.put(
      key,
      String((parseInt(count) || 0) + 1),
      { expirationTtl: 60 } // Expire after 1 minute
    );

    return true;
  }

  /**
   * Update usage statistics for a secret
   */
  async updateUsageStats(secret, secretData) {
    secretData.usageCount = (secretData.usageCount || 0) + 1;
    secretData.lastUsed = new Date().toISOString();

    await this.env.CHITTY_SECRETS?.put(
      secret,
      JSON.stringify(secretData),
      secretData.expiresAt ? {
        expirationTtl: Math.floor((new Date(secretData.expiresAt) - new Date()) / 1000)
      } : undefined
    );
  }

  /**
   * Store reference from ChittyID to secret
   */
  async storeSecretReference(chittyId, secret) {
    if (!this.env.CHITTY_SECRETS) return;

    const key = `secrets:${chittyId}`;
    const existing = await this.env.CHITTY_SECRETS.get(key);

    const secrets = existing ? JSON.parse(existing) : [];
    secrets.push({
      secret: secret.substring(0, 10) + '...', // Store partial for reference
      createdAt: new Date().toISOString()
    });

    await this.env.CHITTY_SECRETS.put(key, JSON.stringify(secrets));
  }

  /**
   * Remove reference from ChittyID to secret
   */
  async removeSecretReference(chittyId, secret) {
    if (!this.env.CHITTY_SECRETS) return;

    const key = `secrets:${chittyId}`;
    const existing = await this.env.CHITTY_SECRETS.get(key);

    if (existing) {
      const secrets = JSON.parse(existing);
      const filtered = secrets.filter(s => !s.secret.startsWith(secret.substring(0, 10)));
      await this.env.CHITTY_SECRETS.put(key, JSON.stringify(filtered));
    }
  }

  /**
   * List all secrets for a ChittyID (returns partial secrets only)
   */
  async listSecrets(chittyId) {
    if (!this.env.CHITTY_SECRETS) {
      return [];
    }

    const key = `secrets:${chittyId}`;
    const data = await this.env.CHITTY_SECRETS.get(key);

    return data ? JSON.parse(data) : [];
  }
}