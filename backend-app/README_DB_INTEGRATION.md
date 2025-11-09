# Database Integration - Complete!

## What Changed

The Python scraper now writes **directly to PostgreSQL** in addition to CSV files.

### New Features

1. **Automatic database upserts** - Each violation is inserted/updated in real-time as it's scraped
2. **ON CONFLICT handling** - Duplicate notice numbers are automatically updated, not duplicated
3. **Graceful fallback** - If database is unavailable, scraper continues writing to CSV
4. **Real-time UI updates** - Web UI shows violations immediately as they're scraped

## Setup

### 1. Install New Dependency

```bash
cd backend-app
.venv\Scripts\Activate.ps1
pip install psycopg2-binary==2.9.9
```

### 2. Set Database URL

The scraper reads the database URL from the `DB_URL` environment variable.

**Option A: Set in shell (temporary)**

```powershell
$env:DB_URL="postgres://USER:PASS@HOST:5432/DBNAME"
python baltimore_violations_scraper.py --neighborhoods ARCADIA --out ./data --headed
```

**Option B: Create .env file (recommended)**

Create `backend-app/.env`:

```bash
DB_URL=postgres://USER:PASS@HOST:5432/DBNAME
```

Then install python-dotenv:

```bash
pip install python-dotenv
```

And add to the top of the Python script (optional, for standalone use):

```python
from dotenv import load_dotenv
load_dotenv()
```

**Option C: Use frontend's environment (automatic when run via worker)**

The scraper worker automatically passes `DB_URL` from the frontend's `.env.local` file!

## How It Works

### Database Schema

The violations table structure:

```sql
CREATE TABLE violations (
    notice_number text PRIMARY KEY,
    address text NOT NULL,
    type text NOT NULL,
    district text,
    neighborhood text NOT NULL,
    date_notice timestamp NOT NULL,
    pdf_url text,
    text_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
```

### Upsert Logic

```python
INSERT INTO violations (...) VALUES (...)
ON CONFLICT (notice_number) 
DO UPDATE SET
    address = EXCLUDED.address,
    type = EXCLUDED.type,
    ...
    updated_at = NOW()
```

This means:
- **First scrape**: Inserts new violation
- **Re-scrape**: Updates existing violation with latest data
- **No duplicates**: `notice_number` is the unique key

### URL Paths

PDF and text paths are converted to URLs:

- CSV path: `pdf/ARCADIA/1035079A.pdf`
- Database URL: `/violations/pdf/ARCADIA/1035079A.pdf`

Your web server should serve the `backend-app/data` directory at `/violations/`.

## Testing

### Test Database Connection

```powershell
cd backend-app
.venv\Scripts\Activate.ps1

# Set DB_URL
$env:DB_URL="your_postgres_connection_string"

# Run quick test
python baltimore_violations_scraper.py --neighborhoods ARCADIA --out ./data --extract --max-pdfs-per-neighborhood 1 --headed
```

Look for:
```
[info] Connected to PostgreSQL database
...
[info] Database connection closed
```

### Verify Data in Database

```sql
SELECT * FROM violations WHERE neighborhood = 'ARCADIA' ORDER BY created_at DESC LIMIT 10;
```

## Production Setup

### For Worker (Already Configured!)

The worker automatically has access to `DB_URL` from `.env.local`:

```bash
# In frontend-app/.env.local
DB_URL=postgres://USER:PASS@HOST:5432/DBNAME
```

The worker passes environment variables to the Python script, so database integration works automatically!

### For Manual Scraping

Set `DB_URL` before running:

```powershell
$env:DB_URL="postgres://USER:PASS@HOST:5432/DBNAME"
python baltimore_violations_scraper.py --all --out ./data --extract --headed --skip-existing
```

## Troubleshooting

### "No database connection" warning

This means:
1. `DB_URL` environment variable is not set, OR
2. `psycopg2` is not installed, OR
3. Database connection failed (check credentials/host)

**The scraper will continue working**, just without database writes.

### Database write errors

Check the scraper output for:
```
[warn] Database upsert failed for <notice_number>: <error>
```

Common issues:
- Invalid date format
- Missing required fields (address, type, neighborhood)
- Database permissions

### psycopg2 import error

Install it:
```bash
pip install psycopg2-binary
```

## Migration from CSV-Only

If you have existing data in CSV that's not in the database:

1. Use the frontend import script:
```bash
cd frontend-app
pnpm import:violations
```

2. Or manually import:
```bash
cd frontend-app
tsx src/scripts/importViolations.ts
```

## Benefits of Database Integration

✅ **Real-time data** - No manual import step needed  
✅ **Atomic updates** - Each violation is immediately available  
✅ **No duplicates** - Automatic deduplication via UPSERT  
✅ **Better performance** - Database queries are faster than CSV parsing  
✅ **Concurrent access** - Multiple processes can read/write safely  
✅ **Data integrity** - Foreign keys, constraints, and indexes  

## CSV Still Useful?

Yes! The CSV file is still generated and serves as:
- **Backup** - Plain text backup of all data
- **Audit trail** - Track when violations were scraped
- **Data exchange** - Easy to share/analyze in Excel
- **Debugging** - Quick inspection without database tools

## Summary

**The scraper now:**
1. ✅ Downloads PDFs (headed mode required)
2. ✅ Extracts text from PDFs
3. ✅ Writes to CSV file
4. ✅ **Writes to PostgreSQL database** (NEW!)

**When run via your web UI:**
- Violations appear immediately in the UI
- No manual import step needed
- Data is always up-to-date

**You're production-ready!** 🎉

