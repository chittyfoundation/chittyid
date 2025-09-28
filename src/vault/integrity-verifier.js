/**
 * ChittyID File Integrity Verifier
 * Ensures files match their original ChittyID assignments and detect corruption
 */

import { createHash } from 'crypto';

export class ChittyIntegrityVerifier {
  constructor(env) {
    this.env = env;
    this.db = env.AUTH_DB;
    this.cache = env.CHITTYOS_CACHE;
  }

  /**
   * Calculate file hash for integrity verification
   */
  async calculateFileHash(fileContent) {
    if (typeof fileContent === 'string') {
      fileContent = new TextEncoder().encode(fileContent);
    }
    return createHash('sha256').update(fileContent).digest('hex');
  }

  /**
   * Register a file with its ChittyID and create integrity baseline
   */
  async registerFile(chittyId, filePath, fileContent, metadata = {}) {
    const fileHash = await this.calculateFileHash(fileContent);
    const fileSize = fileContent.length;
    const timestamp = new Date().toISOString();

    try {
      // Insert file integrity record
      const result = await this.db.prepare(`
        INSERT INTO chitty_file_integrity (
          chitty_id,
          file_path,
          file_hash,
          file_size,
          mime_type,
          original_filename,
          verification_status,
          created_at,
          last_verified,
          verification_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        chittyId,
        filePath,
        fileHash,
        fileSize,
        metadata.mimeType || 'application/octet-stream',
        metadata.originalFilename || filePath,
        'verified',
        timestamp,
        timestamp,
        1
      ).run();

      // Create evidence chain entry
      await this.createEvidenceEntry(chittyId, 'file', {
        filePath,
        fileHash,
        fileSize,
        mimeType: metadata.mimeType,
        originalFilename: metadata.originalFilename,
        registrationTimestamp: timestamp
      });

      // Log audit
      await this.logAudit(chittyId, 'register_file', null, {
        filePath,
        fileHash,
        fileSize
      });

      return {
        success: true,
        chittyId,
        filePath,
        fileHash,
        fileSize,
        registeredAt: timestamp,
        fileIntegrityId: result.meta.last_row_id
      };

    } catch (error) {
      console.error('Failed to register file:', error);
      throw new Error(`File registration failed: ${error.message}`);
    }
  }

  /**
   * Verify file integrity against stored baseline
   */
  async verifyFile(chittyId, filePath, currentFileContent) {
    try {
      // Get stored file record
      const storedFile = await this.db.prepare(`
        SELECT id, file_hash, file_size, verification_count, last_verified
        FROM chitty_file_integrity
        WHERE chitty_id = ? AND file_path = ?
      `).bind(chittyId, filePath).first();

      if (!storedFile) {
        return {
          verified: false,
          error: 'File not registered for this ChittyID',
          chittyId,
          filePath
        };
      }

      // Calculate current hash
      const currentHash = await this.calculateFileHash(currentFileContent);
      const currentSize = currentFileContent.length;
      const timestamp = new Date().toISOString();

      // Compare hashes
      const hashMatches = currentHash === storedFile.file_hash;
      const sizeMatches = currentSize === storedFile.file_size;
      const verified = hashMatches && sizeMatches;

      // Update verification record
      const newStatus = verified ? 'verified' : 'corrupted';
      await this.db.prepare(`
        UPDATE chitty_file_integrity
        SET verification_status = ?,
            last_verified = ?,
            verification_count = verification_count + 1
        WHERE id = ?
      `).bind(newStatus, timestamp, storedFile.id).run();

      // Create evidence entry for verification
      await this.createEvidenceEntry(chittyId, 'verification', {
        filePath,
        expectedHash: storedFile.file_hash,
        actualHash: currentHash,
        expectedSize: storedFile.file_size,
        actualSize: currentSize,
        verified,
        verificationTimestamp: timestamp
      });

      // Log audit
      await this.logAudit(chittyId, 'verify_file',
        { lastVerified: storedFile.last_verified },
        {
          filePath,
          verified,
          hashMatches,
          sizeMatches,
          verificationTimestamp: timestamp
        }
      );

      const result = {
        verified,
        chittyId,
        filePath,
        hashMatches,
        sizeMatches,
        expectedHash: storedFile.file_hash,
        actualHash: currentHash,
        expectedSize: storedFile.file_size,
        actualSize: currentSize,
        verificationCount: storedFile.verification_count + 1,
        lastVerified: timestamp
      };

      // Cache result
      if (this.cache) {
        await this.cache.put(
          `integrity:${chittyId}:${createHash('sha256').update(filePath).digest('hex')}`,
          JSON.stringify(result),
          { expirationTtl: 300 } // 5 minute cache
        );
      }

      return result;

    } catch (error) {
      console.error('Failed to verify file:', error);
      throw new Error(`File verification failed: ${error.message}`);
    }
  }

  /**
   * Verify all files for a ChittyID
   */
  async verifyAllFiles(chittyId, fileContents) {
    try {
      const storedFiles = await this.db.prepare(`
        SELECT file_path, file_hash, file_size
        FROM chitty_file_integrity
        WHERE chitty_id = ? AND verification_status != 'missing'
      `).bind(chittyId).all();

      const results = [];
      let allVerified = true;

      for (const storedFile of storedFiles.results) {
        const fileContent = fileContents[storedFile.file_path];

        if (!fileContent) {
          // Mark as missing
          await this.db.prepare(`
            UPDATE chitty_file_integrity
            SET verification_status = 'missing',
                last_verified = ?
            WHERE chitty_id = ? AND file_path = ?
          `).bind(new Date().toISOString(), chittyId, storedFile.file_path).run();

          results.push({
            filePath: storedFile.file_path,
            verified: false,
            error: 'File missing'
          });
          allVerified = false;
          continue;
        }

        const verification = await this.verifyFile(chittyId, storedFile.file_path, fileContent);
        results.push(verification);

        if (!verification.verified) {
          allVerified = false;
        }
      }

      return {
        chittyId,
        allVerified,
        totalFiles: results.length,
        verifiedFiles: results.filter(r => r.verified).length,
        corruptedFiles: results.filter(r => !r.verified && !r.error?.includes('missing')).length,
        missingFiles: results.filter(r => r.error?.includes('missing')).length,
        results,
        verificationTimestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Failed to verify all files:', error);
      throw new Error(`Bulk verification failed: ${error.message}`);
    }
  }

  /**
   * Create evidence chain entry
   */
  async createEvidenceEntry(chittyId, evidenceType, evidenceData, parentEvidenceId = null) {
    const evidenceHash = createHash('sha256').update(JSON.stringify(evidenceData)).digest('hex');
    const timestamp = new Date().toISOString();

    // Get next chain order
    const lastOrder = await this.db.prepare(`
      SELECT COALESCE(MAX(chain_order), 0) as max_order
      FROM chitty_evidence_chain
      WHERE chitty_id = ?
    `).bind(chittyId).first();

    const chainOrder = (lastOrder?.max_order || 0) + 1;

    await this.db.prepare(`
      INSERT INTO chitty_evidence_chain (
        chitty_id,
        evidence_type,
        evidence_data,
        evidence_hash,
        chain_order,
        parent_evidence_id,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      chittyId,
      evidenceType,
      JSON.stringify(evidenceData),
      evidenceHash,
      chainOrder,
      parentEvidenceId,
      timestamp
    ).run();

    return {
      evidenceType,
      evidenceHash,
      chainOrder,
      timestamp
    };
  }

  /**
   * Get complete evidence chain for ChittyID
   */
  async getEvidenceChain(chittyId) {
    try {
      const chain = await this.db.prepare(`
        SELECT
          id,
          evidence_type,
          evidence_data,
          evidence_hash,
          chain_order,
          parent_evidence_id,
          created_at,
          verified_at,
          verification_method
        FROM chitty_evidence_chain
        WHERE chitty_id = ?
        ORDER BY chain_order ASC
      `).bind(chittyId).all();

      return {
        chittyId,
        chainLength: chain.results.length,
        evidence: chain.results.map(item => ({
          id: item.id,
          type: item.evidence_type,
          data: JSON.parse(item.evidence_data),
          hash: item.evidence_hash,
          order: item.chain_order,
          parentId: item.parent_evidence_id,
          createdAt: item.created_at,
          verifiedAt: item.verified_at,
          verificationMethod: item.verification_method
        }))
      };

    } catch (error) {
      console.error('Failed to get evidence chain:', error);
      throw new Error(`Evidence chain retrieval failed: ${error.message}`);
    }
  }

  /**
   * Verify evidence chain integrity
   */
  async verifyEvidenceChain(chittyId) {
    try {
      const chain = await this.getEvidenceChain(chittyId);
      const verification = {
        chittyId,
        chainLength: chain.chainLength,
        valid: true,
        errors: [],
        verifiedAt: new Date().toISOString()
      };

      // Verify each evidence item
      for (const evidence of chain.evidence) {
        const expectedHash = createHash('sha256').update(JSON.stringify(evidence.data)).digest('hex');

        if (expectedHash !== evidence.hash) {
          verification.valid = false;
          verification.errors.push({
            evidenceId: evidence.id,
            order: evidence.order,
            error: 'Hash mismatch',
            expectedHash,
            actualHash: evidence.hash
          });
        }

        // Verify parent linkage
        if (evidence.parentId) {
          const parent = chain.evidence.find(e => e.id === evidence.parentId);
          if (!parent) {
            verification.valid = false;
            verification.errors.push({
              evidenceId: evidence.id,
              order: evidence.order,
              error: 'Missing parent evidence',
              parentId: evidence.parentId
            });
          } else if (parent.order >= evidence.order) {
            verification.valid = false;
            verification.errors.push({
              evidenceId: evidence.id,
              order: evidence.order,
              error: 'Invalid chain order',
              parentOrder: parent.order
            });
          }
        }
      }

      return verification;

    } catch (error) {
      console.error('Failed to verify evidence chain:', error);
      throw new Error(`Evidence chain verification failed: ${error.message}`);
    }
  }

  /**
   * Log audit entry
   */
  async logAudit(chittyId, operation, oldData, newData, operator = 'system') {
    const operationHash = createHash('sha256').update(
      JSON.stringify({ chittyId, operation, oldData, newData, timestamp: new Date().toISOString() })
    ).digest('hex');

    await this.db.prepare(`
      INSERT INTO chitty_vault_audit (
        chitty_id,
        operation,
        old_data,
        new_data,
        operation_hash,
        operator,
        timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      chittyId,
      operation,
      oldData ? JSON.stringify(oldData) : null,
      newData ? JSON.stringify(newData) : null,
      operationHash,
      operator,
      new Date().toISOString()
    ).run();
  }

  /**
   * Get integrity summary for dashboard
   */
  async getIntegritySummary() {
    try {
      const summary = await this.db.prepare(`
        SELECT
          COUNT(DISTINCT cv.chitty_id) as total_chitty_ids,
          COUNT(cfi.id) as total_files,
          COUNT(CASE WHEN cfi.verification_status = 'verified' THEN 1 END) as verified_files,
          COUNT(CASE WHEN cfi.verification_status = 'corrupted' THEN 1 END) as corrupted_files,
          COUNT(CASE WHEN cfi.verification_status = 'missing' THEN 1 END) as missing_files,
          COUNT(CASE WHEN cfi.verification_status = 'pending' THEN 1 END) as pending_files,
          AVG(cfi.verification_count) as avg_verification_count,
          MIN(cfi.last_verified) as oldest_verification,
          MAX(cfi.last_verified) as newest_verification
        FROM chitty_vault cv
        LEFT JOIN chitty_file_integrity cfi ON cv.chitty_id = cfi.chitty_id
        WHERE cv.status = 'active'
      `).first();

      return {
        ...summary,
        integrity_percentage: summary.total_files > 0 ?
          Math.round((summary.verified_files / summary.total_files) * 100) : 100,
        generated_at: new Date().toISOString()
      };

    } catch (error) {
      console.error('Failed to get integrity summary:', error);
      throw new Error(`Integrity summary failed: ${error.message}`);
    }
  }
}

export default ChittyIntegrityVerifier;