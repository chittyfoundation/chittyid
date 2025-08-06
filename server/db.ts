import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

const dbUrl = process.env.CHITTYID_DB_URL || process.env.DATABASE_URL;

if (!dbUrl) {
  throw new Error(
    "CHITTYID_DB_URL or DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: dbUrl });
export const db = drizzle({ client: pool, schema });