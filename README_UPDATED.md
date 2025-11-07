# next-scraper — Monorepo README (Updated: no Windows PM2, DB_URL only)

A production‑focused monorepo that scrapes Baltimore City Violation Notices, converts PDFs into structured data, and serves them via a **Next.js + Tailwind Catalyst** UI backed by **PostgreSQL (Drizzle)**. Heavy scraping runs out‑of‑band in a **worker** so the web stays responsive.

> This revision removes PM2 usage on **Windows dev** (use `pnpm run worker:dev`). PM2 remains **Linux/Droplet only**.

---

## What changed in this update

- **No PM2 on Windows dev.** PM2 + `.cmd` shims (e.g., `TSX.CMD`) cause the `SyntaxError: Invalid or unexpected token` you hit. Use `pnpm run worker:dev` locally.
- **DB env is `DB_URL` only.** Never use `DATABASE_URL` in this repo.
- Clear split between **Local Dev (Windows)** vs **Production (Droplet/Linux)**.
- Added **reap stale jobs** + **diagnostics** expectations in the worker.
- Added troubleshooting for: *“no queued jobs”*, *Playwright install*, *pathing*, and *TSX on PM2*.

---

## System Overview

- **DB as source of truth**: `violations` (unique key: `notice_number`), `scrape_requests` (job queue).
- **Incremental scraping**: worker auto‑computes `since` per neighborhood from DB.
- **Separation**: Python (Playwright) handles site/PDF flows; Node serves API/UI + orchestrates jobs.
- **Deployable** on a single DigitalOcean droplet with **PM2 + Nginx** (Linux only).

```
Next.js (UI/API) ──POST /api/scrape──► scrape_requests (DB) ◄─GET /api/violations── UI
                                   ▲         │ claim/update
                                   │         ▼
                               Worker (Node) ──spawn──► Python (Playwright) ─► artifacts (pdf/text/json)
```

---

## Repo Layout

```
next-scraper/
├─ frontend-app/
│  ├─ src/
│  │  ├─ app/api/scrape/route.ts
│  │  ├─ app/api/violations/route.ts
│  │  ├─ db/migrations/schema.ts
│  │  ├─ db/incremental.ts
│  │  ├─ db/locks.ts
│  │  └─ worker/scrapeRunner.ts
│  └─ package.json
└─ backend-app/
   ├─ baltimore_violations_scraper.py
   ├─ requirements.txt
   └─ data/  (pdf/, text/, json/, logs/)
```

---

## Requirements

- **Windows dev** or **Linux**.
- **Node 20+** with **pnpm** (`corepack enable`).
- **Python 3.11** with virtualenv.
- **PostgreSQL 14+**.
- **Playwright Chromium** installed **inside the backend venv**.
- **Tesseract OCR** (optional, only if `--ocr`).

---

## Environment (`frontend-app/.env.local`)

```ini
# --- Database (always DB_URL) ---
DB_URL=postgres://USER:PASS@HOST:5432/DBNAME

# --- NextAuth (if used) ---
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=REPLACE_WITH_openssl_rand_-base64_32
ALLOWED_ADMIN_EMAILS=you@domain.com,another@domain.com

# --- Scraper wiring (Windows absolute paths recommended) ---
# Use either the Python launcher + version flag, or a full path to python.exe
SCRAPER_PY=py
SCRAPER_PY_VERSION=-3.11
SCRAPER_PATH=C:/Users/you/__code/next-scraper/backend-app/baltimore_violations_scraper.py
SCRAPER_OUT=C:/Users/you/__code/next-scraper/backend-app/data
TESSDATA_PREFIX=C:/Program Files/Tesseract-OCR/tessdata

# Job timeout per neighborhood (ms). Default is ~8 minutes if unset.
SCRAPER_TIMEOUT_MS=480000
```

> **Windows paths**: Prefer forward slashes in `.env.local` (e.g., `C:/...`).

---

## Install

### Frontend

```bash
cd next-scraper/frontend-app
pnpm install
```

### Backend

```bash
cd ../backend-app
py -3.11 -m venv .venv
# Windows
.\.venv\Scriptsctivate
# Linux/Mac
# source .venv/bin/activate

python -m pip install -U pip
pip install -r requirements.txt
python -m playwright install chromium
```

### Database (Drizzle)

```bash
cd ../frontend-app
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

Ensure your `scrape_requests` table has these columns (Drizzle schema example):

```ts
// src/db/migrations/schema.ts
import { pgTable, uuid, timestamp, text, boolean, jsonb, pgEnum } from "drizzle-orm/pg-core";

export const scrapeStatus = pgEnum("scrape_status", ["queued","running","success","error"]);

export const scrapeRequests = pgTable("scrape_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
  finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
  status: scrapeStatus("status").default("queued").notNull(),
  payload: jsonb("payload").notNull(),
  ok: boolean("ok"),
  error: text("error"),
});
```

---

## Run (Local Development)

### Terminal A — Web

```bash
cd frontend-app
pnpm dev
```

### Terminal B — Worker (no PM2 on Windows)

```bash
cd frontend-app
pnpm run worker:dev
# which runs: tsx src/worker/scrapeRunner.ts
```

### Enqueue a job

- Use the UI at `/scrape/new`, or
- cURL:
  ```bash
  curl -s -X POST http://localhost:3000/api/scrape     -H 'content-type: application/json'     -d '{"neighborhoods":["ABELL"],"extract":true,"ocr":false,"maxPdfsPerNeighborhood":1}'
  ```

### Inspect job/logs

- DB row in `scrape_requests` (status moves: `queued` → `running` → `success|error`).
- Python log: `backend-app/data/logs/scrape-<jobId>.log`.

---

## Production (Droplet / Linux only)

> Only do this on Linux. **Do not use PM2 for Windows dev.**

Install base stack:

```bash
sudo apt update
sudo apt install -y git python3.11 python3.11-venv tesseract-ocr libgbm1 libnss3 libasound2 fonts-liberation
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
corepack enable
```

Clone + build:

```bash
sudo mkdir -p /srv/next-scraper && sudo chown -R $USER:$USER /srv/next-scraper
cd /srv/next-scraper
git clone <your-repo-url> .

cd backend-app
python3.11 -m venv .venv && source .venv/bin/activate
python -m pip install -U pip
pip install -r requirements.txt
python -m playwright install chromium

cd ../frontend-app
pnpm install
pnpm build
```

Create `/srv/next-scraper/frontend-app/.env.local` with **Linux paths**:

```ini
DB_URL=postgres://USER:PASS@HOST:5432/DBNAME
SCRAPER_PY=python3
SCRAPER_PY_VERSION=
SCRAPER_PATH=/srv/next-scraper/backend-app/baltimore_violations_scraper.py
SCRAPER_OUT=/srv/next-scraper/backend-app/data
TESSDATA_PREFIX=/usr/share/tesseract-ocr/5/tessdata
```

PM2 (Linux only):

```bash
cd /srv/next-scraper/frontend-app
pnpm dlx pm2@latest start ecosystem.config.js
pm2 save && pm2 startup
```

> **ecosystem.config.js** should run the **worker** with `node --loader tsx/esm` or compiled JS — not the Windows `.cmd` shim. Example is in the repo.

Nginx proxies to `127.0.0.1:3000` and handles TLS (Certbot).

Cron (optional daily incremental):

```
0 6 * * * curl -s -X POST http://127.0.0.1:3000/api/scrape -H 'content-type: application/json' -d '{}' >/dev/null 2>&1
```

---

## Troubleshooting

**“Worker says no queued jobs”**
- Ensure you actually enqueued via `/scrape/new` or POST `/api/scrape`.
- Worker logs a `[diag:start]` block on boot with job counts. If it shows `(none)`, there are no `queued` rows.

**Playwright/Chromium missing**
- Activate venv, reinstall requirements, and run `python -m playwright install chromium` **inside the venv**.

**TSX .CMD error on Windows PM2**
- That’s why PM2 is disabled on Windows dev. Use `pnpm run worker:dev` locally.
- On Linux PM2, launch with `node --loader tsx` **or** precompile TypeScript to JS and run `node dist/worker.js`.

**Windows paths**
- Keep absolute, forward‑slash paths in `.env.local` (e.g., `C:/...`).

**DB URL**
- This repo uses `DB_URL` everywhere. Never set or reference `DATABASE_URL`.

---

## Smoke Test

```bash
# Web
cd frontend-app && pnpm dev

# Worker
cd frontend-app && pnpm run worker:dev

# Enqueue
curl -s -X POST http://localhost:3000/api/scrape   -H 'content-type: application/json'   -d '{"neighborhoods":["ABELL"],"maxPdfsPerNeighborhood":1,"extract":true,"ocr":false}'
```
