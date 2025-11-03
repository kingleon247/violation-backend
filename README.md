# next-scraper

**Monorepo** for a production-grade Baltimore City code-violations scraper with a **Next.js (App Router) + Tailwind Catalyst** frontend and a **Python/Playwright** backend; data is persisted in **PostgreSQL (Drizzle ORM)** and files (PDF/TXT/JSON) are written to the backend `data/` folder (optionally upload to S3/Spaces later).

Designed for **Windows + Git Bash**, **pnpm**, **NextAuth v4**, **Drizzle (postgres.js)**, and **PM2** on a DigitalOcean droplet. Scraping is **incremental** per neighborhood and is executed by a **Node worker** so the web server isn’t blocked.

---

## Contents

- Repo layout  
- What it does  
- Quick start (dev, Windows)  
- Environment variables  
- Database schema & migrations (Drizzle)  
- Scraping pipeline  
- APIs  
- Running in production (DO droplet + PM2)  
- Incremental, daily & on-demand scrapes  
- Catalyst UI notes  
- Troubleshooting  
- Roadmap

---

## Repo layout

next-scraper/
├─ frontend-app/ # Next.js 15/16, App Router, pnpm, Catalyst UI
│ ├─ src/
│ │ ├─ app/
│ │ │ ├─ api/
│ │ │ │ ├─ scrape/route.ts # enqueue scrape job + GET status
│ │ │ │ └─ violations/route.ts # query violations from DB
│ │ │ └─ (your app pages/components)
│ │ ├─ db/
│ │ │ ├─ migrations/schema.ts # auth + violations + scrape_requests
│ │ │ ├─ incremental.ts # compute per-neighborhood since-date
│ │ │ ├─ locks.ts # advisory locks (pg_try_advisory_lock)
│ │ │ └─ ... drizzle client setup
│ │ ├─ worker/scrapeRunner.ts # PM2 worker: pulls queued job, runs py
│ │ └─ lib/python.ts # (optional) path helpers
│ └─ ecosystem.config.js # PM2 app+worker (prod)
│
└─ backend-app/ # Python scraper + data artifacts
├─ baltimore_violations_scraper.py
├─ requirements.txt
└─ data/
├─ pdf/<NEIGHBORHOOD>/.pdf
├─ text/<NEIGHBORHOOD>/.txt
├─ json/<NEIGHBORHOOD>/*.json
└─ violations.csv (optional export)

markdown
Copy code

---

## What it does

- Navigates the DHCD site with **Playwright** (Chromium).
- Scrapes table rows (Address, Type, Date Notice, Notice Number, District, Neighborhood).
- **Downloads** “See Notice” PDFs and handles pop-ups vs direct downloads.
- Optional **text extraction / OCR** → writes `.txt` + structured `.json`.
- **UPSERTS into Postgres** (`violations`). Natural key = `notice_number`.
- **Incremental** per neighborhood using `date_notice` (no full re-scrapes).
- Frontend exposes browse/search APIs and a scrape queue endpoint.

> Use responsibly. Respect site terms / robots. Polite delays are included.

---

## Quick start (dev, Windows)

**Prereqs**: Node 20+, **pnpm**, Python **3.11**, Git Bash, PostgreSQL, Tesseract OCR (optional, for `--ocr`).

1) **Clone & install frontend**
```bash
cd /c/Users/kingl/__code
git clone <your-remote> next-scraper
cd next-scraper/frontend-app
pnpm install
cp .env.example .env.local   # fill in DB + NextAuth secrets
Backend venv + deps + browser

bash
Copy code
cd ../backend-app
py -3.11 -m venv .venv
source .venv/Scripts/activate
python -m pip install -U pip
pip install -r requirements.txt
python -m playwright install chromium
# optional OCR
tesseract -v
DB (Drizzle, postgres.js)

Set DATABASE_URL in frontend-app/.env.local

Run migrations (see section below)

Run dev

bash
Copy code
# terminal A (frontend)
cd frontend-app
pnpm dev

# terminal B (worker – ts-node or built file)
cd frontend-app
pnpm ts-node src/worker/scrapeRunner.ts   # or: pnpm build && node .next/standalone/src/worker/scrapeRunner.js
Try APIs

bash
Copy code
# list neighborhoods (placeholder list for now)
curl -s http://localhost:3000/api/neighborhoods

# enqueue a scrape (ABELL, extract on, OCR off)
curl -s -X POST http://localhost:3000/api/scrape \
  -H "content-type: application/json" \
  -d '{"neighborhoods":["ABELL"],"extract":true,"ocr":false}'

# check recent jobs
curl -s http://localhost:3000/api/scrape

# query violations
curl -s "http://localhost:3000/api/violations?neighborhood=ABELL&from=2025-01-01"
Environment variables
Frontend (frontend-app/.env.local)

ini
Copy code
# Drizzle postgres.js connection
DATABASE_URL=postgres://user:pass@host:5432/dbname

# NextAuth v4
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=replace_me
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
Worker env (PM2 or process)

ini
Copy code
SCRAPER_PY=py
SCRAPER_PY_VERSION=-3.11
SCRAPER_PATH=C:/Users/kingl/__code/next-scraper/backend-app/baltimore_violations_scraper.py
SCRAPER_OUT=C:/Users/kingl/__code/next-scraper/backend-app/data

# OCR (if installed)
TESSDATA_PREFIX=C:/Program Files/Tesseract-OCR/tessdata
Database schema & migrations (Drizzle)
Covers:

Auth tables (users, accounts, sessions, verification_tokens).

violations (unique by notice_number, indexes: neighborhood, date_notice).

scrape_requests (queue for enqueued jobs).

You’ve switched to the array form for extra config (new Drizzle API).

Migrations

bash
Copy code
# from frontend-app
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
If you moved schema paths or aliases (@db/...), update drizzle config.

Scraping pipeline
Enqueue via POST /api/scrape ({ neighborhoods?: string[], extract?: boolean, ocr?: boolean }).

Worker (src/worker/scrapeRunner.ts):

Grabs a global advisory lock.

Atomically marks oldest queued job → running.

For each neighborhood:

Computes since-date from DB (last violations.date_notice + 1 day).

Runs Python with --neighborhoods, --since, --out, --extract, --ocr.

Retries up to 3 times with backoff.

Sets status=success|error, ok=true|false, error=<text>.

Python does scraping, downloads, (optional) extract/OCR, and writes artifacts. (If you prefer direct DB upserts from Python, wire it—current design treats the DB as the source of truth and lets app logic handle inserts.)

APIs
POST /api/scrape → { ok: true, id } (enqueues fast).

GET /api/scrape?id=<uuid> → job status.

GET /api/scrape → recent 20 jobs.

GET /api/violations?neighborhood=ABELL&from=YYYY-MM-DD&to=YYYY-MM-DD → rows.

GET /api/neighborhoods → static/derived list (Python discovery later).

Running in production (DO droplet + PM2)
Build Next.js

bash
Copy code
cd frontend-app
pnpm build
PM2 config (frontend-app/ecosystem.config.js)

js
Copy code
module.exports = {
  apps: [
    {
      name: "next-scraper-web",
      cwd: "./",
      script: "pnpm",
      args: "start",
      env: { NODE_ENV: "production" },
    },
    {
      name: "next-scraper-worker",
      cwd: "./",
      script: "node",
      args: ".next/standalone/src/worker/scrapeRunner.js",
      env: {
        NODE_ENV: "production",
        SCRAPER_PY: "py",
        SCRAPER_PY_VERSION: "-3.11",
        SCRAPER_PATH: "/home/youruser/next-scraper/backend-app/baltimore_violations_scraper.py",
        SCRAPER_OUT: "/home/youruser/next-scraper/backend-app/data",
        TESSDATA_PREFIX: "/usr/share/tesseract-ocr/5/tessdata",
      },
    },
  ],
};
Start with PM2

bash
Copy code
cd frontend-app
pm2 start ecosystem.config.js
pm2 save
pm2 status
Nginx: reverse proxy :3000 to your domain; you can serve files directly from backend-app/data/ or stream via the app.

Incremental, daily & on-demand scrapes
Incremental: based on violations.date_notice per neighborhood (DB truth).

On-demand: UI calls POST /api/scrape with { neighborhoods, extract, ocr }.

Daily: schedule a HTTP call:

bash
Copy code
curl -s -X POST https://yourdomain.com/api/scrape -H 'content-type: application/json' -d '{}'
Empty payload = all neighborhoods (incremental).

Catalyst UI notes
Components under app/components/catalyst/*.

Keep UI snappy: server-paginate /api/violations; add filters:

neighborhood (select)

date range (from/to)

quick text search (basic now; full-text later)

Troubleshooting
Playwright can’t find modules when called from Next API/worker
Use the system py launcher with -3.11 and absolute script paths; you don’t need to “activate” a venv from Node.

tesseract: command not found (Git Bash)
Install the Windows build and add C:\\Program Files\\Tesseract-OCR to User PATH. New shell → tesseract -v.

Drizzle deprecation on pgTable 3rd arg
You’re using the new array form—good.

Type error: .rows doesn’t exist on db.execute
With postgres.js + Drizzle, db.execute() returns an array:

ts
Copy code
const rows = await db.execute(sql`select ...`);
const first = rows[0];
Worker “idle” (blinking cursor)
It’s waiting for a queued job—POST /api/scrape then watch logs.

Roadmap
Discover neighborhoods dynamically in Python (not static).

Push PDFs/TXT to S3/Spaces; keep pdfUrl/textUrl as HTTPS.

Full-text search (to_tsvector) over extracted text.

Per-neighborhood rate-limits + smarter backoff.

License
Internal project for research/compliance usage. Verify & respect DHCD site terms before bulk scraping.
