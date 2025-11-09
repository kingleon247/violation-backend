// src/worker/scrapeRunner.ts
/**
 * Production-reliable scrape runner:
 * - single-runner global advisory lock
 * - claims one queued job at a time (SKIP LOCKED)
 * - creates log file IMMEDIATELY before spawning Python
 * - streams Python logs to file, retries per neighborhood
 * - heartbeats every ~5s while running; reaper can detect stale jobs
 * - infinite loop by default; --once flag for single-shot runs
 * - timeout enforcement with clear error messages
 *
 * Env:
 *   DB_URL=postgres://...
 *   SCRAPER_PY=C:/Users/kingl/__code/next-scraper/backend-app/.venv/Scripts/python.exe  (Windows)
 *   SCRAPER_PY=/home/user/.venv/bin/python  (Linux)
 *   SCRAPER_PATH=C:/Users/kingl/__code/next-scraper/backend-app/baltimore_violations_scraper.py
 *   SCRAPER_OUT=C:/Users/kingl/__code/next-scraper/backend-app/data
 *   SCRAPER_TIMEOUT_MS=480000        # per-neighborhood timeout (default 8m)
 *   SCRAPER_HEADED=0|1               # pass --headed (debug)
 *   SCRAPER_SLOW_MO=0|200            # pass --slow-mo <ms> (debug)
 *   SCRAPER_SKIP_EXISTING=0|1        # pass --skip-existing
 *   SCRAPER_FORCE_EXTRACT=0|1        # pass --force-extract
 *   SCRAPER_MAX_PDFS=1               # override payload maxPdfsPerNeighborhood if set
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { db } from "@db/config/configureClient";
import { sql, eq } from "drizzle-orm";
import { scrapeRequests } from "@db/migrations/schema";
import { tryLock, unlock } from "@db/locks";
import { getSinceDateForNeighborhood } from "@db/incremental";

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const GLOBAL_LOCK = "scrape:global";
// On Linux, fallback to 'python' if SCRAPER_PY not set; on Windows default to 'py'
const PY =
  process.env.SCRAPER_PY || (process.platform === "win32" ? "py" : "python");
const PY_VERSION = process.env.SCRAPER_PY_VERSION || "";
const SCRAPER =
  process.env.SCRAPER_PATH ??
  path.resolve(process.cwd(), "../backend-app/baltimore_violations_scraper.py");
const OUTDIR =
  process.env.SCRAPER_OUT ?? path.resolve(process.cwd(), "../backend-app/data");
const PER_NHOOD_TIMEOUT_MS = Number(
  process.env.SCRAPER_TIMEOUT_MS || 8 * 60_000
);
const HEARTBEAT_INTERVAL_MS = 5000; // 5 seconds
const POLL_INTERVAL_MS = 3000; // 3 seconds between job checks

function ensurePaths() {
  if (!fs.existsSync(SCRAPER))
    throw new Error(`SCRAPER_PATH not found: ${SCRAPER}`);
  if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });
  const logDir = path.join(OUTDIR, "logs");
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
}

async function sinceAsString(n: string, explicit?: string): Promise<string> {
  if (explicit && /^\d{4}-\d{2}-\d{2}$/.test(explicit)) return explicit;
  const s = await getSinceDateForNeighborhood(n);
  return typeof s === "string" ? s : "";
}

function runPython(
  jobId: string,
  args: string[],
  timeoutMs = PER_NHOOD_TIMEOUT_MS
) {
  ensurePaths();

  // Create log file IMMEDIATELY with a header so UI never gets 404
  const logDir = path.join(OUTDIR, "logs");
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

  const logFile = path.join(logDir, `scrape-${jobId}.log`);
  const header = `[worker] job ${jobId} starting at ${new Date().toISOString()}\n`;
  fs.writeFileSync(logFile, header, { flag: "a" });

  const logStream = fs.createWriteStream(logFile, { flags: "a" });

  const backendDir = path.resolve(SCRAPER, "..");
  const env = { ...process.env, PYTHONUNBUFFERED: "1" };

  const argv = (PY_VERSION ? [PY_VERSION, SCRAPER] : [SCRAPER]).concat(args);

  console.log(`[worker] spawn (cwd=${backendDir}): ${PY} ${argv.join(" ")}`);
  console.log(`[worker] log file: ${logFile}`);
  logStream.write(`[worker] spawn: ${PY} ${argv.join(" ")}\n`);

  const child = spawn(PY, argv, {
    cwd: backendDir,
    env,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

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

  let killed = false;
  const timer = setTimeout(() => {
    killed = true;
    const msg = `\n[worker] TIMEOUT after ${timeoutMs}ms — killing process\n`;
    console.error(msg);
    logStream.write(msg);
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 3000);
  }, timeoutMs);

  return new Promise<{ code: number; logFile: string }>((resolve) => {
    child.on("close", (code) => {
      clearTimeout(timer);
      if (killed && (code === null || code === 0)) code = 124; // timeout exit code
      logStream.end();
      resolve({ code: code ?? 1, logFile });
    });
  });
}

async function allNeighborhoodsFromSite(): Promise<string[]> {
  // keep trivial fallback; UI normally passes explicit neighborhoods
  return ["ABELL", "ALLENDALE"];
}

async function processOneRequest(id: string, payload: any) {
  console.log(`[worker] processing job ${id}`);

  const neighborhoods: string[] = Array.isArray(payload?.neighborhoods)
    ? payload.neighborhoods
    : [];
  const extract: boolean = !!payload?.extract;
  const ocr: boolean = !!payload?.ocr;
  const sinceOverride: string | undefined =
    typeof payload?.since === "string" ? payload.since : undefined;

  const maxFromPayload = Number(payload?.maxPdfsPerNeighborhood || 0);
  const maxOverrideEnv = Number(process.env.SCRAPER_MAX_PDFS || 0);
  const max =
    maxOverrideEnv > 0
      ? maxOverrideEnv
      : maxFromPayload > 0
      ? maxFromPayload
      : 0;

  const nhoods = neighborhoods.length
    ? neighborhoods
    : await allNeighborhoodsFromSite();

  const failures: Array<{ neighborhood: string; err: string }> = [];

  // Start heartbeat updater: bump every 5s while job is running
  const heartbeatInterval = setInterval(async () => {
    try {
      await db
        .update(scrapeRequests)
        .set({ heartbeatAt: new Date() })
        .where(eq(scrapeRequests.id, id));
    } catch (err) {
      console.error(`[worker] heartbeat failed for ${id}:`, err);
    }
  }, HEARTBEAT_INTERVAL_MS);

  try {
    for (const n of nhoods) {
      console.log(`[worker] neighborhood=${n}`);

      // Best-effort per-neighborhood lock; don't starve the job if lock fails
      const nlock = await tryLock(`scrape:${n}`);
      if (!nlock) {
        console.log(`[worker] skip ${n} (could not acquire lock quickly)`);
        continue;
      }

      try {
        const since = await sinceAsString(n, sinceOverride);
        console.log(`[worker] since=${since || "(none)"} max=${max || 0}`);

        const args: string[] = ["--neighborhoods", n, "--out", OUTDIR];
        if (since) args.push("--since", since);
        if (extract) args.push("--extract");
        if (ocr) args.push("--ocr");
        if (max > 0) args.push("--max-pdfs-per-neighborhood", String(max));

        // env-driven flags to match your manual test
        if (process.env.SCRAPER_SKIP_EXISTING === "1")
          args.push("--skip-existing");
        if (process.env.SCRAPER_FORCE_EXTRACT === "1")
          args.push("--force-extract");
        if (process.env.SCRAPER_HEADED === "1") args.push("--headed");
        const slowMo = Number(process.env.SCRAPER_SLOW_MO || 0);
        if (slowMo > 0) args.push("--slow-mo", String(slowMo));

        let ok = false;
        let attempt = 0;
        let result: { code: number; logFile: string } = {
          code: 1,
          logFile: "",
        };

        while (!ok && attempt < 3) {
          attempt++;
          console.log(`[worker] attempt ${attempt} for ${n}`);
          result = await runPython(id, args, PER_NHOOD_TIMEOUT_MS);
          ok = result.code === 0;
          if (!ok) await new Promise((r) => setTimeout(r, attempt * 2000));
        }

        if (!ok) {
          const tail = fs.existsSync(result.logFile)
            ? fs.readFileSync(result.logFile, "utf8").slice(-8000)
            : "no log";
          failures.push({
            neighborhood: n,
            err: `Python exited ${result.code}. Log: ${result.logFile}\nTail:\n${tail}`,
          });
        }
      } finally {
        await unlock(`scrape:${n}`);
      }
    }
  } finally {
    // Stop heartbeat
    clearInterval(heartbeatInterval);
  }

  if (failures.length) {
    const msg = failures.map((f) => `${f.neighborhood}: ${f.err}`).join("\n\n");
    await db
      .update(scrapeRequests)
      .set({ status: "error", finishedAt: new Date(), ok: false, error: msg })
      .where(eq(scrapeRequests.id, id));
    console.log(`[worker] job ${id} -> ERROR`);
  } else {
    await db
      .update(scrapeRequests)
      .set({ status: "success", finishedAt: new Date(), ok: true })
      .where(eq(scrapeRequests.id, id));
    console.log(`[worker] job ${id} -> SUCCESS`);
  }
}

async function claimOneQueued() {
  const rows = await db.execute<{ id: string; payload: any }>(sql`
    update scrape_requests
       set status = 'running',
           started_at = now(),
           heartbeat_at = now()
     where id = (
       select id from scrape_requests
        where status = 'queued'
        order by created_at asc
        for update skip locked
        limit 1
     )
     returning id, payload
  `);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

/**
 * Reaper: mark stale running jobs as error.
 * A job is stale if it's been running for > staleMinutes without a heartbeat update.
 */
async function reapStaleRunning(staleMinutes = 15) {
  try {
    const rows = await db.execute<{ id: string; started_at: Date }>(sql`
      update scrape_requests
         set status = 'error',
             finished_at = now(),
             ok = false,
             error = 'stale running job reaped automatically'
       where status = 'running'
         and finished_at is null
         and coalesce(heartbeat_at, started_at) < now() - (${staleMinutes.toString()} || ' minutes')::interval
       returning id, started_at
    `);

    if (Array.isArray(rows) && rows.length > 0) {
      console.log(
        `[worker] reaped ${rows.length} stale job(s):`,
        rows.map((r) => r.id)
      );
    }
  } catch (err) {
    console.error("[worker] reaper failed:", err);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const onceMode = args.includes("--once");

  if (onceMode) {
    console.log("[worker] running in --once mode (single job)");
  } else {
    console.log(
      "[worker] running in infinite loop mode (use --once for single-shot)"
    );
  }

  const ok = await tryLock(GLOBAL_LOCK);
  if (!ok) {
    console.error("[worker] another instance is running (global lock held)");
    process.exit(0);
  }

  try {
    // Run reaper once at startup
    await reapStaleRunning(15);

    // Main loop
    while (true) {
      const job = await claimOneQueued();
      if (!job) {
        if (onceMode) {
          console.log("[worker] no queued jobs (--once mode, exiting)");
          break;
        }
        // In continuous mode, wait and retry
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        continue;
      }

      await processOneRequest(job.id, job.payload);

      if (onceMode) {
        console.log("[worker] job completed (--once mode, exiting)");
        break;
      }

      // Small pause between jobs
      await new Promise((r) => setTimeout(r, 500));
    }
  } finally {
    await unlock(GLOBAL_LOCK);
  }
}

main().catch((e) => {
  console.error("[worker] fatal error:", e);
  process.exit(1);
});
