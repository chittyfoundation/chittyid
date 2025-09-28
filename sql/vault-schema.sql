-- Neon Vault Storage Schema for ChittyIDs
-- Stores ChittyIDs with SHA hashes and file integrity verification

-- Main vault table for ChittyID storage
CREATE TABLE IF NOT EXISTS chitty_vault (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chitty_id TEXT NOT NULL UNIQUE,
    chitty_hash TEXT NOT NULL UNIQUE, -- SHA-256 of ChittyID
    metadata JSON DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'corrupted'))
);

-- File integrity table - tracks files associated with ChittyIDs
CREATE TABLE IF NOT EXISTS chitty_file_integrity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chitty_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_hash TEXT NOT NULL, -- SHA-256 of file content
    file_size INTEGER NOT NULL,
    mime_type TEXT,
    original_filename TEXT,
    verification_status TEXT DEFAULT 'pending' CHECK (
        verification_status IN ('pending', 'verified', 'corrupted', 'missing')
    ),
    created_at TEXT NOT NULL,
    last_verified TEXT,
    verification_count INTEGER DEFAULT 0,
    FOREIGN KEY (chitty_id) REFERENCES chitty_vault(chitty_id) ON DELETE CASCADE
);

-- Evidence chain table - tracks all evidence/proof linked to ChittyIDs
CREATE TABLE IF NOT EXISTS chitty_evidence_chain (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chitty_id TEXT NOT NULL,
    evidence_type TEXT NOT NULL, -- 'file', 'hash', 'signature', 'witness'
    evidence_data JSON NOT NULL,
    evidence_hash TEXT NOT NULL, -- SHA-256 of evidence_data
    chain_order INTEGER NOT NULL, -- Order in evidence chain
    parent_evidence_id INTEGER, -- Link to previous evidence
    created_at TEXT NOT NULL,
    verified_at TEXT,
    verification_method TEXT,
    FOREIGN KEY (chitty_id) REFERENCES chitty_vault(chitty_id) ON DELETE CASCADE,
    FOREIGN KEY (parent_evidence_id) REFERENCES chitty_evidence_chain(id)
);

-- Audit log for all vault operations
CREATE TABLE IF NOT EXISTS chitty_vault_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chitty_id TEXT NOT NULL,
    operation TEXT NOT NULL, -- 'create', 'update', 'verify', 'corrupt', 'delete'
    old_data JSON,
    new_data JSON,
    operation_hash TEXT NOT NULL, -- SHA-256 of operation details
    operator TEXT, -- Who performed the operation
    timestamp TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_chitty_vault_hash ON chitty_vault(chitty_hash);
CREATE INDEX IF NOT EXISTS idx_chitty_vault_status ON chitty_vault(status);
CREATE INDEX IF NOT EXISTS idx_chitty_vault_created ON chitty_vault(created_at);

CREATE INDEX IF NOT EXISTS idx_file_integrity_chitty ON chitty_file_integrity(chitty_id);
CREATE INDEX IF NOT EXISTS idx_file_integrity_hash ON chitty_file_integrity(file_hash);
CREATE INDEX IF NOT EXISTS idx_file_integrity_status ON chitty_file_integrity(verification_status);
CREATE INDEX IF NOT EXISTS idx_file_integrity_verified ON chitty_file_integrity(last_verified);

CREATE INDEX IF NOT EXISTS idx_evidence_chain_chitty ON chitty_evidence_chain(chitty_id);
CREATE INDEX IF NOT EXISTS idx_evidence_chain_order ON chitty_evidence_chain(chitty_id, chain_order);
CREATE INDEX IF NOT EXISTS idx_evidence_chain_parent ON chitty_evidence_chain(parent_evidence_id);

CREATE INDEX IF NOT EXISTS idx_vault_audit_chitty ON chitty_vault_audit(chitty_id);
CREATE INDEX IF NOT EXISTS idx_vault_audit_operation ON chitty_vault_audit(operation);
CREATE INDEX IF NOT EXISTS idx_vault_audit_timestamp ON chitty_vault_audit(timestamp);

-- Views for common queries
CREATE VIEW IF NOT EXISTS chitty_vault_summary AS
SELECT
    cv.chitty_id,
    cv.chitty_hash,
    cv.metadata,
    cv.status,
    cv.created_at,
    cv.updated_at,
    COUNT(cfi.id) as file_count,
    COUNT(CASE WHEN cfi.verification_status = 'verified' THEN 1 END) as verified_files,
    COUNT(CASE WHEN cfi.verification_status = 'corrupted' THEN 1 END) as corrupted_files,
    COUNT(cec.id) as evidence_count,
    MAX(cfi.last_verified) as last_file_verification
FROM chitty_vault cv
LEFT JOIN chitty_file_integrity cfi ON cv.chitty_id = cfi.chitty_id
LEFT JOIN chitty_evidence_chain cec ON cv.chitty_id = cec.chitty_id
WHERE cv.status = 'active'
GROUP BY cv.chitty_id, cv.chitty_hash, cv.metadata, cv.status, cv.created_at, cv.updated_at;

-- View for integrity status
CREATE VIEW IF NOT EXISTS chitty_integrity_status AS
SELECT
    cv.chitty_id,
    cv.chitty_hash,
    cv.status as vault_status,
    COUNT(cfi.id) as total_files,
    COUNT(CASE WHEN cfi.verification_status = 'verified' THEN 1 END) as verified_files,
    COUNT(CASE WHEN cfi.verification_status = 'corrupted' THEN 1 END) as corrupted_files,
    COUNT(CASE WHEN cfi.verification_status = 'missing' THEN 1 END) as missing_files,
    CASE
        WHEN COUNT(cfi.id) = 0 THEN 'no_files'
        WHEN COUNT(CASE WHEN cfi.verification_status = 'verified' THEN 1 END) = COUNT(cfi.id) THEN 'all_verified'
        WHEN COUNT(CASE WHEN cfi.verification_status = 'corrupted' THEN 1 END) > 0 THEN 'has_corruption'
        WHEN COUNT(CASE WHEN cfi.verification_status = 'missing' THEN 1 END) > 0 THEN 'has_missing'
        ELSE 'partial_verification'
    END as integrity_status,
    MIN(cfi.last_verified) as oldest_verification,
    MAX(cfi.last_verified) as newest_verification
FROM chitty_vault cv
LEFT JOIN chitty_file_integrity cfi ON cv.chitty_id = cfi.chitty_id
WHERE cv.status = 'active'
GROUP BY cv.chitty_id, cv.chitty_hash, cv.status;