# Migration Guide - Worker Refactoring

## For Existing Installations

This refactoring is **100% backwards compatible** - no breaking changes. However, you should update your `.env.local` for best results.

## Step 1: Update Environment Variables

### Before (old way):

```ini
SCRAPER_PY=py
SCRAPER_PY_VERSION=-3.11
```

### After (recommended for production reliability):

**Windows:**

```ini
SCRAPER_PY=C:/Users/kingl/__code/next-scraper/backend-app/.venv/Scripts/python.exe
# Remove SCRAPER_PY_VERSION line (no longer needed)
```

**Linux:**

```ini
SCRAPER_PY=/home/deployuser/next-scraper/backend-app/.venv/bin/python
```

> **Why?** Direct venv path avoids issues with launcher shims (.cmd on Windows) and ensures the correct Python is always used.

## Step 2: Pull Latest Code

```bash
git pull origin main
cd frontend-app
pnpm install  # in case there were any dependency updates
```

## Step 3: Database Migration (if needed)

The `heartbeat_at` column should already exist if you ran migrations. To verify:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'scrape_requests' AND column_name = 'heartbeat_at';
```

If missing, run:

```bash
cd frontend-app
pnpm drizzle-kit migrate
```

Or manually:

```sql
ALTER TABLE scrape_requests ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz NULL;
CREATE INDEX IF NOT EXISTS ix_scrape_requests_heartbeat_at ON scrape_requests (heartbeat_at);
```

## Step 4: Restart Worker

### Local Development (Windows/Linux):

Kill existing worker (Ctrl+C) and restart:

```bash
cd frontend-app
pnpm run worker:dev
```

You should see: `[worker] running in infinite loop mode (use --once for single-shot)`

### Production (PM2 on Linux):

```bash
pm2 restart worker
pm2 logs worker --lines 50
```

Verify output:

- ✅ `[worker] running in infinite loop mode`
- ✅ `[worker] reaped X stale job(s)` (if there were any stale jobs)
- ✅ Worker stays running, polling every 3 seconds

## Step 5: Verify Changes

### Test 1: Enqueue a Job

```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "content-type: application/json" \
  -d '{"neighborhoods":["ABELL"],"extract":true,"maxPdfsPerNeighborhood":1}'
```

Expected: Job ID returned immediately

### Test 2: Check Log Creation

```bash
# Replace JOB_ID with actual ID from above
curl -s "http://localhost:3000/api/scrape/log?id=JOB_ID"
```

Expected:

- **Never** a 404 error
- Either log content (200) or "log-not-ready" with 202 status

### Test 3: Monitor Heartbeat (in psql or DBeaver)

```sql
SELECT id, status, started_at, heartbeat_at,
       EXTRACT(EPOCH FROM (now() - heartbeat_at)) as seconds_since_heartbeat
FROM scrape_requests
WHERE status = 'running'
ORDER BY started_at DESC;
```

Run this query a few times. `seconds_since_heartbeat` should never exceed ~7 seconds.

### Test 4: Verify Worker Keeps Running

After job completes, check worker output. Should show:

```
[worker] job <id> -> SUCCESS
[worker] no queued jobs
```

**NOT:**

```
[worker] job <id> -> SUCCESS
(exits)  <-- OLD BEHAVIOR
```

The worker should keep running indefinitely.

## Step 6: Clean Up Stale Jobs (Optional)

If you have old stale jobs from before the refactoring:

```sql
UPDATE scrape_requests
   SET status = 'error',
       finished_at = now(),
       ok = false,
       error = 'cleaned up manually before worker refactoring'
 WHERE status = 'running'
   AND finished_at IS NULL
   AND started_at < now() - interval '1 hour';
```

Or just restart the worker - it will auto-reap them.

## Rollback Plan (if needed)

If something goes wrong:

### Option 1: Revert Code

```bash
git revert HEAD
cd frontend-app
pnpm install
pm2 restart worker
```

### Option 2: Use --once Flag

If the infinite loop is causing issues:

```bash
# Edit package.json scripts temporarily
"worker:dev": "tsx src/worker/scrapeRunner.ts --once"

# Then use a cron or systemd timer to run it every minute
```

This gives you the old behavior (one job, then exit) while keeping all other improvements.

## Common Issues After Migration

### Issue: Worker exits immediately

**Cause:** Global lock already held (another worker running)  
**Fix:**

```bash
# Check for other worker processes
ps aux | grep scrapeRunner
# Or on Windows:
tasklist | findstr node

# Kill duplicates, then restart
```

### Issue: Worker says "reaper failed" on startup

**Cause:** SQL error in reaper (old Postgres version?)  
**Fix:** Check Postgres version (need 9.4+). If still fails, comment out line 314 temporarily:

```typescript
// await reapStaleRunning(15);  // TODO: debug reaper SQL
```

### Issue: Log API still returns 404

**Cause:** Job started before worker was updated  
**Fix:** Enqueue a new job. Old jobs may not have logs if they started with old worker.

### Issue: "cannot find module @db/config/configureClient"

**Cause:** Missing dependency or stale build cache  
**Fix:**

```bash
cd frontend-app
rm -rf node_modules .next
pnpm install
```

## Support

If you encounter issues not covered here:

1. Check `pm2 logs worker` (or console output in dev)
2. Check database: `SELECT * FROM scrape_requests ORDER BY created_at DESC LIMIT 5;`
3. Check log files: `ls -lah backend-app/data/logs/`
4. Review `IMPLEMENTATION_SUMMARY.md` for detailed behavior

## What Stays the Same

✅ Database schema (heartbeat_at already exists)  
✅ API endpoints (same URLs, same parameters)  
✅ Job payload format (same JSON structure)  
✅ Python scraper (no changes to baltimore_violations_scraper.py)  
✅ UI pages (same URLs, same components)  
✅ Environment variables (just improved recommendations)

## What Changed

🔄 Worker now runs forever (polls every 3s) instead of exiting  
🔄 Log files created immediately (UI never sees 404)  
🔄 Heartbeat updates every 5s (visible in database)  
🔄 Stale job reaper runs on startup (auto-cleanup)  
🔄 Better error messages (timeout/exit codes in logs)  
🆕 `--once` flag for testing (single job, then exit)  
🆕 HTTP 202 response when log not ready (graceful retry)
