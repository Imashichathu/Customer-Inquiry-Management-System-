import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL must be set before starting the API");
}

export const pool = new Pool({ connectionString });
