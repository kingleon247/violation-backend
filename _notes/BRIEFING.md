next-scraper – 10-Minute Briefing
Goal: Scrape Baltimore City violation notices (PDFs + metadata), convert to text, store in Postgres, and browse via a Next.js + Tailwind Catalyst UI. Production target is DO droplet with PM2.

What exists
frontend-app: Next.js (App Router), API routes (/api/scrape, /api/violations), Drizzle schema (auth + violations + scrape_requests), worker (src/worker/scrapeRunner.ts).

backend-app: baltimore_violations_scraper.py (Playwright), requirements.txt, data/ artifacts.

How it works
UI calls POST /api/scrape → adds a row to scrape_requests.
Worker (PM2) claims a job, computes since per neighborhood from DB, spawns Python with --neighborhoods N --since ISO --out data [--extract] [--ocr].
Python downloads PDFs, writes JSON/TXT; app upserts into violations (unique by notice_number), so re-runs are incremental.

Dev quickstart (Windows + Git Bash)

```bash
# frontend
cd next-scraper/frontend-app && pnpm install
cp .env.example .env.local  # set DB_URL, NEXTAUTH_SECRET

# backend
cd ../backend-app
py -3.11 -m venv .venv && source .venv/Scripts/activate
python -m pip install -U pip && pip install -r requirements.txt
python -m playwright install chromium
tesseract -v  # optional OCR

# DB
cd ../frontend-app && pnpm drizzle-kit generate && pnpm drizzle-kit migrate

# run
pnpm dev
pnpm ts-node src/worker/scrapeRunner.ts
```

Smoke test

```bash
curl -s http://localhost:3000/api/neighborhoods
curl -s -X POST http://localhost:3000/api/scrape -H 'content-type: application/json' \
  -d '{"neighborhoods":["ABELL"],"extract":true,"ocr":false}'
curl -s "http://localhost:3000/api/violations?neighborhood=ABELL&from=2025-01-01"
```

Env (worker)

```ini
SCRAPER_PY=py
SCRAPER_PY_VERSION=-3.11
SCRAPER_PATH=.../backend-app/baltimore_violations_scraper.py
SCRAPER_OUT=.../backend-app/data
TESSDATA_PREFIX=C:/Program Files/Tesseract-OCR/tessdata
```

Production

```bash
cd frontend-app && pnpm build
pm2 start ecosystem.config.js && pm2 save
```

Schedule daily incremental by POSTing /api/scrape with {}.

Pitfalls

- Use py -3.11 to avoid Python path issues.
- Install Playwright browser in the backend venv.
- db.execute() returns an array (not {rows}).
- If worker “hangs”, it’s idle; enqueue a job.
