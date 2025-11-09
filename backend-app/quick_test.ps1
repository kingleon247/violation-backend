# Quick Test Script - Fast iterations for debugging
# Tests with just 1-2 PDFs to verify changes quickly

Write-Host "`nQuick Test - Baltimore Scraper" -ForegroundColor Cyan
Write-Host "=" * 50

# Activate venv
if (-not $env:VIRTUAL_ENV) {
    Write-Host "Activating virtual environment..." -ForegroundColor Yellow
    & .\.venv\Scripts\Activate.ps1
}

Write-Host "`nTest: Download 1 PDF (headed mode)" -ForegroundColor Green
Write-Host "-" * 50

python baltimore_violations_scraper.py `
    --neighborhoods ARCADIA `
    --out ./test_data `
    --extract `
    --max-pdfs-per-neighborhood 1 `
    --headed

if ($LASTEXITCODE -eq 0) {
    $pdfCount = (Get-ChildItem -Path "./test_data/pdf/ARCADIA" -Filter "*.pdf" -ErrorAction SilentlyContinue).Count
    
    if ($pdfCount -gt 0) {
        Write-Host "`nSUCCESS! Downloaded $pdfCount PDF(s)" -ForegroundColor Green
        Write-Host "`nReady for full test? Run:" -ForegroundColor Cyan
        Write-Host "  python baltimore_violations_scraper.py --neighborhoods ARCADIA --out ./data --extract --headed --skip-existing" -ForegroundColor White
    } else {
        Write-Host "`nFAILED - No PDFs downloaded" -ForegroundColor Red
    }
} else {
    Write-Host "`nScript failed with exit code $LASTEXITCODE" -ForegroundColor Red
}

Write-Host ""

