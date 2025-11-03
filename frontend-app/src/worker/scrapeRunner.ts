/* src/worker/scrapeRunner.ts
 * Node worker that:
 * - claims a global advisory lock (so only 1 runner)
 * - pulls next queued scrape_requests
 * - for each neighborhood: compute since date, call python with retries
 * - writes status back
 */
import "dotenv/config";
import { db } from "@db/config/configureClient";
import { sql, eq } from "drizzle-orm";
import { scrapeRequests } from "@db/migrations/schema";
import { tryLock, unlock } from "@db/locks";
import { getSinceDateForNeighborhood } from "@db/incremental";
import { spawn } from "node:child_process";
import path from "node:path";

const GLOBAL_LOCK = "scrape:global";
const PY = process.env.SCRAPER_PY ?? "py";
const PY_VERSION = process.env.SCRAPER_PY_VERSION ?? "-3.11";
const SCRAPER =
  process.env.SCRAPER_PATH ??
  path.resolve(process.cwd(), "../backend-app/baltimore_violations_scraper.py");
const OUTDIR =
  process.env.SCRAPER_OUT ?? path.resolve(process.cwd(), "../backend-app/data");

function runPython(
  args: string[]
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const cmd = spawn(PY, [PY_VERSION, SCRAPER, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "";
    cmd.stdout.on("data", (d) => (stdout += d.toString()));
    cmd.stderr.on("data", (d) => (stderr += d.toString()));
    cmd.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

async function processOneRequest(id: string, payload: any) {
  const neighborhoods: string[] = payload?.neighborhoods?.length
    ? payload.neighborhoods
    : []; // [] means all
  const extract: boolean = !!payload?.extract;
  const ocr: boolean = !!payload?.ocr;

  const nhoods = neighborhoods.length
    ? neighborhoods
    : await allNeighborhoodsFromSite(); // or keep a static list
  const failures: Array<{ neighborhood: string; err: string }> = [];

  for (const n of nhoods) {
    // Per-neighborhood lock (belt & suspenders)
    const nlock = await tryLock(`scrape:${n}`);
    if (!nlock) continue;

    try {
      const since = await getSinceDateForNeighborhood(n);

      const args = ["--neighborhoods", n, "--out", OUTDIR, "--since", since];
      if (extract) args.push("--extract");
      if (ocr) args.push("--ocr");

      // Retry up to 3 with backoff
      let ok = false,
        attempt = 0,
        result: { code: number; stdout: string; stderr: string } | null = null;
      while (!ok && attempt < 3) {
        attempt++;
        result = await runPython(args);
        ok = result.code === 0;
        if (!ok) await new Promise((r) => setTimeout(r, attempt * 2000));
      }

      if (!ok) {
        failures.push({
          neighborhood: n,
          err: (result?.stderr || "unknown error").slice(0, 4000),
        });
      }
    } finally {
      await unlock(`scrape:${n}`);
    }
  }

  if (failures.length) {
    const msg = failures.map((f) => `${f.neighborhood}: ${f.err}`).join("\n\n");
    await db
      .update(scrapeRequests)
      .set({ status: "error", finishedAt: new Date(), ok: false, error: msg })
      .where(eq(scrapeRequests.id, id));
  } else {
    await db
      .update(scrapeRequests)
      .set({ status: "success", finishedAt: new Date(), ok: true })
      .where(eq(scrapeRequests.id, id));
  }
}

async function allNeighborhoodsFromSite(): Promise<string[]> {
  // TODO: wire to discovery; placeholder list for now.
  return ["ABELL", "ALLENDALE"];
}

async function main() {
  if (!(await tryLock(GLOBAL_LOCK))) {
    console.error("[worker] another instance is running");
    process.exit(0);
  }
  try {
    // Claim the next queued job
    const rows = await db.execute<{ id: string; payload: any }>(
      sql`update scrape_requests
          set status = 'running', started_at = now()
          where id = (
            select id from scrape_requests
            where status = 'queued'
            order by created_at asc
            for update skip locked
            limit 1
          )
          returning id, payload`
    );

    if (!rows || rows.length === 0) {
      console.log("[worker] no queued jobs");
      return;
    }

    const job = rows[0];
    await processOneRequest(job.id, job.payload);
  } finally {
    await unlock(GLOBAL_LOCK);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
