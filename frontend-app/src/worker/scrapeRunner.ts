// src/worker/scrapeRunner.ts
/**
 * Production-friendly scrape runner:
 * - single-runner global advisory lock
 * - claims one queued job at a time (SKIP LOCKED)
 * - streams Python logs to file, retries per neighborhood
 * - heartbeats while running; optional reaper elsewhere can use heartbeat_at
 *
 * Env:
 *   DB_URL=postgres://...
 *   SCRAPER_PY=C:/Users/kingl/__code/next-scraper/backend-app/.venv/Scripts/python.exe
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
const PY = process.env.SCRAPER_PY || "py";
const PY_VERSION = process.env.SCRAPER_PY_VERSION || "";
const SCRAPER =
  process.env.SCRAPER_PATH ??
  path.resolve(process.cwd(), "../backend-app/baltimore_violations_scraper.py");
const OUTDIR =
  process.env.SCRAPER_OUT ?? path.resolve(process.cwd(), "../backend-app/data");
const PER_NHOOD_TIMEOUT_MS = Number(
  process.env.SCRAPER_TIMEOUT_MS || 8 * 60_000
);

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

  const logFile = path.join(OUTDIR, "logs", `scrape-${jobId}.log`);
  const logStream = fs.createWriteStream(logFile, { flags: "a" });

  const backendDir = path.resolve(SCRAPER, "..");
  const env = { ...process.env, PYTHONUNBUFFERED: "1" };

  const argv = (PY_VERSION ? [PY_VERSION, SCRAPER] : [SCRAPER]).concat(args);

  console.log(`[worker] spawn (cwd=${backendDir}): ${PY} ${argv.join(" ")}`);

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
    logStream.write(
      `\n[worker] TIMEOUT after ${timeoutMs}ms — killing process\n`
    );
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 3000);
  }, timeoutMs);

  return new Promise<{ code: number; logFile: string }>((resolve) => {
    child.on("close", (code) => {
      clearTimeout(timer);
      if (killed && (code === null || code === 0)) code = 124;
      logStream.end();
      resolve({ code: code ?? 1, logFile });
    });
  });
}

async function allNeighborhoodsFromSite(): Promise<string[]> {
  // keep trivial fallback; UI normally passes explicit neighborhoods
  return ["ABELL", "ALLENDALE"];
}

async function heartbeat(jobId: string, stopSignal: { stop: boolean }) {
  // bump every 10s while running
  while (!stopSignal.stop) {
    await db
      .update(scrapeRequests)
      .set({ heartbeatAt: new Date() })
      .where(eq(scrapeRequests.id, jobId));
    await new Promise((r) => setTimeout(r, 10_000));
  }
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

  // start heartbeat pinger
  const stop = { stop: false };
  const hb = heartbeat(id, stop);

  try {
    for (const n of nhoods) {
      console.log(`[worker] neighborhood=${n}`);
      const nlock = await tryLock(`scrape:${n}`);
      if (!nlock) {
        console.log(`[worker] skip ${n} (could not acquire lock)`);
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
  } finally {
    // stop heartbeat
    stop.stop = true;
    await hb;
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

async function main() {
  const ok = await tryLock(GLOBAL_LOCK);
  if (!ok) {
    console.error("[worker] another instance is running");
    process.exit(0);
  }
  try {
    const job = await claimOneQueued();
    if (!job) {
      console.log("[worker] no queued jobs");
      return;
    }
    await processOneRequest(job.id, job.payload);
  } finally {
    await unlock(GLOBAL_LOCK);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
