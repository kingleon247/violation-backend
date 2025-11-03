// src/app/api/scrape/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@db/config/configureClient";
import { scrapeRequests } from "@/db/migrations/schema";

// OPTIONAL: if you want to see job status quickly from the UI without making a new route
import { eq, desc } from "drizzle-orm";

/**
 * POST /api/scrape
 * Enqueue a scrape job. The worker (scrapeRunner) will pick it up.
 *
 * Body (all optional; empty payload means "all neighborhoods incremental"):
 * {
 *   "neighborhoods": ["ABELL","ALLENDALE"],
 *   "extract": true,
 *   "ocr": false
 * }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any));

  const neighborhoods: string[] = Array.isArray(body?.neighborhoods)
    ? body.neighborhoods
    : [];

  const extract: boolean = !!body?.extract;
  const ocr: boolean = !!body?.ocr;

  const payload = { neighborhoods, extract, ocr };

  const [row] = await db
    .insert(scrapeRequests)
    .values({ payload }) // status defaults to 'queued'
    .returning({ id: scrapeRequests.id });

  return NextResponse.json({ ok: true, id: row.id });
}

/**
 * GET /api/scrape?id=<jobId>
 * - If id is provided: return the single job’s status.
 * - If id is missing: return the most recent 20 jobs (for a simple “Jobs” panel).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (id) {
    const rows = await db
      .select()
      .from(scrapeRequests)
      .where(eq(scrapeRequests.id, id))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "job not found", id },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, job: rows[0] });
  }

  const jobs = await db
    .select()
    .from(scrapeRequests)
    .orderBy(desc(scrapeRequests.createdAt))
    .limit(20);

  return NextResponse.json({ ok: true, jobs });
}
