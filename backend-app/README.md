
# Baltimore City Code Violations Scraper

Scrapes the DHCD violations search by **Neighborhood**, grabs the results table, and downloads each **PDF**.

## Install

```bash
python -m venv .venv && source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
python -m playwright install chromium
```

## Use

```bash
# All neighborhoods since 2025-01-01
python baltimore_violations_scraper.py --all --since 2025-01-01 --out ./data

# Specific list
python baltimore_violations_scraper.py --neighborhoods ABELL "BALTIMORE HIGHLANDS" --out ./data

# Debug headful
python baltimore_violations_scraper.py --neighborhoods ABELL --headed --out ./data
```

Output:
- `data/violations.csv` with columns:
  `address,type,date_notice,notice_number,district,neighborhood,pdf_path`
- PDFs under `data/pdf/<NEIGHBORHOOD>/...pdf`

## Notes / Ethics

- Respect site load: default script includes short delays; consider `--max-pdfs-per-neighborhood` for testing.
- Check the site's ToS / robots before bulk runs; this is provided for civic research/compliance.
- If the site changes its layout or switches to hard postback links, adjust the selectors marked in comments.
# violation-backend
