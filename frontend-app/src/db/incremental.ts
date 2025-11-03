import { db } from "@db/config/configureClient";
import { sql, desc, and, eq } from "drizzle-orm";
import { violations } from "@/db/migrations/schema";

// Return ISO 'YYYY-MM-DD' cutoff per neighborhood.
// If none exist yet, return a safe early date.
export async function getSinceDateForNeighborhood(n: string): Promise<string> {
  const rows = await db
    .select({ d: violations.dateNotice })
    .from(violations)
    .where(eq(violations.neighborhood, n))
    .orderBy(desc(violations.dateNotice))
    .limit(1);

  // if DB empty -> start far back so we fetch everything once
  const fallback = "2000-01-01";
  if (rows.length === 0 || !rows[0].d) return fallback;

  // Add 1 day to be safe (avoid off-by-one same-day dupes)
  const d = new Date(rows[0].d as unknown as string);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
