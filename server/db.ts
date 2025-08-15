import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

let dbUrl = process.env.CHITTYID_DB_URL || process.env.DATABASE_URL;

if (!dbUrl) {
  throw new Error(
    "CHITTYID_DB_URL or DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Decode URL-encoded database URL if needed
if (dbUrl.includes('%20')) {
  dbUrl = decodeURIComponent(dbUrl);
}

// Clean up any psql command wrapper
if (dbUrl.startsWith("psql '") && dbUrl.endsWith("'")) {
  dbUrl = dbUrl.slice(6, -1);
}

export const pool = new Pool({ connectionString: dbUrl });
export const db = drizzle({ client: pool, schema });