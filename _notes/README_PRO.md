# next-scraper — Production Playbook (README_PRO)

A production-focused monorepo for scraping **Baltimore City Violation Notices**, converting PDFs into structured data, and serving them via a **Next.js + Tailwind Catalyst** UI backed by **PostgreSQL (Drizzle)**. Scrapes run in an out-of-band **worker** so the web stays responsive.

> This is the production-facing README. If you're a new engineer, read this end-to-end, then run the **Smoke test** at the bottom.

---

## Table of Contents

- [What you get](#what-you-get)
- [System diagram (high level)](#system-diagram-high-level)
- [Repo layout](#repo-layout)
- [Prereqs](#prereqs)
- [Environment](#environment)
- [Install](#install)
  - [Frontend](#frontend)
  - [Backend](#backend)
  - [Database (Drizzle)](#database-drizzle)
- [Run (dev)](#run-dev)
  - [One-off debug run (headful)](#one-off-debug-run-headful)
- [API](#api)
  - [Enqueue](#enqueue)
  - [Query](#query)
- [Incremental strategy](#incremental-strategy)
- [Production (DigitalOcean) quick guide](#production-digitalocean-quick-guide)
  - [Base stack](#base-stack)
  - [Clone + install](#clone--install)
  - [Env](#env)
  - [PM2](#pm2)
  - [Nginx](#nginx)
  - [Cron (optional daily)](#cron-optional-daily)
- [Ops: logging, locks, retries](#ops-logging-locks-retries)
- [Security & roles](#security--roles)
- [Troubleshooting](#troubleshooting)
- [Roadmap (nice-to-haves)](#roadmap-nice-to-haves)
- [Smoke test](#smoke-test)

---

## What you get

- **DB as source of truth:** `violations` table keyed by `notice_number` (unique).
- **Incremental scraping:** per-neighborhood `since` date is computed from DB — no full rescrapes.
- **Separation of concerns:** Python (Playwright) does the brittle browser work; Node handles API/UI.
- **Deployable now** on a single DO droplet with **PM2 + Nginx**. Daily or on-demand jobs.

---

## System diagram (high level)

```
┌────────────────────┐        POST /api/scrape            ┌───────────────────────┐
│ Next.js (App+API)  ├───────────────────────────────────>│ scrape_requests (DB)  │
│  - Tailwind Catalyst│        GET /api/violations         └────────┬──────────────┘
└──────────┬─────────┘                                           claim (lock)
           │                                                     update status
           ▼
┌────────────────────┐  spawn py + args   ┌──────────────────────────────────────┐
│ Worker (Node)      ├───────────────────>│ Python (Playwright)                 │
│  - advisory locks  │                    │ - finds rows                         │
│  - retry/backoff   │                    │ - downloads PDFs / handles popups    │
└──────────┬─────────┘                    │ - extract text / optional OCR        │
           │                              └───────────┬──────────────────────────┘
           ▼                                          │
       upsert rows (unique: notice_number)            │ writes JSON/TXT/PDF
       set job status                                 ▼
                                                artifacts folder
```

---

## Repo layout

```
next-scraper/
├─ frontend-app/
│  ├─ src/
│  │  ├─ app/api/
│  │  │  ├─ scrape/route.ts           # enqueue only (never long-running)
│  │  │  └─ violations/route.ts       # read DB
│  │  ├─ db/migrations/schema.ts      # auth + violations + scrape_requests
│  │  ├─ db/incremental.ts            # compute since per neighborhood
│  │  ├─ db/locks.ts                  # Postgres advisory locks
│  │  └─ worker/scrapeRunner.ts       # PM2 worker; runs Python 3.11
│  └─ ecosystem.config.js             # PM2 profile (web + worker)
│
└─ backend-app/
   ├─ baltimore_violations_scraper.py  # resilient scraper (downloads + popups)
   ├─ requirements.txt
   └─ data/                            # pdf/, text/, json/ artifacts (if kept local)
```

---

## Prereqs

- Windows (Git Bash) **or** Linux
- Node 20+, **pnpm** (`corepack enable`)
- Python **3.11** (`py -0p` should show a 3.11 install on Windows)
- PostgreSQL 14+
- Tesseract OCR _(optional, only if enabling OCR)_
- Playwright Chromium **installed in the backend venv**

**Sanity checks:**

```bash
node -v
pnpm -v
py -0p
psql --version
tesseract -v   # optional
```

---

## Environment

Create `frontend-app/.env.local`:

```ini
# --- Auth/DB ---
DB_URL=postgres://user:pass@host:5432/db
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=replace_me

# --- Scraper wiring (Windows) ---
SCRAPER_PY=py
SCRAPER_PY_VERSION=-3.11
SCRAPER_PATH=C:/Users/you/__code/next-scraper/backend-app/baltimore_violations_scraper.py
SCRAPER_OUT=C:/Users/you/__code/next-scraper/backend-app/data
TESSDATA_PREFIX=C:/Program Files/Tesseract-OCR/tessdata

# --- Linux/DO example ---
# SCRAPER_PY=python3
# SCRAPER_PY_VERSION=
# SCRAPER_PATH=/srv/next-scraper/backend-app/baltimore_violations_scraper.py
# SCRAPER_OUT=/srv/next-scraper/backend-app/data
# TESSDATA_PREFIX=/usr/share/tesseract-ocr/5/tessdata
```

> **Note:** Do **not** use relative paths for `SCRAPER_PATH` / `SCRAPER_OUT`. Keep them absolute.

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
source .venv/Scripts/activate
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

---

## Run (dev)

### Terminal A — Web

```bash
cd next-scraper/frontend-app
pnpm dev
```

### Terminal B — Worker

```bash
cd next-scraper/frontend-app
pnpm ts-node src/worker/scrapeRunner.ts
```

### One-off debug run (headful)

```bash
cd next-scraper/backend-app
source .venv/Scripts/activate
python baltimore_violations_scraper.py --neighborhoods ABELL --out ./data --extract --headed --slow-mo 200
```

---

## API

### Enqueue

`POST /api/scrape`

```json
{
  "neighborhoods": ["ABELL"], // omit or [] => all
  "since": "2025-01-01", // optional; worker auto-computes if missing
  "extract": true, // pdf -> text
  "ocr": false, // enable only for image-based PDFs (slow)
  "maxPdfsPerNeighborhood": null
}
```

> Enqueue-only. The worker picks up jobs from `scrape_requests`.

### Query

`GET /api/violations?neighborhood=ABELL&from=2025-01-01&to=2025-12-31`  
Returns rows from DB for your Catalyst tables/cards.

---

## Incremental strategy

- **Unique:** `violations.notice_number` (natural key).
- **Since:** `MAX(date_notice)` per neighborhood → next scrape window starts the day after.
- **Idempotent:** Upserts overwrite the same `notice_number`. Repeats are harmless.

This leverages the site’s “Record Count” / “Date Notice” without scraping everything.

---

## Production (DigitalOcean) quick guide

### Base stack

```bash
sudo apt update
sudo apt install -y git python3.11 python3.11-venv tesseract-ocr libgbm1 libnss3 libasound2 fonts-liberation
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
corepack enable
```

### Clone + install

```bash
sudo mkdir -p /srv/next-scraper && sudo chown -R $USER:$USER /srv/next-scraper
cd /srv/next-scraper
git clone <your-repo-url> .

cd backend-app && python3.11 -m venv .venv && source .venv/bin/activate && \
  python -m pip install -U pip && pip install -r requirements.txt && \
  python -m playwright install chromium

cd ../frontend-app && pnpm install && pnpm build
```

### Env

Put `.env.local` in `/srv/next-scraper/frontend-app` (use Linux paths).

### PM2

```bash
cd /srv/next-scraper/frontend-app
pnpm dlx pm2@latest start ecosystem.config.js
pm2 save && pm2 startup
```

### Nginx

Reverse proxy to `127.0.0.1:3000`; enable **HTTPS** with Certbot.  
Set `client_max_body_size 64m` if you upload large files.

### Cron (optional daily)

```
0 6 * * * curl -s -X POST http://127.0.0.1:3000/api/scrape -H 'content-type: application/json' -d '{}' >/dev/null 2>&1
```

---

## Ops: logging, locks, retries

- **Logs:** `pm2 logs` (web + worker). Consider per-app log files.
- **Advisory locks:** One global lock for the runner, plus per-neighborhood locks → no clobbering.
- **Retries:** Worker retries scraper up to 3x with backoff.
- **Politeness:** Built-in waits; tune if the city throttles.

---

## Security & roles

- Gate `POST /api/scrape` behind **NextAuth** role (e.g., `admin`).
- Avoid exposing raw artifact paths; prefer signed URLs if moving to S3/Spaces.
- Keep `.env.local` **out** of version control.

---

## Troubleshooting

**ModuleNotFoundError: playwright**

```bash
cd backend-app && source .venv/Scripts/activate
pip install -r requirements.txt
python -m playwright install chromium
```

**Worker “idle”**  
It’s waiting for jobs. Enqueue via `POST /api/scrape`.

**CSV empty after interrupt**  
Use the JSON snapshots to reconstruct (helper script in backend).

**OCR slow**  
Only enable `ocr` for image-based PDFs. Default to extract only.

**Windows path bugs**  
Keep absolute forward-slash paths in `.env.local` (e.g., `C:/path/...`).

**Drizzle execute results**  
`db.execute()` returns an array, not `{ rows }`.

---

## Roadmap (nice-to-haves)

- Push artifacts to S3/Spaces and store only URLs in DB.
- Webhook on completion (Slack/Email).
- Admin UI: job queue, failures, re-try button.
- Persist a neighborhood catalog table for discovery, not scraped live.

---

## Smoke test

```bash
# Web
cd frontend-app && pnpm dev

# Worker
cd frontend-app && pnpm ts-node src/worker/scrapeRunner.ts

# Calls
curl -s http://localhost:3000/api/neighborhoods
curl -s -X POST http://localhost:3000/api/scrape -H 'content-type: application/json' -d '{"neighborhoods":["ABELL"],"extract":true,"ocr":false}'
curl -s "http://localhost:3000/api/violations?neighborhood=ABELL&from=2025-01-01"
```
