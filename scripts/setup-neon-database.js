#!/usr/bin/env node

/**
 * ChittyID Foundation - Neon Database Setup
 * Connects Foundation service to ChittyOS Neon project
 */

import { connect } from "@neondatabase/serverless";

const NEON_DATABASE_URL = process.env.NEON_DATABASE_URL;

if (!NEON_DATABASE_URL) {
  console.error("❌ NEON_DATABASE_URL environment variable required");
  console.log("Set via: wrangler secret put NEON_DATABASE_URL");
  process.exit(1);
}

async function setupChittyIDTables() {
  console.log("🏛️ Setting up ChittyID Foundation tables in Neon...");

  const sql = connect({ connectionString: NEON_DATABASE_URL });

  try {
    // Create ChittyID audit table
    await sql`
      CREATE TABLE IF NOT EXISTS chittyid_audit (
        id SERIAL PRIMARY KEY,
        chitty_id TEXT UNIQUE NOT NULL,
        entity_type TEXT NOT NULL,
        name TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        format TEXT NOT NULL DEFAULT 'official',
        generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        service_version TEXT DEFAULT '2.0.0',
        drand_round BIGINT,
        checksum TEXT NOT NULL,
        is_fallback BOOLEAN DEFAULT FALSE,
        reconciled_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    // Create indexes for performance
    await sql`
      CREATE INDEX IF NOT EXISTS idx_chittyid_audit_chitty_id ON chittyid_audit(chitty_id);
      CREATE INDEX IF NOT EXISTS idx_chittyid_audit_entity_type ON chittyid_audit(entity_type);
      CREATE INDEX IF NOT EXISTS idx_chittyid_audit_generated_at ON chittyid_audit(generated_at);
      CREATE INDEX IF NOT EXISTS idx_chittyid_audit_is_fallback ON chittyid_audit(is_fallback);
    `;

    // Create ChittyID sequence tracking table
    await sql`
      CREATE TABLE IF NOT EXISTS chittyid_sequences (
        entity_type TEXT PRIMARY KEY,
        format TEXT NOT NULL,
        current_sequence BIGINT DEFAULT 0,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    // Create ChittyID verification log table
    await sql`
      CREATE TABLE IF NOT EXISTS chittyid_verifications (
        id SERIAL PRIMARY KEY,
        chitty_id TEXT NOT NULL,
        verified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        verification_result JSONB NOT NULL,
        service_endpoint TEXT DEFAULT 'https://id.chitty.cc',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    console.log("✅ ChittyID Foundation tables created successfully");
    console.log("🔗 Connected to ChittyOS Neon project");

    // Insert initial sequence records
    const entityTypes = ["PERSON", "LOCATION", "THING", "EVENT", "SERVICE"];
    for (const entityType of entityTypes) {
      await sql`
        INSERT INTO chittyid_sequences (entity_type, format, current_sequence)
        VALUES (${entityType}, 'official', 0)
        ON CONFLICT (entity_type) DO NOTHING
      `;

      await sql`
        INSERT INTO chittyid_sequences (entity_type, format, current_sequence)
        VALUES (${entityType || "SIMPLE"}, 'simple', 0)
        ON CONFLICT (entity_type) DO NOTHING
      `;
    }

    console.log("🔢 Initial sequence records created");
    console.log("🎯 ChittyID Foundation ready for production deployment");
  } catch (error) {
    console.error("❌ Database setup failed:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

async function testConnection() {
  console.log("🧪 Testing Neon database connection...");

  const sql = connect({ connectionString: NEON_DATABASE_URL });

  try {
    const result = await sql`SELECT version() as version, now() as timestamp`;
    console.log("✅ Connection successful");
    console.log(`📊 PostgreSQL Version: ${result[0].version.split(" ")[1]}`);
    console.log(`⏰ Server Time: ${result[0].timestamp}`);
  } catch (error) {
    console.error("❌ Connection failed:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

async function main() {
  console.log("🏛️ ChittyID Foundation - Neon Database Setup");
  console.log("================================================");

  await testConnection();
  await setupChittyIDTables();

  console.log("\n✅ Setup complete! ChittyID Foundation connected to Neon.");
  console.log("🚀 Ready for deployment to id.chitty.cc");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { setupChittyIDTables, testConnection };
