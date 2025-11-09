# Baltimore Violations Scraper - Timeout Issue Resolution

## Issue Summary

Your Baltimore violations scraper was experiencing 100% timeout failures. All 21 attempts in the ARCADIA neighborhood timed out after 12 seconds each, resulting in zero PDFs downloaded.

## Root Causes (UPDATED)

**Primary Issue**: The website **detects and blocks headless browsers**
- ✅ Headed mode (visible browser): Works perfectly
- ❌ Headless mode (background): PDFs timeout even with increased timeouts

**Secondary Issue**: The original 12-second row timeout was too short
- The scraper tries **three different click strategies** sequentially
- Each strategy has its own timeout (8-15 seconds)
- The cumulative time needed exceeded the 12-second limit

## Changes Applied

### ✅ Primary Fixes

1. **Row Timeout: 12s → 45s**
   - File: `backend-app/baltimore_violations_scraper.py`
   - Lines: 213, 474
   - Impact: Allows all three click strategies to attempt completion

2. **Individual Operation Timeouts Increased:**
   - PDF response wait: 15s → 25s
   - Popup window timeout: 8s → 15s
   - Download timeout: 8s → 15s
   - Navigation timeout: 10s → 20s
   - HTTP request timeouts: 15s → 25s
   - Page navigation back: 5s → 8s

3. **Browser Default Timeouts:**
   - Element timeout: 10s → 20s
   - Navigation timeout: 12s → 30s

4. **Rate Limiting Protection:**
   - Delay between rows: 150ms → 500ms
   - Helps avoid anti-scraping detection

5. **Enhanced Diagnostics:**
   - Added logging when no clickable elements are found
   - Better error context for debugging

## Files Modified

- ✏️ `backend-app/baltimore_violations_scraper.py` - Main scraper with timeout fixes

## Files Created

- 📄 `backend-app/TIMEOUT_FIXES.md` - Detailed technical documentation
- 🧪 `backend-app/test_site_connectivity.py` - Diagnostic test script

## ⚠️ IMPORTANT: Use Headed Mode

**The site blocks headless browsers. You MUST use `--headed` flag for reliable downloads.**

## Testing Instructions

### Quick Test (Recommended First Step)
```bash
cd backend-app

# Activate virtual environment
.venv\Scripts\activate

# Test connectivity first
python test_site_connectivity.py

# Then try the scraper with HEADED MODE (browser will be visible)
python baltimore_violations_scraper.py \
  --neighborhoods ARCADIA \
  --out ./data \
  --extract \
  --max-pdfs-per-neighborhood 3 \
  --skip-existing \
  --headed
```

**Note**: The browser window will open. You can minimize it, but don't close it!

### If Still Experiencing Timeouts

#### 1. Run in Headed Mode (See What's Happening)
```bash
python baltimore_violations_scraper.py \
  --neighborhoods ARCADIA \
  --out ./data \
  --headed \
  --max-pdfs-per-neighborhood 1
```

#### 2. Add Slow-Mo Delay
```bash
python baltimore_violations_scraper.py \
  --neighborhoods ARCADIA \
  --out ./data \
  --slow-mo 1000 \
  --max-pdfs-per-neighborhood 1
```

#### 3. Increase Timeout Even Further
```bash
python baltimore_violations_scraper.py \
  --neighborhoods ARCADIA \
  --out ./data \
  --row-timeout 90 \
  --max-pdfs-per-neighborhood 1
```

## What to Look For

### Success Indicators ✅
- Messages like: `[row] 1/21 path=download` or `path=popup` or `path=navigate`
- `[info] Downloaded X PDFs for ARCADIA` (where X > 0)
- PDF files appearing in `backend-app/data/pdf/ARCADIA/`
- Populated `pdf_path` column in `backend-app/data/violations.csv`

### Failure Indicators ❌
- Continued `timeout after Xs` messages
- `no-pdf` messages for all rows
- `no-clickable-elements` messages
- Empty PDF directories

## Known Issues

### Headless Mode Doesn't Work ❌

The Baltimore Housing site **detects and blocks headless browsers**. Even with:
- Stealth arguments
- Modified navigator properties  
- Realistic headers and user agents

**Headless mode still fails 100% of the time.**

### Solution: Use Headed Mode ✅

```bash
# Add --headed flag to ALL commands
python baltimore_violations_scraper.py --all --out ./data --extract --headed --skip-existing
```

The browser window will be visible, but you can:
- Minimize it and continue working
- Move it to another monitor
- Use Windows Virtual Desktops (Win + Tab → New Desktop)

See `backend-app/HEADLESS_DETECTION_ISSUE.md` for details.

## Additional Recommendations

### For Persistent Issues

1. **Check Website Manually**
   - Visit https://cels.baltimorehousing.org/Search_On_Map.aspx in your browser
   - Verify the site is working and PDFs are accessible
   - Look for any CAPTCHA or login requirements

2. **Add Retry Logic**
   - Implement exponential backoff (5s, 10s, 20s delays)
   - Retry failed rows 2-3 times before giving up

3. **Use Stealth Mode**
   ```bash
   pip install playwright-stealth
   ```
   Then modify the scraper to use stealth mode

4. **Run During Off-Peak Hours**
   - Server may be less loaded at night or early morning
   - Could result in faster response times

5. **Contact Site Administrator**
   - If this is for official/research purposes
   - Request API access or permission to scrape

## Monitoring & Debugging

### View Real-Time Progress
The scraper outputs detailed logs. Watch for:
- Row processing messages
- Timeout indicators
- Success path messages
- Download counts

### Check Output Files
```bash
# View downloaded PDFs
ls backend-app/data/pdf/ARCADIA/

# Check CSV entries
cat backend-app/data/violations.csv | grep ARCADIA

# View extracted text
ls backend-app/data/text/ARCADIA/
```

### Screenshot for Debugging
The test script (`test_site_connectivity.py`) saves a screenshot of the site, which can help identify:
- Page structure changes
- CAPTCHA requirements
- Error messages
- Unexpected layouts

## Need More Help?

If the issue persists after trying these fixes:

1. Run the connectivity test: `python test_site_connectivity.py`
2. Run scraper in headed mode to watch behavior
3. Share the screenshot and logs for further diagnosis
4. Check if other users are having similar issues with the Baltimore Housing site

## Rollback Instructions

If you need to revert to the original timeouts:
```bash
git diff backend-app/baltimore_violations_scraper.py
git checkout backend-app/baltimore_violations_scraper.py
```

---

**Summary**: The timeout values have been significantly increased throughout the scraper to accommodate slow network conditions and sequential retry strategies. Test with small batches first, then scale up if successful.

