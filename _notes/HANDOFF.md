# Project Handoff – next-scraper

A production-focused monorepo that scrapes Baltimore City code-violation notices (PDFs + metadata), extracts text, and surfaces the data via a Next.js + Tailwind Catalyst UI. Backend scraping is Python/Playwright; data lives in Postgres via Drizzle ORM. Built for **Windows + Git Bash**, **pnpm**, **Python 3.11**, and **PM2** on a DigitalOcean droplet.

> This is the crash-course for a new engineer/agent. Follow the checklists verbatim.

---

## 0) High-level map

```
next-scraper/
├─ frontend-app/ # Next.js App Router + Catalyst UI
│  ├─ src/
│  │  ├─ app/api/
│  │  │  ├─ scrape/route.ts # enqueue scrape jobs (no heavy work here)
│  │  │  └─ violations/route.ts # query violations from DB
│  │  ├─ db/
│  │  │  ├─ migrations/schema.ts # auth + violations + scrape_requests
│  │  │  ├─ incremental.ts # per-neighborhood since-date
│  │  │  └─ locks.ts # pg advisory locks
│  │  └─ worker/scrapeRunner.ts # pulls queued jobs and runs Python
│  └─ ecosystem.config.js # PM2: web app + worker
│
└─ backend-app/
   ├─ baltimore_violations_scraper.py # Python Playwright scraper
   ├─ requirements.txt
   └─ data/ # pdf/, text/, json/ artifacts
```

**Why this split?**  
- Web/API stays responsive.  
- Worker does the heavy scrape.  
- Python handles flaky PDF flows.  
- DB dedupes & drives incremental logic.

---

## 1) “Done” definition

- `/api/violations` returns DB rows.  
- `/api/scrape` enqueues jobs; worker consumes and writes artifacts to `backend-app/data/*`.  
- DB table `violations` up-to-date (incremental by `date_notice`).  
- UI lists/filter/sorts violations.

---

## 2) Requirements (Windows)

- Node 20+, **pnpm**, Git Bash  
- Python **3.11** via `py -3.11`  
- PostgreSQL (`DATABASE_URL`)  
- Playwright browser: `python -m playwright install chromium`  
- Optional OCR: Tesseract on PATH

---

## 3) Dev setup (one-shot)

```bash
# frontend
cd next-scraper/frontend-app
pnpm install
cp .env.example .env.local  # set DATABASE_URL, NEXTAUTH_SECRET, etc.

# backend
cd ../backend-app
py -3.11 -m venv .venv
source .venv/Scripts/activate
python -m pip install -U pip
pip install -r requirements.txt
python -m playwright install chromium
tesseract -v  # optional check

# DB migrations
cd ../frontend-app
pnpm drizzle-kit generate
pnpm drizzle-kit migrate

# Run
# terminal A
pnpm dev

# terminal B (worker)
pnpm ts-node src/worker/scrapeRunner.ts
```

**Smoke test**

```bash
curl -s http://localhost:3000/api/neighborhoods
curl -s -X POST http://localhost:3000/api/scrape -H 'content-type: application/json' \
  -d '{"neighborhoods":["ABELL"],"extract":true,"ocr":false}'
curl -s "http://localhost:3000/api/violations?neighborhood=ABELL&from=2025-01-01"
```

---

## 4) Env

`frontend-app/.env.local`

```ini
DATABASE_URL=postgres://user:pass@host:5432/db
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=replace_me
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

**Worker (PM2 or shell)**

```ini
SCRAPER_PY=py
SCRAPER_PY_VERSION=-3.11
SCRAPER_PATH=C:/Users/kingl/__code/next-scraper/backend-app/baltimore_violations_scraper.py
SCRAPER_OUT=C:/Users/kingl/__code/next-scraper/backend-app/data
TESSDATA_PREFIX=C:/Program Files/Tesseract-OCR/tessdata
```

---

## 5) Data model

- **violations** (unique `notice_number`, indexes on `neighborhood`, `(date_notice, neighborhood)`, URLs to PDFs/Text)  
- **scrape_requests** (queue: `queued→running→success|error`, JSON payload)  
- **Auth tables** (users, accounts, sessions, verification_tokens)

**Incremental rule:** per neighborhood, since = (MAX(date_notice) + 1 day).

---

## 6) Flow

1. `POST /api/scrape` → `scrape_requests` row.  
2. Worker takes global lock, sets job running, iterates neighborhoods:  
   - compute since, spawn Python with `--neighborhoods N --since ISO --out data [--extract] [--ocr]`  
   - retries (x3, backoff)  
3. Python downloads PDFs, writes JSON/TXT, and the app ensures DB upserts/deduping.  
4. Artifacts: `backend-app/data/pdf|text|json/<NEIGHBORHOOD>/`.

---

## 7) Production (DO + PM2)

```bash
cd frontend-app
pnpm build
pm2 start ecosystem.config.js
pm2 save
```

- Nginx → reverse proxy :3000.  
- Schedule daily incremental: `POST /api/scrape` with `{}`.

---

## 8) Troubleshooting

- Use `py -3.11` always (don’t rely on venv activation from Node).  
- `python -m playwright install chromium` inside backend venv.  
- **Drizzle:** `db.execute()` returns an array, not `{rows}`.  
- **Tesseract path:** add to User PATH; new shell → `tesseract -v`.  
- **Worker “idle”** = waiting; enqueue a job.

---

## 9) Checklist

- [ ] Frontend boots, no TS errors.  
- [ ] Worker runs, acquires lock.  
- [ ] Enqueue scrape → artifacts written.  
- [ ] `/api/violations` returns expected rows.  
- [ ] Re-run does not duplicate (incremental works).
