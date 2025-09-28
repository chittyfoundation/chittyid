/**
 * Neon Vault Storage for ChittyIDs
 * Stores ChittyIDs with SHA hashes for secure vault integration
 */

import { createHash } from 'crypto';

export class NeonVaultStorage {
  constructor(env) {
    this.env = env;
    this.db = env.AUTH_DB; // Neon database binding
    this.cache = env.CHITTYOS_CACHE;
  }

  /**
   * Generate SHA-256 hash of ChittyID for vault storage
   */
  generateChittyHash(chittyId) {
    return createHash('sha256').update(chittyId).digest('hex');
  }

  /**
   * Store ChittyID with SHA hash in Neon vault
   */
  async storeChittyInVault(chittyId, metadata = {}) {
    const chittyHash = this.generateChittyHash(chittyId);
    const timestamp = new Date().toISOString();

    try {
      // Store in Neon database
      const result = await this.db.prepare(`
        INSERT INTO chitty_vault (
          chitty_id,
          chitty_hash,
          metadata,
          created_at,
          updated_at,
          status
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(chitty_id) DO UPDATE SET
          metadata = excluded.metadata,
          updated_at = excluded.updated_at,
          status = excluded.status
      `).bind(
        chittyId,
        chittyHash,
        JSON.stringify(metadata),
        timestamp,
        timestamp,
        'active'
      ).run();

      // Cache for quick access
      if (this.cache) {
        await this.cache.put(
          `vault:chitty:${chittyHash}`,
          JSON.stringify({
            chittyId,
            chittyHash,
            metadata,
            storedAt: timestamp
          }),
          { expirationTtl: 3600 } // 1 hour cache
        );
      }

      return {
        success: true,
        chittyId,
        chittyHash,
        storedAt: timestamp,
        insertId: result.meta.last_row_id
      };

    } catch (error) {
      console.error('Failed to store ChittyID in vault:', error);
      throw new Error(`Vault storage failed: ${error.message}`);
    }
  }

  /**
   * Retrieve ChittyID from vault by hash
   */
  async getChittyFromVault(chittyHash) {
    try {
      // Try cache first
      if (this.cache) {
        const cached = await this.cache.get(`vault:chitty:${chittyHash}`);
        if (cached) {
          return JSON.parse(cached);
        }
      }

      // Query Neon database
      const result = await this.db.prepare(`
        SELECT chitty_id, chitty_hash, metadata, created_at, updated_at, status
        FROM chitty_vault
        WHERE chitty_hash = ? AND status = 'active'
      `).bind(chittyHash).first();

      if (!result) {
        return null;
      }

      const vaultData = {
        chittyId: result.chitty_id,
        chittyHash: result.chitty_hash,
        metadata: JSON.parse(result.metadata || '{}'),
        createdAt: result.created_at,
        updatedAt: result.updated_at,
        status: result.status
      };

      // Update cache
      if (this.cache) {
        await this.cache.put(
          `vault:chitty:${chittyHash}`,
          JSON.stringify(vaultData),
          { expirationTtl: 3600 }
        );
      }

      return vaultData;

    } catch (error) {
      console.error('Failed to retrieve ChittyID from vault:', error);
      throw new Error(`Vault retrieval failed: ${error.message}`);
    }
  }

  /**
   * Find ChittyID by original ID (generates hash internally)
   */
  async findChittyInVault(chittyId) {
    const chittyHash = this.generateChittyHash(chittyId);
    return this.getChittyFromVault(chittyHash);
  }

  /**
   * List all ChittyIDs in vault with pagination
   */
  async listVaultEntries(limit = 50, offset = 0) {
    try {
      const results = await this.db.prepare(`
        SELECT chitty_id, chitty_hash, metadata, created_at, updated_at, status
        FROM chitty_vault
        WHERE status = 'active'
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `).bind(limit, offset).all();

      return {
        entries: results.results.map(row => ({
          chittyId: row.chitty_id,
          chittyHash: row.chitty_hash,
          metadata: JSON.parse(row.metadata || '{}'),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          status: row.status
        })),
        limit,
        offset,
        hasMore: results.results.length === limit
      };

    } catch (error) {
      console.error('Failed to list vault entries:', error);
      throw new Error(`Vault listing failed: ${error.message}`);
    }
  }

  /**
   * Update ChittyID metadata in vault
   */
  async updateVaultMetadata(chittyId, newMetadata) {
    const chittyHash = this.generateChittyHash(chittyId);
    const timestamp = new Date().toISOString();

    try {
      const result = await this.db.prepare(`
        UPDATE chitty_vault
        SET metadata = ?, updated_at = ?
        WHERE chitty_hash = ? AND status = 'active'
      `).bind(
        JSON.stringify(newMetadata),
        timestamp,
        chittyHash
      ).run();

      if (result.changes === 0) {
        throw new Error('ChittyID not found in vault or already inactive');
      }

      // Invalidate cache
      if (this.cache) {
        await this.cache.delete(`vault:chitty:${chittyHash}`);
      }

      return {
        success: true,
        chittyId,
        chittyHash,
        updatedAt: timestamp,
        changesCount: result.changes
      };

    } catch (error) {
      console.error('Failed to update vault metadata:', error);
      throw new Error(`Vault update failed: ${error.message}`);
    }
  }

  /**
   * Soft delete ChittyID from vault (mark as inactive)
   */
  async removeFromVault(chittyId) {
    const chittyHash = this.generateChittyHash(chittyId);
    const timestamp = new Date().toISOString();

    try {
      const result = await this.db.prepare(`
        UPDATE chitty_vault
        SET status = 'inactive', updated_at = ?
        WHERE chitty_hash = ? AND status = 'active'
      `).bind(timestamp, chittyHash).run();

      if (result.changes === 0) {
        throw new Error('ChittyID not found in vault or already inactive');
      }

      // Clear cache
      if (this.cache) {
        await this.cache.delete(`vault:chitty:${chittyHash}`);
      }

      return {
        success: true,
        chittyId,
        chittyHash,
        removedAt: timestamp,
        changesCount: result.changes
      };

    } catch (error) {
      console.error('Failed to remove from vault:', error);
      throw new Error(`Vault removal failed: ${error.message}`);
    }
  }

  /**
   * Verify vault integrity (check hash consistency)
   */
  async verifyVaultIntegrity() {
    try {
      const results = await this.db.prepare(`
        SELECT chitty_id, chitty_hash
        FROM chitty_vault
        WHERE status = 'active'
      `).all();

      const integrity = {
        total: results.results.length,
        valid: 0,
        invalid: 0,
        errors: []
      };

      for (const row of results.results) {
        const expectedHash = this.generateChittyHash(row.chitty_id);
        if (expectedHash === row.chitty_hash) {
          integrity.valid++;
        } else {
          integrity.invalid++;
          integrity.errors.push({
            chittyId: row.chitty_id,
            storedHash: row.chitty_hash,
            expectedHash,
            error: 'Hash mismatch'
          });
        }
      }

      return integrity;

    } catch (error) {
      console.error('Failed to verify vault integrity:', error);
      throw new Error(`Vault integrity check failed: ${error.message}`);
    }
  }

  /**
   * Search vault entries by metadata
   */
  async searchVault(searchCriteria, limit = 20) {
    try {
      // Simple metadata JSON search (Neon supports JSON operators)
      const results = await this.db.prepare(`
        SELECT chitty_id, chitty_hash, metadata, created_at, updated_at
        FROM chitty_vault
        WHERE status = 'active'
          AND json_extract(metadata, '$.type') = ?
        ORDER BY created_at DESC
        LIMIT ?
      `).bind(searchCriteria.type || '', limit).all();

      return results.results.map(row => ({
        chittyId: row.chitty_id,
        chittyHash: row.chitty_hash,
        metadata: JSON.parse(row.metadata || '{}'),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));

    } catch (error) {
      console.error('Failed to search vault:', error);
      throw new Error(`Vault search failed: ${error.message}`);
    }
  }

  /**
   * Get vault statistics
   */
  async getVaultStats() {
    try {
      const stats = await this.db.prepare(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
          COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive,
          MIN(created_at) as oldest_entry,
          MAX(created_at) as newest_entry
        FROM chitty_vault
      `).first();

      return {
        ...stats,
        cacheEnabled: !!this.cache,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Failed to get vault stats:', error);
      throw new Error(`Vault stats failed: ${error.message}`);
    }
  }
}

export default NeonVaultStorage;