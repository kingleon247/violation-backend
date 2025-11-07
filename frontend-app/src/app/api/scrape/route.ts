// src/app/api/scrape/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@db/config/configureClient";
import { scrapeRequests } from "@db/migrations/schema";
import { desc, eq } from "drizzle-orm"; // ⬅️ removed `sql`

// --- tiny helpers (no extra deps) ---
function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function asBool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v === "true";
  return undefined;
}
function asInt(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}
function asNeighborhoods(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const set = new Set<string>();
  for (const raw of v) {
    const s = String(raw).trim();
    if (s) set.add(s.toUpperCase());
  }
  return set.size ? Array.from(set) : undefined;
}

// POST /api/scrape  -> enqueue job
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));

    const neighborhoods = asNeighborhoods(body?.neighborhoods);
    const since = asString(body?.since); // "YYYY-MM-DD"
    const extract = asBool(body?.extract);
    const ocr = asBool(body?.ocr);
    const maxPdfsPerNeighborhood = asInt(body?.maxPdfsPerNeighborhood);

    // compact payload (omit empty/undefined)
    const payload: Record<string, unknown> = {};
    if (neighborhoods) payload.neighborhoods = neighborhoods;
    if (since) payload.since = since;
    if (extract !== undefined) payload.extract = extract;
    if (ocr !== undefined) payload.ocr = ocr;
    if (maxPdfsPerNeighborhood !== undefined)
      payload.maxPdfsPerNeighborhood = maxPdfsPerNeighborhood;

    // ✅ Let Drizzle serialize jsonb
    const [{ id }] = await db
      .insert(scrapeRequests)
      .values({ status: "queued", payload })
      .returning({ id: scrapeRequests.id });

    return new NextResponse(
      JSON.stringify({ ok: true, id, status: "queued" }),
      {
        status: 201,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
          "x-enqueued-id": id,
          Location: `/api/scrape?id=${encodeURIComponent(id)}`,
        },
      }
    );
  } catch (err: any) {
    console.error("[/api/scrape] enqueue failed:", err?.message ?? err);
    return new NextResponse(
      JSON.stringify({ ok: false, error: "enqueue-failed" }),
      {
        status: 500,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
      }
    );
  }
}

/**
 * GET /api/scrape?id=<jobId>      -> single job
 * GET /api/scrape?limit=20&page=1 -> recent jobs (paginated)
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") ?? "20") || 20, 1),
    100
  );
  const page = Math.max(Number(url.searchParams.get("page") ?? "1") || 1, 1);
  const offset = (page - 1) * limit;

  try {
    if (id) {
      const rows = await db
        .select()
        .from(scrapeRequests)
        .where(eq(scrapeRequests.id, id))
        .limit(1);

      if (!rows.length) {
        return new NextResponse(
          JSON.stringify({ ok: false, error: "job not found", id }),
          {
            status: 404,
            headers: {
              "content-type": "application/json",
              "cache-control": "no-store",
            },
          }
        );
      }

      return new NextResponse(JSON.stringify({ ok: true, job: rows[0] }), {
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
      });
    }

    // list mode
    const jobs = await db
      .select({
        id: scrapeRequests.id,
        createdAt: scrapeRequests.createdAt,
        startedAt: scrapeRequests.startedAt,
        finishedAt: scrapeRequests.finishedAt,
        status: scrapeRequests.status,
        ok: scrapeRequests.ok,
        error: scrapeRequests.error,
        payload: scrapeRequests.payload,
      })
      .from(scrapeRequests)
      .orderBy(desc(scrapeRequests.createdAt))
      .limit(limit)
      .offset(offset);

    return new NextResponse(JSON.stringify({ ok: true, page, limit, jobs }), {
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (err: any) {
    console.error("[/api/scrape] GET failed:", err?.message ?? err);
    return new NextResponse(
      JSON.stringify({ ok: false, error: "query-failed" }),
      {
        status: 500,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
      }
    );
  }
}
