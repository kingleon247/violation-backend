# Baltimore Violations Scraper - Timeout Fixes

## Problem Analysis

The scraper was experiencing 100% timeout failures when attempting to download PDFs. Every single attempt timed out after 12 seconds, resulting in zero successful downloads.

### Root Cause

The issue was a mismatch between timeout configurations:

1. **Overall row timeout**: 12 seconds (too short)
2. **Individual operation timeouts**: 8-15 seconds each
3. **Sequential strategy execution**: The scraper tries multiple click strategies (download, popup, navigation) one after another
4. **Cumulative effect**: 12 seconds wasn't enough time to complete even one full strategy attempt

## Changes Made

### 1. Increased Row Timeout (Primary Fix)
- **Changed from**: 12 seconds → **45 seconds**
- **Location**: `download_all_pdfs_for_results()` function and `--row-timeout` argument default
- **Reasoning**: Allows sufficient time for all three click strategies to be attempted sequentially

### 2. Extended Individual Operation Timeouts

#### PDF Response Wait
- **Changed from**: 15s → **25s**
- **Function**: `_wait_pdf_response()`

#### Popup Handler
- **expect_page timeout**: 8s → **15s**
- **request.get timeout**: 15s → **25s**
- **retry iterations**: 30 → **40**
- **Function**: `_save_pdf_via_popup()`

#### Download Handler
- **expect_download timeout**: 8s → **15s**
- **Function**: `_save_pdf_via_download()`

#### Navigation Handler
- **expect_navigation timeout**: 10s → **20s**
- **request.get timeout**: 15s → **25s**
- **go_back timeout**: 5s → **8s**
- **Function**: `_save_pdf_via_navigation()`

### 3. Increased Default Browser Timeouts
- **set_default_timeout**: 10s → **20s**
- **set_default_navigation_timeout**: 12s → **30s**

### 4. Added Rate Limiting Protection
- **Delay between rows**: 150ms → **500ms**
- Helps avoid rate limiting and anti-scraping measures

### 5. Enhanced Error Logging
- Added detection and logging when no clickable elements are found
- Better diagnostic information for debugging

## Testing Recommendations

### 1. Test with Increased Timeout
```bash
cd backend-app
.venv/Scripts/python.exe baltimore_violations_scraper.py \
  --neighborhoods ARCADIA \
  --out ./data \
  --extract \
  --max-pdfs-per-neighborhood 5 \
  --skip-existing
```

### 2. If Still Timing Out, Try:

#### Option A: Run in Headed Mode (Visible Browser)
```bash
.venv/Scripts/python.exe baltimore_violations_scraper.py \
  --neighborhoods ARCADIA \
  --out ./data \
  --headed \
  --max-pdfs-per-neighborhood 1
```
This lets you visually see what's happening and identify issues.

#### Option B: Add Slow-Mo Delay
```bash
.venv/Scripts/python.exe baltimore_violations_scraper.py \
  --neighborhoods ARCADIA \
  --out ./data \
  --slow-mo 1000 \
  --max-pdfs-per-neighborhood 1
```
Adds 1 second delay between actions to help slow sites respond.

#### Option C: Further Increase Row Timeout
```bash
.venv/Scripts/python.exe baltimore_violations_scraper.py \
  --neighborhoods ARCADIA \
  --out ./data \
  --row-timeout 90 \
  --max-pdfs-per-neighborhood 1
```

### 3. Network Diagnostics
If timeouts persist, it could indicate:

- **Site is blocking/throttling**: The website may have anti-scraping measures
- **Network issues**: Check your internet connection and firewall
- **Site downtime**: The Baltimore Housing website may be temporarily unavailable
- **Authentication needed**: The site may have added CAPTCHA or login requirements

## Additional Improvements to Consider

### 1. Add Retry Logic with Exponential Backoff
```python
async def download_with_retry(page, row, dest, max_retries=3):
    for attempt in range(max_retries):
        if await try_download(page, row, dest):
            return True
        if attempt < max_retries - 1:
            wait_time = (2 ** attempt) * 5  # 5s, 10s, 20s
            print(f"Retry {attempt+1}/{max_retries} after {wait_time}s")
            await asyncio.sleep(wait_time)
    return False
```

### 2. Use Playwright's Stealth Mode
Install playwright-stealth to avoid detection:
```bash
pip install playwright-stealth
```

### 3. Add Request Headers
The user agent is already set, but you could add more realistic headers:
```python
context = await browser.new_context(
    accept_downloads=True,
    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    extra_http_headers={
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
)
```

### 4. Implement Distributed/Parallel Processing
If you need to scrape many neighborhoods, consider:
- Processing multiple neighborhoods in parallel (but with rate limiting)
- Using a queue system (like RQ or Celery)
- Splitting work across multiple worker processes

### 5. Add Better Error Recovery
- Save progress more frequently
- Implement checkpoint/resume functionality
- Add detailed error logging to a separate log file

## Command Reference

### Basic Usage (with new defaults)
```bash
# Single neighborhood, test run
python baltimore_violations_scraper.py --neighborhoods ARCADIA --out ./data --max-pdfs-per-neighborhood 5

# Multiple neighborhoods
python baltimore_violations_scraper.py --neighborhoods ARCADIA HAMPDEN CANTON --out ./data --extract

# All neighborhoods (production)
python baltimore_violations_scraper.py --all --out ./data --extract --skip-existing

# Debug mode
python baltimore_violations_scraper.py --neighborhoods ARCADIA --out ./data --headed --slow-mo 500

# Custom timeout for very slow connections
python baltimore_violations_scraper.py --neighborhoods ARCADIA --out ./data --row-timeout 90
```

## Monitoring Success

After running the scraper, check:
1. **Output logs**: Look for "path=download", "path=popup", or "path=navigate" messages indicating successful downloads
2. **Downloaded count**: "[info] Downloaded X PDFs for NEIGHBORHOOD"
3. **File system**: Check `./data/pdf/NEIGHBORHOOD/` directory for actual PDF files
4. **CSV file**: Review `./data/violations.csv` for populated pdf_path columns

## Next Steps

1. Run a test with a small number of PDFs first
2. Monitor the output for new timeout patterns
3. If successful, scale up to full neighborhoods
4. Consider implementing retry logic if intermittent failures occur

