// src/db/locks.ts
import { db } from "@db/config/configureClient";
import { sql } from "drizzle-orm";

/** Stable 64-bit key from a string (Postgres: hashtextextended in v14+, use hashtext fallback). */
function lockKey(key: string) {
  // bigint from hashtext to keep it simple/portable
  return sql<number>`(hashtext(${key})::bigint)`;
}

/** Try to acquire a pg advisory lock. Returns true if acquired. */
export async function tryLock(key: string): Promise<boolean> {
  // drizzle + postgres.js returns an array of rows
  const rows = await db.execute<{ pg_try_advisory_lock: boolean }>(
    sql`select pg_try_advisory_lock(${lockKey(key)})`
  );
  // rows[0].pg_try_advisory_lock === true when acquired
  return Array.isArray(rows) && rows[0]?.pg_try_advisory_lock === true;
}

/** Release a pg advisory lock. Safe to call even if not held. */
export async function unlock(key: string): Promise<boolean> {
  const rows = await db.execute<{ pg_advisory_unlock: boolean }>(
    sql`select pg_advisory_unlock(${lockKey(key)})`
  );
  return Array.isArray(rows) && rows[0]?.pg_advisory_unlock === true;
}
