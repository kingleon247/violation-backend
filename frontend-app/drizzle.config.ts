// drizzle.config.ts
import { defineConfig } from "drizzle-kit";
import { config as loadEnv } from "dotenv";
import { existsSync } from "fs";
import { join } from "path";

// Prefer .env.local, fall back to .env
const envLocal = join(process.cwd(), ".env.local");
const envFile = existsSync(envLocal) ? envLocal : join(process.cwd(), ".env");
loadEnv({ path: envFile });

const DB_URL = process.env.DB_URL;
if (!DB_URL) {
  throw new Error(
    "DB_URL is not set. Put it in .env.local or export it in your shell."
  );
}

export default defineConfig({
  schema: "src/db/migrations/schema.ts",
  dialect: "postgresql",
  out: "src/db/migrations",
  dbCredentials: {
    url: DB_URL, // <-- correct key
  },
  strict: true,
  verbose: true,
});
