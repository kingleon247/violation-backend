#!/bin/bash
# Baltimore Violations Scraper - Test Script
# This script tests the timeout fixes with progressively more complex tests

echo ""
echo "================================================"
echo "Baltimore Violations Scraper - Test Suite"
echo "================================================"
echo ""

# Check if virtual environment is activated
if [ -z "$VIRTUAL_ENV" ]; then
    echo "Activating virtual environment..."
    source .venv/Scripts/activate || source .venv/bin/activate
fi

echo ""
echo "Test 1: Site Connectivity Check"
echo "-----------------------------------------------"
echo "Testing if the Baltimore Housing site is accessible..."
echo ""
python test_site_connectivity.py

if [ $? -ne 0 ]; then
    echo ""
    echo "[ERROR] Site connectivity test failed!"
    echo "The Baltimore Housing website may be down or inaccessible."
    exit 1
fi

echo ""
echo ""
echo "Test 2: Single PDF Download (Headed Mode)"
echo "-----------------------------------------------"
echo "Attempting to download 1 PDF with visible browser..."
echo ""
echo "This will open a browser window. Watch what happens."
echo "Press Ctrl+C if you see it's not working."
echo ""

read -p "Continue with headed test? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    python baltimore_violations_scraper.py \
        --neighborhoods ARCADIA \
        --out ./data \
        --extract \
        --max-pdfs-per-neighborhood 1 \
        --headed
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "[SUCCESS] Headed test completed!"
    else
        echo ""
        echo "[WARNING] Headed test had issues"
    fi
fi

echo ""
echo ""
echo "Test 3: Small Batch (Headless Mode)"
echo "-----------------------------------------------"
echo "Attempting to download 3 PDFs in headless mode..."
echo ""

read -p "Continue with batch test? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    python baltimore_violations_scraper.py \
        --neighborhoods ARCADIA \
        --out ./data \
        --extract \
        --max-pdfs-per-neighborhood 3 \
        --skip-existing
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "[SUCCESS] Batch test completed!"
        
        # Check results
        pdf_count=$(find ./data/pdf/ARCADIA -name "*.pdf" 2>/dev/null | wc -l)
        echo ""
        echo "Results:"
        echo "  - PDFs downloaded: $pdf_count"
        
        if [ $pdf_count -gt 0 ]; then
            echo ""
            echo "  The timeout fixes appear to be working!"
            echo "  You can now run the full scraper."
            echo ""
        else
            echo ""
            echo "  No PDFs were downloaded. This could mean:"
            echo "  1. The site is blocking requests"
            echo "  2. PDFs are not available for this neighborhood"
            echo "  3. Site structure has changed"
            echo ""
        fi
    else
        echo ""
        echo "[ERROR] Batch test failed!"
    fi
fi

echo ""
echo ""
echo "Test 4: Full Neighborhood (Optional)"
echo "-----------------------------------------------"
echo "Attempting to download all PDFs for ARCADIA..."
echo ""
echo "This may take 5-15 minutes depending on the number of violations."
echo ""

read -p "Continue with full test? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    python baltimore_violations_scraper.py \
        --neighborhoods ARCADIA \
        --out ./data \
        --extract \
        --skip-existing
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "[SUCCESS] Full neighborhood test completed!"
        
        # Check results
        pdf_count=$(find ./data/pdf/ARCADIA -name "*.pdf" 2>/dev/null | wc -l)
        txt_count=$(find ./data/text/ARCADIA -name "*.txt" 2>/dev/null | wc -l)
        
        echo ""
        echo "Final Results:"
        echo "  - PDFs downloaded: $pdf_count"
        echo "  - Text files extracted: $txt_count"
        echo "  - CSV file: ./data/violations.csv"
        echo ""
    fi
fi

echo ""
echo "================================================"
echo "Test Suite Complete"
echo "================================================"
echo ""

echo "Next steps:"
echo "  - Review logs above for any errors"
echo "  - Check ./data/pdf/ARCADIA/ for downloaded PDFs"
echo "  - Check ./data/violations.csv for extracted data"
echo "  - If successful, run for all neighborhoods with:"
echo "    python baltimore_violations_scraper.py --all --out ./data --extract --skip-existing"
echo ""

