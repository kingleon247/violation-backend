# Timeout Changes - Quick Reference

## Summary Table

| Operation | Before | After | Change | Location |
|-----------|--------|-------|--------|----------|
| **Row Overall Timeout** | 12s | **45s** | +275% | Line 213, 474 |
| **PDF Response Wait** | 15s | **25s** | +67% | Line 133 |
| **Popup Window Expect** | 8s | **15s** | +88% | Line 140 |
| **Popup HTTP Request** | 15s | **25s** | +67% | Line 155 |
| **Popup Retry Iterations** | 30 | **40** | +33% | Line 151 |
| **Download Expect** | 8s | **15s** | +88% | Line 174 |
| **Navigation Expect** | 10s | **20s** | +100% | Line 187 |
| **Navigation HTTP Request** | 15s | **25s** | +67% | Line 197 |
| **Navigation Go Back** | 5s | **8s** | +60% | Line 193, 202, 207 |
| **Browser Element Timeout** | 10s | **20s** | +100% | Line 381 |
| **Browser Navigation Timeout** | 12s | **30s** | +150% | Line 382 |
| **Inter-Row Delay** | 150ms | **500ms** | +233% | Line 267 |

## Key Insights

### Why 45 Seconds for Row Timeout?

The row timeout encompasses trying **three sequential strategies**:

1. **Download Strategy** (click middle button)
   - Click action: ~1-2s
   - Wait for download: up to 15s
   - **Subtotal: ~17s**

2. **Popup Strategy** (ctrl+click)
   - Click action: ~1-2s
   - Wait for new page: up to 15s
   - Wait for PDF response: up to 25s
   - OR fallback GET request: up to 25s
   - **Subtotal: ~27-42s**

3. **Navigation Strategy** (plain click)
   - Click action: ~1-2s
   - Wait for navigation: up to 20s
   - HTTP GET request: up to 25s
   - Go back: up to 8s
   - **Subtotal: ~46-55s**

**Total possible time**: Up to 115 seconds if all strategies are attempted

**New 45-second timeout**: Allows at least the first two strategies to complete fully, or the first strategy plus partial second strategy.

### Why Not Higher?

- 45 seconds is a reasonable balance between:
  - ✅ Allowing sufficient time for success
  - ✅ Not hanging indefinitely on truly failed attempts
  - ✅ Reasonable total runtime for large datasets

- If you're on a very slow connection or the site is very slow, you can increase further via:
  ```bash
  --row-timeout 90
  ```

## Timeline Comparison

### Before (12-second timeout)

```
Row 1 attempt:
├─ 0-2s:   Click download strategy
├─ 2-10s:  Wait for download event... [timeout]
├─ 10-12s: Try popup strategy [timeout]
└─ 12s:    ❌ OVERALL TIMEOUT - no PDF
```

### After (45-second timeout)

```
Row 1 attempt:
├─ 0-2s:   Click download strategy
├─ 2-17s:  Wait for download event... [fail]
├─ 17-19s: Click popup strategy
├─ 19-34s: Wait for new page popup
├─ 34-59s: Wait for PDF response or GET request
└─ 42s:    ✅ SUCCESS - PDF downloaded via popup
```

## Usage Examples

### Default (Use New Timeouts)
```bash
python baltimore_violations_scraper.py --neighborhoods ARCADIA --out ./data --extract
```

### Custom Timeout for Extremely Slow Connections
```bash
python baltimore_violations_scraper.py \
  --neighborhoods ARCADIA \
  --out ./data \
  --extract \
  --row-timeout 90
```

### Fast Connection (Reduce Timeout)
```bash
python baltimore_violations_scraper.py \
  --neighborhoods ARCADIA \
  --out ./data \
  --extract \
  --row-timeout 20
```

## Monitoring Performance

### Calculate Expected Runtime

For a neighborhood with N rows:

**Minimum time**: N × 0.5s (all PDFs already exist, skipped)

**Typical time**: N × 5-15s (most rows succeed on first or second strategy)

**Maximum time**: N × 45s (all rows hit timeout)

### Example: ARCADIA (21 rows)

- **Best case**: 21 × 0.5s = ~11 seconds
- **Typical case**: 21 × 10s = ~3.5 minutes
- **Worst case**: 21 × 45s = ~16 minutes

If you're hitting worst-case timing, it indicates:
- Site is very slow
- Site is blocking/rate-limiting
- Network issues
- No PDFs are actually available

## Troubleshooting by Timeout Pattern

### All rows timeout at 45s
- ❌ **Issue**: Site is blocking or PDFs aren't accessible
- 🔧 **Fix**: Run with `--headed` to see what's happening visually

### Some rows succeed, others timeout
- ✅ **Normal**: Some PDFs load faster than others
- 💡 **Tip**: Use `--skip-existing` to resume without re-downloading

### First row takes 30s, rest are faster
- ✅ **Normal**: First page load is slowest
- 💡 **Tip**: This is expected behavior

### All rows fail in < 5s with "no-clickable-elements"
- ❌ **Issue**: Site structure changed or elements not found
- 🔧 **Fix**: Check if site is accessible manually

### Download succeeds but extraction times out
- ℹ️ **Note**: Extraction happens after download, outside row timeout
- 🔧 **Fix**: Check PDF file isn't corrupted

## Performance Tuning

### For Fast, Reliable Connections
```python
row_timeout_sec = 20  # Reduce from 45
```

### For Slow or International Connections
```python
row_timeout_sec = 90  # Increase from 45
```

### For Rate-Limited Sites
```python
await page.wait_for_timeout(1000)  # Increase from 500ms between rows
```

### For Debugging
```bash
# See everything in real-time
--headed --slow-mo 500
```

## Memory Impact

Longer timeouts don't significantly impact memory, but they do impact:
- ⏱️ Total runtime (linear increase)
- 🔌 Connection persistence (browser stays open longer)
- 📊 Log file size (more timeout messages)

## Related Files

- **Main Scraper**: `baltimore_violations_scraper.py`
- **Test Script**: `test_site_connectivity.py`
- **Documentation**: `TIMEOUT_FIXES.md`
- **Summary**: `../SCRAPER_TIMEOUT_FIXES_SUMMARY.md`

