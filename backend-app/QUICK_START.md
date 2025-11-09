# Quick Start Guide - Baltimore Violations Scraper

## ⚠️ CRITICAL: Use Headed Mode

The website blocks headless browsers. **Always use `--headed` flag!**

## Commands You Need

### 1. Test Everything Works

```powershell
cd backend-app
.\.venv\Scripts\Activate.ps1

# Test site connectivity
python test_site_connectivity.py

# Download 3 PDFs to verify (browser window will open)
python baltimore_violations_scraper.py `
  --neighborhoods ARCADIA `
  --out ./data `
  --extract `
  --max-pdfs-per-neighborhood 3 `
  --headed `
  --skip-existing
```

### 2. Download All PDFs for One Neighborhood

```powershell
python baltimore_violations_scraper.py `
  --neighborhoods ARCADIA `
  --out ./data `
  --extract `
  --headed `
  --skip-existing
```

### 3. Download Multiple Neighborhoods

```powershell
python baltimore_violations_scraper.py `
  --neighborhoods ARCADIA HAMPDEN CANTON "FEDERAL HILL" `
  --out ./data `
  --extract `
  --headed `
  --skip-existing
```

**Note**: Use quotes for neighborhoods with spaces!

### 4. Download Everything (Production Run)

```powershell
python baltimore_violations_scraper.py `
  --all `
  --out ./data `
  --extract `
  --headed `
  --skip-existing
```

**Expected time**: 1-3 hours depending on total violations  
**Success rate**: ~95-100% with headed mode

## What Happens

1. **Browser window opens** - This is normal and required!
2. **Don't close the browser** - Minimize it if you want
3. **Watch terminal** - Shows progress for each row
4. **PDFs download** - Saved to `data/pdf/NEIGHBORHOOD/`
5. **Text extracted** - Saved to `data/text/NEIGHBORHOOD/`
6. **CSV updated** - All data in `data/violations.csv`

## Expected Output

```
=== ARCADIA ===
[info] Found 21 rows for ARCADIA.
[row] 1/21 try 1035079A
[row] 1/21 trying strategy with 1 element(s)
[row] 1/21 path=popup
[row] 2/21 try 2517697A
[row] 2/21 trying strategy with 1 element(s)
[row] 2/21 path=popup
...
[info] Downloaded 21 PDFs for ARCADIA.
```

## Troubleshooting

### Browser Closes Immediately
- Make sure `--headed` flag is included
- Don't manually close the browser window

### Still Getting Timeouts in Headed Mode
- Check internet connection
- Try increasing timeout: `--row-timeout 90`
- Add delays: `--slow-mo 1000`

### "Module not found" Error
- Activate virtual environment first:
  ```powershell
  .\.venv\Scripts\Activate.ps1
  ```

### Want to Resume After Interruption
- Use `--skip-existing` flag
- It will skip already downloaded PDFs

## Working While Scraper Runs

### Option 1: Minimize Browser
Just minimize the browser window - it keeps working!

### Option 2: Virtual Desktop (Windows 11)
1. Press `Win + Tab`
2. Click "New Desktop"
3. Run scraper there
4. Switch back with `Win + Ctrl + Left`

### Option 3: Second Monitor
Drag browser to second monitor and continue working on primary.

## Output Structure

```
backend-app/
└── data/
    ├── violations.csv          # Main output - all violation data
    ├── pdf/
    │   ├── ARCADIA/
    │   │   ├── 1035079A.pdf
    │   │   ├── 2517697A.pdf
    │   │   └── ...
    │   ├── HAMPDEN/
    │   └── ...
    ├── text/
    │   ├── ARCADIA/
    │   │   ├── 1035079A.txt    # Extracted text from PDF
    │   │   ├── 2517697A.txt
    │   │   └── ...
    │   └── ...
    └── json/
        └── ARCADIA/
            ├── 1035079A.json   # Structured data
            └── ...
```

## Best Practice Workflow

```powershell
# 1. Activate environment
.\.venv\Scripts\Activate.ps1

# 2. Test with small batch first
python baltimore_violations_scraper.py --neighborhoods ARCADIA --out ./data --extract --headed --max-pdfs-per-neighborhood 5 --skip-existing

# 3. If successful, run full scrape
python baltimore_violations_scraper.py --all --out ./data --extract --headed --skip-existing

# 4. Minimize browser and let it run (1-3 hours)

# 5. Check results
ls data/pdf/ARCADIA/
cat data/violations.csv | Select-String ARCADIA
```

## Performance Tips

### Faster (If Site Allows)
```powershell
--row-timeout 20  # Reduce from default 45s
```

### More Reliable (For Slow Connections)
```powershell
--row-timeout 90  # Increase from default 45s
--slow-mo 1000    # Add 1s delay between actions
```

## Common Mistakes

❌ **Forgetting `--headed`**
```powershell
# WRONG - will timeout
python baltimore_violations_scraper.py --neighborhoods ARCADIA --out ./data
```

✅ **Always use `--headed`**
```powershell
# CORRECT
python baltimore_violations_scraper.py --neighborhoods ARCADIA --out ./data --headed
```

❌ **Closing browser window manually**
- Let the script close it automatically

❌ **Running without virtual environment**
- Always activate `.venv` first

## Need Help?

1. Check `HEADLESS_DETECTION_ISSUE.md` - Explains why headed mode is required
2. Check `TIMEOUT_FIXES.md` - Technical details about timeout changes
3. Check `SCRAPER_TIMEOUT_FIXES_SUMMARY.md` - Complete overview

## Summary

**TL;DR**: Always use `--headed` flag. Minimize the browser window if you want. It works perfectly!

```powershell
# The command you'll use most:
python baltimore_violations_scraper.py --all --out ./data --extract --headed --skip-existing
```

