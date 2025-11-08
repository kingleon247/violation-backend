// src/app/api/scrape/log/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@db/config/configureClient";
import { scrapeRequests } from "@db/migrations/schema";
import { desc, eq } from "drizzle-orm";
import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";

const OUTDIR =
  process.env.SCRAPER_OUT ?? path.resolve(process.cwd(), "../backend-app/data");

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s
  );
}

async function resolveJobId(idParam: string | null) {
  if (idParam && isUuid(idParam)) return idParam;

  // Fallback: latest job
  const rows = await db
    .select({ id: scrapeRequests.id })
    .from(scrapeRequests)
    .orderBy(desc(scrapeRequests.createdAt))
    .limit(1);
  return rows[0]?.id ?? null;
}

function logPathFor(jobId: string) {
  // Fixed filename format, no user-controlled segments
  return path.join(OUTDIR, "logs", `scrape-${jobId}.log`);
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const idParam = url.searchParams.get("id");
    const tailParam = url.searchParams.get("tail"); // bytes to tail
    const download = url.searchParams.get("download") === "1";

    const jobId = await resolveJobId(idParam);
    if (!jobId) {
      return NextResponse.json(
        { ok: false, error: "no-jobs", message: "No scrape jobs found." },
        { status: 404 }
      );
    }

    if (!isUuid(jobId)) {
      return NextResponse.json({ ok: false, error: "bad-id" }, { status: 400 });
    }

    const p = logPathFor(jobId);
    if (!fssync.existsSync(p)) {
      // Check if job is still running
      const job = await db
        .select({ status: scrapeRequests.status })
        .from(scrapeRequests)
        .where(eq(scrapeRequests.id, jobId))
        .limit(1);

      if (job.length > 0 && job[0].status === "running") {
        // Job is running but log not ready yet; return 202 Accepted
        return NextResponse.json(
          {
            ok: false,
            pending: true,
            hint: "log-not-ready",
            message:
              "Job is running, log file not yet created. Retry in a moment.",
          },
          {
            status: 202,
            headers: {
              "Retry-After": "2",
              "x-job-id": jobId,
            },
          }
        );
      }

      // Job is not running, log really doesn't exist
      return NextResponse.json(
        {
          ok: false,
          error: "log-not-found",
          jobId,
          path: p,
          hint: "Log file does not exist. Job may have failed to start.",
        },
        { status: 404 }
      );
    }

    const buf = await fs.readFile(p);
    let body = buf;

    const n = tailParam ? Number(tailParam) : 0;
    if (Number.isFinite(n) && n > 0) {
      body = buf.length > n ? buf.subarray(buf.length - n) : buf;
    }

    const headers: Record<string, string> = {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-job-id": jobId,
    };
    if (download) {
      headers[
        "content-disposition"
      ] = `attachment; filename="scrape-${jobId}.log"`;
    }

    return new NextResponse(body, { status: 200, headers });
  } catch (err: any) {
    console.error("[/api/scrape/log] failed:", err?.message ?? err);
    return NextResponse.json(
      { ok: false, error: "server-error" },
      { status: 500 }
    );
  }
}
