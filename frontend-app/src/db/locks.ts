// @db/locks.ts
import { db } from "@db/config/configureClient";
import { sql } from "drizzle-orm";

// Stable 64-bit key from a string
function lockKey(key: string) {
  // Postgres hashtext -> int4; cast to bigint for advisory lock key
  return sql<number>`(hashtext(${key})::bigint)`;
}

export async function tryLock(key: string): Promise<boolean> {
  const rows = await db.execute<{ pg_try_advisory_lock: boolean }>(
    sql`select pg_try_advisory_lock(${lockKey(key)}) as pg_try_advisory_lock`
  );
  return rows?.[0]?.pg_try_advisory_lock === true;
}

export async function unlock(key: string): Promise<void> {
  await db.execute(
    sql`select pg_advisory_unlock(${lockKey(key)}) as pg_advisory_unlock`
  );
}
