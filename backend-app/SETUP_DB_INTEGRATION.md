# Quick Setup - Database Integration

## 🚀 Quick Start (3 steps)

### 1. Install psycopg2

```powershell
cd backend-app
.\.venv\Scripts\Activate.ps1
pip install psycopg2-binary==2.9.9
```

### 2. Verify DB_URL is in .env.local

Your `frontend-app/.env.local` should already have:

```bash
DB_URL=postgres://USER:PASS@HOST:5432/DBNAME
```

### 3. Done! Test it

Queue a scrape job from your web UI - violations will automatically appear in the database!

---

## How to Test

### Test from Web UI (Recommended)

1. Go to http://localhost:3000/scrape/new
2. Select a neighborhood
3. Click "Run Scrape"
4. Watch the job complete
5. Go to http://localhost:3000/violations
6. **See your violations!** ✨

### Test from Command Line

```powershell
cd backend-app
.\.venv\Scripts\Activate.ps1

# Set DB_URL
$env:DB_URL="postgres://USER:PASS@HOST:5432/DBNAME"

# Run test
python baltimore_violations_scraper.py --neighborhoods ARCADIA --out ./data --extract --max-pdfs-per-neighborhood 1 --headed
```

Look for this output:
```
[info] Connected to PostgreSQL database
=== ARCADIA ===
[info] Found 21 rows for ARCADIA.
[row] 1/21 path=popup
[info] Downloaded 1 PDFs for ARCADIA.
[info] Database connection closed
Done. CSV: ...
```

---

## What Changed?

### Before
1. Scraper downloads PDFs ✅
2. Scraper writes to CSV ✅
3. **You manually run import script** ❌
4. Data appears in UI

### After  
1. Scraper downloads PDFs ✅
2. Scraper writes to CSV ✅
3. **Scraper writes to database automatically** ✅ NEW!
4. Data appears in UI immediately

---

## Files Modified

- `requirements.txt` - Added psycopg2-binary
- `baltimore_violations_scraper.py` - Added database upsert logic

## Files Created

- `README_DB_INTEGRATION.md` - Detailed documentation
- `SETUP_DB_INTEGRATION.md` - This quick guide

---

## Troubleshooting

### "No database connection" message

**This is OK!** The scraper will continue working and save to CSV.

To enable database writes:
1. Install psycopg2: `pip install psycopg2-binary`
2. Set DB_URL environment variable
3. Restart worker/scraper

### Can't see violations in web UI

1. Check that DB_URL is set in `frontend-app/.env.local`
2. Restart the worker: `pnpm worker:dev`
3. Run a new scrape job
4. Check browser console for errors

### Database errors in logs

Check:
- Database credentials are correct
- Database server is running
- Firewall allows connections
- `violations` table exists (run migrations: `pnpm migrate`)

---

## Next Steps

1. ✅ Install psycopg2
2. ✅ Run a test scrape
3. ✅ Verify data appears in UI
4. 🎉 You're done!

**No more manual imports needed!** Every scrape automatically populates the database.

