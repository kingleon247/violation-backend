// src/db/incremental.ts
import { db } from "@db/config/configureClient";
import { sql, eq } from "drizzle-orm";
import { violations } from "@db/migrations/schema";

function yyyymmdd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Return YYYY-MM-DD for the day AFTER the latest notice in this neighborhood, or "" if none. */
export async function getSinceDateForNeighborhood(
  neighborhood: string
): Promise<string> {
  const rows = await db
    .select({ max: sql<Date | null>`max(${violations.dateNotice})` })
    .from(violations)
    .where(eq(violations.neighborhood, neighborhood))
    .limit(1);

  const max = rows[0]?.max ?? null;
  if (!max) return ""; // no prior data → scraper can let the site decide (or you set a default)
  const next = new Date(max);
  // start the day after
  next.setDate(next.getDate() + 1);
  return yyyymmdd(next);
}
