# Progressive Test Script
# Tests with increasing batch sizes to verify reliability

Write-Host "`nProgressive Testing - Baltimore Scraper" -ForegroundColor Cyan
Write-Host "=" * 60
Write-Host "This will test with 1, 3, then 5 PDFs before full run`n" -ForegroundColor Yellow

# Activate venv
if (-not $env:VIRTUAL_ENV) {
    Write-Host "Activating virtual environment..." -ForegroundColor Yellow
    & .\.venv\Scripts\Activate.ps1
}

# Test 1: Single PDF
Write-Host "`n[1/3] Test: 1 PDF" -ForegroundColor Green
Write-Host "-" * 60

python baltimore_violations_scraper.py `
    --neighborhoods ARCADIA `
    --out ./test_data `
    --extract `
    --max-pdfs-per-neighborhood 1 `
    --headed `
    --skip-existing

if ($LASTEXITCODE -ne 0) {
    Write-Host "`nFailed at 1 PDF - stopping tests" -ForegroundColor Red
    exit 1
}

$pdf1 = (Get-ChildItem -Path "./test_data/pdf/ARCADIA" -Filter "*.pdf" -ErrorAction SilentlyContinue).Count
Write-Host "OK - 1 PDF test passed ($pdf1 total PDFs)`n" -ForegroundColor Green

Start-Sleep -Seconds 2

# Test 2: Three PDFs
Write-Host "`n[2/3] Test: 3 PDFs" -ForegroundColor Green
Write-Host "-" * 60

python baltimore_violations_scraper.py `
    --neighborhoods ARCADIA `
    --out ./test_data `
    --extract `
    --max-pdfs-per-neighborhood 3 `
    --headed `
    --skip-existing

if ($LASTEXITCODE -ne 0) {
    Write-Host "`nFailed at 3 PDFs - stopping tests" -ForegroundColor Red
    exit 1
}

$pdf3 = (Get-ChildItem -Path "./test_data/pdf/ARCADIA" -Filter "*.pdf" -ErrorAction SilentlyContinue).Count
Write-Host "OK - 3 PDF test passed ($pdf3 total PDFs)`n" -ForegroundColor Green

Start-Sleep -Seconds 2

# Test 3: Five PDFs
Write-Host "`n[3/3] Test: 5 PDFs" -ForegroundColor Green
Write-Host "-" * 60

python baltimore_violations_scraper.py `
    --neighborhoods ARCADIA `
    --out ./test_data `
    --extract `
    --max-pdfs-per-neighborhood 5 `
    --headed `
    --skip-existing

if ($LASTEXITCODE -ne 0) {
    Write-Host "`nFailed at 5 PDFs" -ForegroundColor Red
    exit 1
}

$pdf5 = (Get-ChildItem -Path "./test_data/pdf/ARCADIA" -Filter "*.pdf" -ErrorAction SilentlyContinue).Count
Write-Host "OK - 5 PDF test passed ($pdf5 total PDFs)`n" -ForegroundColor Green

# Summary
Write-Host "`n" + "=" * 60 -ForegroundColor Cyan
Write-Host "ALL TESTS PASSED!" -ForegroundColor Green
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host "`nTest Results:" -ForegroundColor Cyan
Write-Host "  - Total PDFs downloaded: $pdf5" -ForegroundColor White
Write-Host "  - All batch sizes successful" -ForegroundColor White
Write-Host "`nReady for production run!" -ForegroundColor Green
Write-Host "`nCommands to run next:" -ForegroundColor Yellow
Write-Host "  # Single neighborhood (full):" -ForegroundColor Gray
Write-Host "  python baltimore_violations_scraper.py --neighborhoods ARCADIA --out ./data --extract --headed --skip-existing`n" -ForegroundColor White
Write-Host "  # All neighborhoods:" -ForegroundColor Gray
Write-Host "  python baltimore_violations_scraper.py --all --out ./data --extract --headed --skip-existing`n" -ForegroundColor White

