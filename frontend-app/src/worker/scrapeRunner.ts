/**
 * Node worker that:
 * - takes a global advisory lock (single runner)
 * - pulls the next queued row from scrape_requests
 * - for each neighborhood: computes "since", spawns Python with retries
 * - writes status + error/log path back into scrape_requests
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" }); // make envs available when running with tsx

import { db } from "@db/config/configureClient";
import { sql, eq } from "drizzle-orm";
import { scrapeRequests } from "@db/migrations/schema";
import { tryLock, unlock } from "@db/locks";
import { getSinceDateForNeighborhood } from "@db/incremental";

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const GLOBAL_LOCK = "scrape:global";
const PY = process.env.SCRAPER_PY || "py";
const PY_VERSION = process.env.SCRAPER_PY_VERSION || ""; // e.g. "-3.11"
const SCRAPER =
  process.env.SCRAPER_PATH ??
  path.resolve(process.cwd(), "../backend-app/baltimore_violations_scraper.py");
const OUTDIR =
  process.env.SCRAPER_OUT ?? path.resolve(process.cwd(), "../backend-app/data");

// ---------- helpers ----------
function yyyymmdd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Normalize the incremental "since" to YYYY-MM-DD (or empty if none). */
async function sinceAsString(n: string): Promise<string> {
  const v = (await getSinceDateForNeighborhood(n)) as
    | Date
    | string
    | null
    | undefined;
  if (!v) return "";
  if (typeof v === "string") return v;
  if (v instanceof Date) return yyyymmdd(v);
  return "";
}

/** Robust Python runner: logs stdout/stderr to file and returns exit code + log path */
function runPython(jobId: string, args: string[]) {
  if (!fs.existsSync(SCRAPER))
    throw new Error(`SCRAPER_PATH not found: ${SCRAPER}`);
  if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });

  const logDir = path.join(OUTDIR, "logs");
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, `scrape-${jobId}.log`);
  const logStream = fs.createWriteStream(logFile, { flags: "a" });

  const finalArgs = [PY_VERSION, SCRAPER, ...args].filter(Boolean);
  const child = spawn(PY, finalArgs, { shell: true });

  child.stdout.on("data", (b) => {
    const s = b.toString();
    process.stdout.write(s);
    logStream.write(s);
  });
  child.stderr.on("data", (b) => {
    const s = b.toString();
    process.stderr.write(s);
    logStream.write(s);
  });

  return new Promise<{ code: number; logFile: string }>((resolve) => {
    child.on("close", (code) => {
      logStream.end();
      resolve({ code: code ?? 1, logFile });
    });
  });
}

/** Fallback list (used when payload doesn't specify neighborhoods) */
async function allNeighborhoodsFromSite(): Promise<string[]> {
  // keep tiny; your /api/neighborhoods endpoint powers the UI
  return ["ABELL", "ALLENDALE"];
}

async function processOneRequest(id: string, payload: any) {
  const neighborhoods: string[] = Array.isArray(payload?.neighborhoods)
    ? payload.neighborhoods
    : [];
  const extract: boolean = !!payload?.extract;
  const ocr: boolean = !!payload?.ocr;

  const nhoods = neighborhoods.length
    ? neighborhoods
    : await allNeighborhoodsFromSite();

  const failures: Array<{ neighborhood: string; err: string }> = [];

  for (const n of nhoods) {
    // Per-neighborhood lock
    const nlock = await tryLock(`scrape:${n}`);
    if (!nlock) continue;

    try {
      const since = await sinceAsString(n);

      const args = ["--neighborhoods", n, "--out", OUTDIR];
      if (since) args.push("--since", since);
      if (extract) args.push("--extract");
      if (ocr) args.push("--ocr");

      let ok = false;
      let attempt = 0;
      let result: { code: number; logFile: string } = { code: 1, logFile: "" };

      while (!ok && attempt < 3) {
        attempt++;
        result = await runPython(id, args);
        ok = result.code === 0;
        if (!ok) await new Promise((r) => setTimeout(r, attempt * 2000));
      }

      if (!ok) {
        const tail = fs.existsSync(result.logFile)
          ? fs.readFileSync(result.logFile, "utf8").slice(-8000)
          : "no log";
        failures.push({
          neighborhood: n,
          err: `Python exited ${result.code}. Log: ${result.logFile}\n${tail}`,
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

async function main() {
  if (!(await tryLock(GLOBAL_LOCK))) {
    console.error("[worker] another instance is running");
    process.exit(0);
  }
  try {
    // Claim one queued job and move it to running
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
