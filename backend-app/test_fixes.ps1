# Baltimore Violations Scraper - Test Script
# This script tests the timeout fixes with progressively more complex tests

Write-Host "`n================================================" -ForegroundColor Cyan
Write-Host "Baltimore Violations Scraper - Test Suite" -ForegroundColor Cyan
Write-Host "================================================`n" -ForegroundColor Cyan

# Check if virtual environment is activated
if (-not $env:VIRTUAL_ENV) {
    Write-Host "Activating virtual environment..." -ForegroundColor Yellow
    & .\.venv\Scripts\Activate.ps1
}

Write-Host "`nTest 1: Site Connectivity Check" -ForegroundColor Green
Write-Host "-----------------------------------------------"
Write-Host "Testing if the Baltimore Housing site is accessible...`n"
python test_site_connectivity.py

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n[ERROR] Site connectivity test failed!" -ForegroundColor Red
    Write-Host "The Baltimore Housing website may be down or inaccessible." -ForegroundColor Red
    exit 1
}

Write-Host "`n`nTest 2: Single PDF Download (Headed Mode)" -ForegroundColor Green
Write-Host "-----------------------------------------------"
Write-Host "Attempting to download 1 PDF with visible browser...`n"
Write-Host "This will open a browser window. Watch what happens." -ForegroundColor Yellow
Write-Host "Press Ctrl+C if you see it's not working.`n" -ForegroundColor Yellow

$continue = Read-Host "Continue with headed test? (y/n)"
if ($continue -eq 'y') {
    python baltimore_violations_scraper.py `
        --neighborhoods ARCADIA `
        --out ./data `
        --extract `
        --max-pdfs-per-neighborhood 1 `
        --headed
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n[SUCCESS] Headed test completed!" -ForegroundColor Green
    } else {
        Write-Host "`n[WARNING] Headed test had issues" -ForegroundColor Yellow
    }
}

Write-Host "`n`nTest 3: Small Batch (Headless Mode)" -ForegroundColor Green
Write-Host "-----------------------------------------------"
Write-Host "Attempting to download 3 PDFs in headless mode...`n"

$continue = Read-Host "Continue with batch test? (y/n)"
if ($continue -eq 'y') {
    python baltimore_violations_scraper.py `
        --neighborhoods ARCADIA `
        --out ./data `
        --extract `
        --max-pdfs-per-neighborhood 3 `
        --skip-existing
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n[SUCCESS] Batch test completed!" -ForegroundColor Green
        
        # Check results
        $pdfCount = (Get-ChildItem -Path "./data/pdf/ARCADIA" -Filter "*.pdf" -ErrorAction SilentlyContinue).Count
        Write-Host "`nResults:" -ForegroundColor Cyan
        Write-Host "  - PDFs downloaded: $pdfCount" -ForegroundColor White
        
        if ($pdfCount -gt 0) {
            Write-Host "`n  The timeout fixes appear to be working! " -ForegroundColor Green
            Write-Host "  You can now run the full scraper.`n" -ForegroundColor Green
        } else {
            Write-Host "`n  No PDFs were downloaded. This could mean:" -ForegroundColor Yellow
            Write-Host "  1. The site is blocking requests" -ForegroundColor Yellow
            Write-Host "  2. PDFs are not available for this neighborhood" -ForegroundColor Yellow
            Write-Host "  3. Site structure has changed`n" -ForegroundColor Yellow
        }
    } else {
        Write-Host "`n[ERROR] Batch test failed!" -ForegroundColor Red
    }
}

Write-Host "`n`nTest 4: Full Neighborhood (Optional)" -ForegroundColor Green
Write-Host "-----------------------------------------------"
Write-Host "Attempting to download all PDFs for ARCADIA...`n"
Write-Host "This may take 5-15 minutes depending on the number of violations.`n" -ForegroundColor Yellow

$continue = Read-Host "Continue with full test? (y/n)"
if ($continue -eq 'y') {
    python baltimore_violations_scraper.py `
        --neighborhoods ARCADIA `
        --out ./data `
        --extract `
        --skip-existing
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n[SUCCESS] Full neighborhood test completed!" -ForegroundColor Green
        
        # Check results
        $pdfCount = (Get-ChildItem -Path "./data/pdf/ARCADIA" -Filter "*.pdf" -ErrorAction SilentlyContinue).Count
        $txtCount = (Get-ChildItem -Path "./data/text/ARCADIA" -Filter "*.txt" -ErrorAction SilentlyContinue).Count
        
        Write-Host "`nFinal Results:" -ForegroundColor Cyan
        Write-Host "  - PDFs downloaded: $pdfCount" -ForegroundColor White
        Write-Host "  - Text files extracted: $txtCount" -ForegroundColor White
        Write-Host "  - CSV file: ./data/violations.csv`n" -ForegroundColor White
    }
}

Write-Host "`n================================================" -ForegroundColor Cyan
Write-Host "Test Suite Complete" -ForegroundColor Cyan
Write-Host "================================================`n" -ForegroundColor Cyan

Write-Host "Next steps:" -ForegroundColor Green
Write-Host "  - Review logs above for any errors"
Write-Host "  - Check ./data/pdf/ARCADIA/ for downloaded PDFs"
Write-Host "  - Check ./data/violations.csv for extracted data"
Write-Host "  - If successful, run for all neighborhoods with:"
Write-Host "    python baltimore_violations_scraper.py --all --out ./data --extract --skip-existing`n"

