// src/db/migrations/0001_add_heartbeat_and_indexes.ts
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

/**
 * Drizzle TS migrations convention:
 * export async function up(db: PostgresJsDatabase): Promise<void>
 * export async function down(db: PostgresJsDatabase): Promise<void>
 *
 * Your runner should call these with the same db instance you use elsewhere.
 */

export async function up(db: PostgresJsDatabase) {
  // Add heartbeat_at if missing
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_name = 'scrape_requests'
           AND column_name = 'heartbeat_at'
      ) THEN
        ALTER TABLE scrape_requests
          ADD COLUMN heartbeat_at timestamptz NULL;
      END IF;
    END
    $$;
  `);

  // Indexes (idempotent)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ix_scrape_requests_created_at
      ON scrape_requests (created_at);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ix_scrape_requests_status_created
      ON scrape_requests (status, created_at);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ix_scrape_requests_started_at
      ON scrape_requests (started_at);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ix_scrape_requests_heartbeat_at
      ON scrape_requests (heartbeat_at);
  `);
}

export async function down(db: PostgresJsDatabase) {
  await db.execute(sql`DROP INDEX IF EXISTS ix_scrape_requests_heartbeat_at;`);
  await db.execute(sql`DROP INDEX IF EXISTS ix_scrape_requests_started_at;`);
  await db.execute(
    sql`DROP INDEX IF EXISTS ix_scrape_requests_status_created;`
  );
  await db.execute(sql`DROP INDEX IF EXISTS ix_scrape_requests_created_at;`);
  // Keeping the column is usually safer; drop only if you really need to:
  // await db.execute(sql`ALTER TABLE scrape_requests DROP COLUMN IF EXISTS heartbeat_at;`);
}
