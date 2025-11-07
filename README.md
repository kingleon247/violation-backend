# next-scraper — Monorepo README (Production-Ready)

A production-focused monorepo that **scrapes Baltimore City Violation Notices**, converts PDFs into structured data, and serves them via a **Next.js + Tailwind Catalyst** UI backed by **PostgreSQL (Drizzle)**. Heavy scraping runs out-of-band in a **worker** so the web stays responsive.

> New engineer? Read this end-to-end. Then run the **Smoke test** at the bottom.  
> This README consolidates the Production Playbook, Handoff notes, and Briefing into one source of truth.

---

## Table of Contents

1. [High-level Overview](#high-level-overview)
2. [What You Get](#what-you-get)
3. [System Diagram](#system-diagram)
4. [Repo Layout](#repo-layout)
5. [Requirements](#requirements)
6. [Environment Variables](#environment-variables)
7. [Install & Setup](#install--setup)
   - [Frontend](#frontend)
   - [Backend](#backend)
   - [Database (Drizzle)](#database-drizzle)
8. [Run (Development)](#run-development)
   - [One-off Debug Run (Headful)](#one-off-debug-run-headful)
9. [API](#api)
   - [POST /api/scrape (enqueue)](#post-apiscrape-enqueue)
   - [GET /api/violations (query)](#get-apiviolations-query)
10. [Incremental Strategy](#incremental-strategy)
11. [Production (DigitalOcean)](#production-digitalocean)
    - [Base Stack](#base-stack)
    - [Clone + Install](#clone--install)
    - [Env on Server](#env-on-server)
    - [PM2](#pm2)
    - [Nginx](#nginx)
    - [Cron (Daily Incremental)](#cron-daily-incremental)
12. [Ops: Logging, Locks, Retries, Politeness](#ops-logging-locks-retries-politeness)
13. [Security & Roles](#security--roles)
14. [Troubleshooting](#troubleshooting)
15. [Roadmap (Nice-to-haves)](#roadmap-nice-to-haves)
16. [Smoke Test](#smoke-test)

---

## High-level Overview

- **DB as source of truth**: `violations` table keyed by `notice_number` (unique).
- **Incremental scraping**: compute per-neighborhood `since` from DB; avoid full rescrapes.
- **Separation of concerns**: Python (Playwright) handles brittle browser/PDF flows; Node serves API/UI and orchestrates jobs.
- **Deployable now** on a single **DigitalOcean droplet** using **PM2 + Nginx**. Schedule daily or run on-demand.

---

## What You Get

- A Next.js (App Router) app using **Tailwind Catalyst v2** components.
- An API layer:
  - `POST /api/scrape` to queue scrape requests (enqueue-only; fast).
  - `GET /api/violations` to query data from Postgres.
- A background **worker** (`scrapeRunner.ts`) that claims jobs, computes `since`, and spawns Python with args.
- A Python **Playwright** scraper that downloads PDFs, extracts text (with optional OCR), and emits JSON/TXT/PDF artifacts.
- **Idempotent upserts** keyed by `notice_number` to prevent duplication across runs.

---

## System Diagram

See the SVG diagram in the repo: **`ARCHITECTURE.svg`**.

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

## Repo Layout

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

**Why this split?**

- Web/API stays responsive.
- Worker does heavy scraping, retries, locks.
- Python handles flaky PDF flows.
- DB dedupes & drives incremental logic.

---

## Requirements

- **OS:** Windows (Git Bash) **or** Linux
- **Node:** 20+ with **pnpm** (`corepack enable`)
- **Python:** **3.11** (Windows: `py -0p` should list 3.11)
- **PostgreSQL:** 14+
- **Playwright Chromium** installed **inside backend venv**
- **Tesseract OCR** _(optional, only when `ocr` is enabled)_

**Sanity checks**

```bash
node -v
pnpm -v
py -0p          # Windows: ensure a 3.11 interpreter
psql --version
tesseract -v    # optional
```

---

## Environment Variables

Create `frontend-app/.env.local`:

```ini
# --- Database & Auth ---
# Prefer DB_URL; the app also accepts DB_URL for convenience.
DB_URL=postgres://USER:PASS@HOST:5432/DBNAME
# DB_URL=postgres://USER:PASS@HOST:5432/DBNAME

NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=REPLACE_WITH_openssl_rand_-base64_32

# Optional allowlist: auto-admit specific emails on first sign-in
ALLOWED_ADMIN_EMAILS=you@domain.com,another@domain.com

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

> **Important:** Use **absolute** paths for `SCRAPER_PATH` and `SCRAPER_OUT` (avoid relative).  
> Add Tesseract to PATH if enabling OCR.

> **PowerShell tip:** Setting env vars inline like `FOO=bar` is a Unix-ism. In PS use `$env:FOO = "bar"` or, better, put them in `.env.local` as above.

---

## Install & Setup

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

---

## Run (Development)

### Terminal A — Web

```bash
cd next-scraper/frontend-app
pnpm dev
```

### Terminal B — Worker

Use **tsx** (fast, zero-config).

```bash
# one-off
pnpm dlx tsx src/worker/scrapeRunner.ts

# or add scripts
pnpm add -D tsx typescript @types/node dotenv
# package.json
# { "scripts": { "worker:dev": "tsx src/worker/scrapeRunner.ts" } }
pnpm run worker:dev
```

### One-off Debug Run (Headful)

```bash
cd next-scraper/backend-app
# venv should still be active
python baltimore_violations_scraper.py --neighborhoods ABELL --since 2025-01-01 --out ./data --extract --headed --slow-mo 150
```

---

## API

### POST /api/scrape (enqueue)

```json
{
  "neighborhoods": ["ABELL"], // omit or [] => all
  "since": "2025-01-01", // optional; worker auto-computes if missing
  "extract": true, // pdf -> text
  "ocr": false, // enable only for image-based PDFs (slow)
  "maxPdfsPerNeighborhood": null
}
```

> Enqueue-only. The worker picks up jobs from `scrape_requests` and updates status (`queued→running→success|error`).

### GET /api/violations (query)

Example:  
`GET /api/violations?neighborhood=ABELL&from=2025-01-01&to=2025-12-31&page=1&limit=25`  
Returns rows suitable for Catalyst tables/cards.

---

## Incremental Strategy

- **Natural key:** `violations.notice_number` (unique).
- **Since window:** compute `since = (MAX(date_notice) + 1 day)` per neighborhood.
- **Idempotent upserts:** repeating the same `notice_number` is harmless (upsert overwrites).
- Uses the site’s “Record Count” / “Date Notice” to avoid blanket rescraping.

---

## Production (DigitalOcean)

### Base Stack

```bash
sudo apt update
sudo apt install -y git python3.11 python3.11-venv tesseract-ocr libgbm1 libnss3 libasound2 fonts-liberation
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
corepack enable
```

### Clone + Install

```bash
sudo mkdir -p /srv/next-scraper && sudo chown -R $USER:$USER /srv/next-scraper
cd /srv/next-scraper
git clone <your-repo-url> .

cd backend-app && python3.11 -m venv .venv && source .venv/bin/activate &&   python -m pip install -U pip && pip install -r requirements.txt &&   python -m playwright install chromium

cd ../frontend-app && pnpm install && pnpm build
```

### Env on Server

Place `.env.local` under `/srv/next-scraper/frontend-app` (Linux paths).

### PM2

```bash
cd /srv/next-scraper/frontend-app
pnpm dlx pm2@latest start ecosystem.config.js
pm2 save && pm2 startup
```

### Nginx

- Reverse proxy to `127.0.0.1:3000`
- Enable **HTTPS** with Certbot
- Set `client_max_body_size 64m` if you upload large files

### Cron (Daily Incremental)

```
0 6 * * * curl -s -X POST http://127.0.0.1:3000/api/scrape -H 'content-type: application/json' -d '{}' >/dev/null 2>&1
```

---

## Ops: Logging, Locks, Retries, Politeness

- **Logs:** `pm2 logs` (web + worker). Per-job Python logs in `backend-app/data/logs/scrape-<jobId>.log`.
- **Advisory locks:** one global lock for the runner + per-neighborhood locks.
- **Retries:** worker retries up to 3× with backoff.
- **Politeness:** built-in waits; adjust if the city portal throttles.

---

## Security & Roles

- Protect `POST /api/scrape` behind **NextAuth** role (e.g., `admin`).
- Avoid exposing raw artifact paths; if pushing to S3/Spaces, prefer signed URLs.
- Keep `.env.local` **out** of version control.

---

## Troubleshooting

**Playwright not found / ModuleNotFoundError**

```bash
cd backend-app && source .venv/Scripts/activate     # Linux: source .venv/bin/activate
pip install -r requirements.txt
python -m playwright install chromium
```

**Worker shows “no queued jobs”**  
It’s waiting. Enqueue via `POST /api/scrape` or the UI page.

**Job shows `error`**  
Open `backend-app/data/logs/scrape-<jobId>.log` for the full Traceback. Common issues: bad `SCRAPER_PATH`, Playwright not installed in venv, site markup changed.

**Windows path bugs**  
Use absolute forward-slash paths in `.env.local` (e.g., `C:/path/...`).

**Drizzle execute results**  
`db.execute()` returns an **array**, **not** `{ rows }`.

**Postgres warning `25P01: SET LOCAL ...`**  
In `src/app/api/violations/route.ts`, execute `SET LOCAL` **inside a transaction** and run both queries using `tx`. (A drop-in example is in recent commits.)

---

## Roadmap (Nice-to-haves)

- Push artifacts to S3/Spaces; store only URLs in DB.
- Completion webhooks (Slack/Email).
- Admin UI: job queue, failure drill-down, retry button.
- Canonical `neighborhoods` table (don’t rely on live scrape for discovery).

---

## Smoke Test

```bash
# Web
cd frontend-app && pnpm dev

# Worker
cd frontend-app && pnpm dlx tsx src/worker/scrapeRunner.ts

# Calls
curl -s http://localhost:3000/api/neighborhoods
curl -s -X POST http://localhost:3000/api/scrape -H 'content-type: application/json' -d '{"neighborhoods":["ABELL"],"extract":true,"ocr":false}'
curl -s "http://localhost:3000/api/violations?neighborhood=ABELL&from=2025-01-01"
```
