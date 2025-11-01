#!/usr/bin/env python3
"""
Baltimore City Code Violations scraper — RESUME/NO-REDO DROP-IN (Windows-friendly)

Key features
------------
- Neighborhood search (--all or --neighborhoods ...), optional --since date filter.
- Scrapes rows (Address, Type, Date Notice, Notice Number, District, Neighborhood).
- Downloads every "See Notice" PDF (direct download, popup/new-tab, same-tab).
- Optional text/JSON extraction per PDF (pdfplumber). Optional OCR for scans (ocrmypdf/Tesseract).
- **Crash-proof CSV**: append/resume; row-by-row flush + fsync; clean Ctrl-C handling.
- **Resume logic**: --skip-existing (don't click rows if PDF already exists), --force-extract (rebuild text/json).

Usage (Windows, Git Bash)
-------------------------
py -3.11 -m venv .venv
source .venv/Scripts/activate
pip install -r requirements.txt
python -m playwright install chromium

# Watch one neighborhood and skip already-downloaded PDFs:
python baltimore_violations_scraper.py --neighborhoods ABELL --headed --slow-mo 200 --out ./data --extract --ocr --skip-existing

# Full run since a date (resumable):
python baltimore_violations_scraper.py --all --since 2025-01-01 --out ./data --extract --ocr --skip-existing
"""

from __future__ import annotations
import asyncio, csv, os, re, json, sys
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Tuple

from playwright.async_api import async_playwright, TimeoutError as PWTimeout

# Optional deps (ok if missing when --extract/--ocr not used)
try:
    import pdfplumber
except Exception:
    pdfplumber = None
try:
    import ocrmypdf
except Exception:
    ocrmypdf = None

SEARCH_URL = "https://cels.baltimorehousing.org/Search_On_Map.aspx"
SENTINEL_NEIGHBORHOODS = [
    "ABELL","ALLENDALE","ARCADIA","BALTIMORE HIGHLANDS","BARCLAY","CANTON",
    "CHARLES VILLAGE","FEDERAL HILL","HAMPDEN","HIGHLANDTOWN","MOUNT VERNON",
]

def norm_ws(s: str) -> str: return " ".join((s or "").split())

def parse_date(s: str) -> Optional[str]:
    s = (s or "").strip()
    for fmt in ("%m/%d/%Y", "%-m/%-d/%Y"):
        try:
            d = datetime.strptime(s, fmt)
            return d.date().isoformat()
        except Exception:
            pass
    return s or None

# ---------- Locate controls ----------

async def _find_neighborhood_select_by_options(page):
    selects = page.locator("select")
    for i in range(await selects.count()):
        sel = selects.nth(i)
        try:
            opts = await sel.evaluate("(el)=>Array.from(el.options).map(o=>(o.text||'').trim()).filter(Boolean)")
        except Exception:
            continue
        if not opts or len(opts) < 10: continue
        upper = {o.upper() for o in opts}
        hits = sum(1 for s in SENTINEL_NEIGHBORHOODS if s in upper)
        if hits >= 1 and len(opts) >= 50:
            return sel
    return None

async def get_neighborhood_controls(page):
    try:
        await page.locator("select").first.wait_for(state="attached", timeout=20000)
    except PWTimeout:
        pass

    for trigger in ["By Neighborhood", "Neighborhood"]:
        for locator in [f"xpath=//label[contains(normalize-space(.), '{trigger}')]", f"text={trigger}"]:
            try:
                el = page.locator(locator)
                if await el.count(): await el.first.click(timeout=1000)
            except Exception: pass

    sel = await _find_neighborhood_select_by_options(page)
    if sel is None:
        bigs = page.locator("select")
        for i in range(await bigs.count()):
            cand = bigs.nth(i)
            try:
                nopts = await cand.evaluate("(el)=>el.options.length")
                if nopts and nopts >= 50: sel = cand; break
            except Exception: continue
    if sel is None: raise PWTimeout("Could not locate the Neighborhood <select> control.")
    await sel.wait_for(state="visible", timeout=10000)

    cb = sel.locator("xpath=preceding::input[@type='checkbox'][1]")
    if await cb.count() == 0:
        cb = page.locator(
            "xpath=//input[@type='checkbox' and (contains(@id,'Neigh') or contains(@name,'Neigh') or contains(@id,'Neighborhood') or contains(@name,'Neighborhood'))]"
        ).first
    await cb.wait_for(state="attached", timeout=10000)
    return cb, sel

async def get_neighborhood_options(page) -> List[str]:
    _, select = await get_neighborhood_controls(page)
    return await select.evaluate("(el)=>Array.from(el.options).map(o=>o.text.trim()).filter(Boolean)")

# ---------- Search + results ----------

async def submit_search_for_neighborhood(page, neighborhood: str):
    checkbox, select = await get_neighborhood_controls(page)
    try:
        if not await checkbox.is_checked(): await checkbox.check()
    except Exception:
        try: await checkbox.click()
        except Exception: pass
    await select.select_option(label=neighborhood)

    try:
        await page.get_by_role("button", name=re.compile(r"Search", re.I)).click()
    except Exception:
        submit = page.locator("xpath=//input[@type='submit' and (contains(@value,'Search') or contains(@name,'Search'))]")
        if await submit.count(): await submit.first.click()
        else: await page.locator("button, input[type=submit]").first.click()

    try: await page.wait_for_url(re.compile(r"TL_On_Map\.aspx"), timeout=30000)
    except PWTimeout: pass
    await page.wait_for_load_state("domcontentloaded")

async def find_results_table(page):
    table = page.locator("table").nth(1)
    if await table.count() == 0 or await table.locator("tr").count() <= 1:
        table = page.locator("text=Record Count").locator("xpath=..").locator("xpath=following::table[1]")
    await table.wait_for(state="visible", timeout=10000)
    return table

async def extract_rows_on_results(page) -> List[Tuple[str,str,str,str,str,str]]:
    out = []
    table = await find_results_table(page)
    trs = table.locator("tr")
    for i in range(1, await trs.count()):
        tds = trs.nth(i).locator("td")
        if await tds.count() < 6: continue
        addr = norm_ws(await tds.nth(0).inner_text())
        typ  = norm_ws(await tds.nth(1).inner_text())
        draw = norm_ws(await tds.nth(2).inner_text()); d = parse_date(draw) or draw
        notice = norm_ws(await tds.nth(3).inner_text())
        dist   = norm_ws(await tds.nth(4).inner_text())
        nh     = norm_ws(await tds.nth(5).inner_text())
        out.append((addr, typ, d, notice, dist, nh))
    return out

# ---------- PDF capture paths ----------

async def _wait_pdf_response(new_page):
    try:
        return await new_page.wait_for_event(
            "response", lambda r: "pdf" in (r.headers.get("content-type","").lower()), timeout=15000
        )
    except PWTimeout:
        return None

async def _save_pdf_via_popup(context, page, click_callable, dest_path: Path) -> bool:
    try:
        async with context.expect_page(timeout=8000) as pinfo:
            await click_callable()
        new_page = await pinfo.value

        resp = await _wait_pdf_response(new_page)
        if resp:
            data = await resp.body()
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            dest_path.write_bytes(data)
            await new_page.close()
            return True

        for _ in range(30):
            url = new_page.url or ""
            if url.startswith(("http://","https://")):
                try:
                    r = await context.request.get(url, timeout=15000)
                    ctype = (r.headers or {}).get("content-type","")
                    if "pdf" in ctype.lower() or url.lower().endswith(".pdf"):
                        data = await r.body()
                        dest_path.parent.mkdir(parents=True, exist_ok=True)
                        dest_path.write_bytes(data)
                        await new_page.close()
                        return True
                except Exception:
                    pass
                break
            await asyncio.sleep(0.5)

        await new_page.close()
        return False
    except PWTimeout:
        return False

async def _save_pdf_via_download(page, click_callable, dest_path: Path) -> bool:
    try:
        async with page.expect_download(timeout=8000) as dl_info:
            await click_callable()
        download = await dl_info.value
        suggested = download.suggested_filename
        dest = dest_path.with_name(suggested) if suggested and suggested.lower().endswith(".pdf") else dest_path.with_suffix(".pdf")
        dest.parent.mkdir(parents=True, exist_ok=True)
        await download.save_as(dest.as_posix())
        return True
    except PWTimeout:
        return False

async def _save_pdf_via_navigation(context, page, click_callable, dest_path: Path) -> bool:
    try:
        async with page.expect_navigation(timeout=10000):
            await click_callable()
    except PWTimeout:
        return False
    url = page.url or ""
    if not url.startswith(("http://","https://")):
        try: await page.go_back(timeout=5000)
        except Exception: pass
        return False
    try:
        r = await context.request.get(url, timeout=15000)
        if "pdf" in (r.headers or {}).get("content-type","").lower() or url.lower().endswith(".pdf"):
            data = await r.body()
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            dest_path.write_bytes(data)
            try: await page.go_back(timeout=5000)
            except Exception: pass
            return True
    except Exception:
        pass
    try: await page.go_back(timeout=5000)
    except Exception: pass
    return False

async def download_all_pdfs_for_results(page, out_dir: Path, rows: List[Tuple[str,str,str,str,str,str]], *,
                                        after_download=None, max_pdfs: Optional[int]=None, skip_existing: bool=False) -> int:
    out_dir.mkdir(parents=True, exist_ok=True)
    table = await find_results_table(page)
    trs = table.locator("tr")
    downloaded = 0
    for i in range(1, await trs.count()):
        row = trs.nth(i)
        notice = (rows[i-1][3] if i-1 < len(rows) else "").strip().replace("/", "-").replace("\\","-")
        base = notice if notice else f"row-{i:04d}"
        dest = out_dir / f"{base}.pdf"

        # --- SKIP IF PDF ALREADY EXISTS ---
        if skip_existing and dest.exists():
            if after_download:
                try:
                    await after_download(dest, i-1, rows[i-1] if i-1 < len(rows) else None)
                except Exception:
                    pass
            continue
        # ----------------------------------

        cell = row.locator("td").last
        cands = [cell.locator("a"), cell.locator("input[type=image]"), cell.locator("img[onclick]"), cell.locator("img")]

        got = False
        for c in cands:
            for j in range(await c.count()):
                elem = c.nth(j)
                async def click_middle(): await elem.click(button="middle")
                async def click_ctrl():   await elem.click(modifiers=["Control"])
                async def click_plain():  await elem.click()

                if await _save_pdf_via_download(page, click_middle, dest): got = True; break
                if await _save_pdf_via_popup(page.context, page, click_ctrl, dest): got = True; break
                if await _save_pdf_via_navigation(page.context, page, click_plain, dest): got = True; break
            if got:
                downloaded += 1
                if after_download:
                    try: await after_download(dest, i-1, rows[i-1] if i-1 < len(rows) else None)
                    except Exception: pass
                break

        if max_pdfs and downloaded >= max_pdfs: break
        await page.wait_for_timeout(200)
    return downloaded

# ---------- Extraction ----------

def _extract_text(pdf_path: Path) -> str:
    if pdfplumber is None: return ""
    try:
        with pdfplumber.open(pdf_path) as pdf:
            return "\n".join((p.extract_text() or "") for p in pdf.pages).strip()
    except Exception:
        return ""

def _ocr_pdf(in_path: Path, out_path: Path) -> bool:
    if ocrmypdf is None: return False
    try:
        ocrmypdf.ocr(input_file=str(in_path), output_file=str(out_path),
                     skip_text=True, optimize=0, progress_bar=False, force_ocr=False, jobs=1)
        return True
    except Exception:
        return False

def _parse_fields_from_text(text: str) -> dict:
    fields = {}
    m = re.search(r"Notice\s*Number[:\s]+([A-Z0-9\-]+)", text, re.I)
    if m: fields["notice_number_from_pdf"] = m.group(1)
    m = re.search(r"Date\s*Notice[:\s]+(\d{1,2}/\d{1,2}/\d{4})", text, re.I)
    if m: fields["date_notice_from_pdf"] = m.group(1)
    return fields

async def make_after_download(out_root: Path, nhood: str, do_extract: bool, do_ocr: bool, force_extract: bool):
    text_root = out_root / "text" / nhood
    json_root = out_root / "json" / nhood
    ocr_root  = out_root / "ocr"  / nhood
    for d in (text_root, json_root, ocr_root): d.mkdir(parents=True, exist_ok=True)

    async def _after(pdf_path: Path, row_idx: int, row: Tuple[str,str,str,str,str,str] | None):
        if not do_extract: return

        txt_path = text_root / (pdf_path.stem + ".txt")
        json_path = json_root / (pdf_path.stem + ".json")

        if not force_extract and txt_path.exists() and json_path.exists():
            return

        text = _extract_text(pdf_path)
        if do_ocr and len(text) < 50:
            ocr_path = ocr_root / pdf_path.name
            if _ocr_pdf(pdf_path, ocr_path): text = _extract_text(ocr_path)

        txt_path.write_text(text, encoding="utf-8")
        payload = {
            "source_pdf": str(pdf_path),
            "neighborhood": nhood,
            "row": {
                "address": row[0] if row else "",
                "type": row[1] if row else "",
                "date_notice": row[2] if row else "",
                "notice_number": row[3] if row else "",
                "district": row[4] if row else "",
                "neighborhood_cell": row[5] if row else "",
            },
            "extracted_fields": _parse_fields_from_text(text),
            "has_text": bool(text),
        }
        json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return _after

# ---------- Orchestration ----------

async def run(all_neighborhoods: bool,
              neighborhoods: List[str],
              out_dir: Path,
              headless: bool = True,
              since: Optional[str] = None,
              max_pdfs_per_neighborhood: Optional[int] = None,
              slow_mo_ms: int = 0,
              do_extract: bool = False,
              do_ocr: bool = False,
              skip_existing: bool = False,
              force_extract: bool = False):

    out_dir.mkdir(parents=True, exist_ok=True)
    csv_path = out_dir / "violations.csv"

    # append/resume + write header if file is new
    file_exists = csv_path.exists()
    csv_file = open(csv_path, "a", newline="", encoding="utf-8")
    writer = csv.writer(csv_file)
    if not file_exists:
        writer.writerow(["address","type","date_notice","notice_number","district","neighborhood","pdf_path","text_path"])
        csv_file.flush(); os.fsync(csv_file.fileno())

    # Build set of existing notice_numbers to avoid duplicate CSV rows
    existing_notices = set()
    if file_exists:
        try:
            with open(csv_path, "r", encoding="utf-8") as _f:
                rdr = csv.DictReader(_f)
                for row in rdr:
                    n = (row.get("notice_number") or "").strip().upper()
                    if n: existing_notices.add(n)
        except Exception:
            pass

    since_date = None
    if since:
        try: since_date = datetime.fromisoformat(since).date()
        except Exception:
            print(f"[warn] 'since' value {since!r} not ISO-date (YYYY-MM-DD). Ignoring.")
            since_date = None

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=headless, args=["--disable-gpu"] if headless else None)
        context = await browser.new_context(accept_downloads=True,
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) PlaywrightScraper/1.0",
            viewport={"width": 1440, "height": 900})
        page = await context.new_page()

        async def goto(url: str):
            await page.goto(url, timeout=60000)
            await page.wait_for_load_state("domcontentloaded")
            if slow_mo_ms: await page.wait_for_timeout(slow_mo_ms)

        await goto(SEARCH_URL); await page.wait_for_timeout(500)

        all_options = await get_neighborhood_options(page)
        if all_neighborhoods:
            targets = all_options
        else:
            normalized = {opt.upper(): opt for opt in all_options}
            targets = []
            for n in neighborhoods:
                key = n.upper().strip()
                if key in normalized: targets.append(normalized[key])
                else: print(f"[warn] Neighborhood {n!r} not found in options; skipping.")
            if not targets:
                print("[error] No valid neighborhoods selected.")
                await browser.close(); csv_file.close(); return

        for nhood in targets:
            print(f"\n=== {nhood} ===")
            await goto(SEARCH_URL); await page.wait_for_timeout(400)

            try: await submit_search_for_neighborhood(page, nhood)
            except PWTimeout: print(f"[warn] Timeout submitting search for {nhood}; skipping."); continue

            try: rows = await extract_rows_on_results(page)
            except PWTimeout: print(f"[warn] Could not find results table for {nhood}; skipping."); continue

            filtered = []
            for r in rows:
                addr, typ, date_notice, notice_num, district, neighborhood = r
                if since_date and date_notice:
                    try:
                        d = datetime.fromisoformat(date_notice).date()
                        if d < since_date: continue
                    except Exception: pass
                filtered.append(r)

            print(f"[info] Found {len(filtered)} rows for {nhood}.")
            pdf_dir  = out_dir / "pdf"  / nhood.replace("/", "-")
            txt_root = out_dir / "text" / nhood.replace("/", "-")

            after = await make_after_download(out_dir, nhood, do_extract, do_ocr, force_extract)
            downloaded = await download_all_pdfs_for_results(
                page, pdf_dir, filtered, after_download=after,
                max_pdfs=max_pdfs_per_neighborhood, skip_existing=skip_existing
            )
            print(f"[info] Downloaded {downloaded} PDFs for {nhood}.")

            text_files = {f.stem.upper(): f for f in txt_root.glob("*.txt")}
            pdf_files  = {f.stem.upper(): f for f in pdf_dir.glob("*.pdf")}

            for r in filtered:
                addr, typ, date_notice, notice_num, district, neighborhood = r
                key = (notice_num or "").strip().upper()

                # dedupe CSV rows if resuming
                if skip_existing and key and key in existing_notices:
                    continue

                pdf_path = os.path.relpath(pdf_files[key].as_posix(), out_dir.as_posix()) if key in pdf_files else ""
                text_path = os.path.relpath(text_files[key].as_posix(), out_dir.as_posix()) if key in text_files else ""

                writer.writerow([addr, typ, date_notice, notice_num, district, neighborhood, pdf_path, text_path])
                csv_file.flush(); os.fsync(csv_file.fileno())

                if key: existing_notices.add(key)

            await page.wait_for_timeout(500)

        await browser.close()
    csv_file.close()
    print(f"\nDone. CSV: {csv_path}")

if __name__ == "__main__":
    import argparse, re
    parser = argparse.ArgumentParser(description="Scrape Baltimore City code violation notices by neighborhood.")
    g = parser.add_mutually_exclusive_group(required=True)
    g.add_argument("--all", action="store_true", help="Scrape all neighborhoods.")
    g.add_argument("--neighborhoods", nargs="+", help="One or more neighborhood names (as shown on the site).")
    parser.add_argument("--out", type=Path, default=Path("./out"), help="Output directory for CSV/TXT/JSON/PDF.")
    parser.add_argument("--since", type=str, default=None, help="Only include rows on/after this ISO date YYYY-MM-DD.")
    parser.add_argument("--headed", action="store_true", help="Run with a visible browser window (for debugging).")
    parser.add_argument("--max-pdfs-per-neighborhood", type=int, default=None, help="Limit PDF downloads per neighborhood (debug).")
    parser.add_argument("--slow-mo", type=int, default=0, help="Extra ms delay between page actions (debug).")
    parser.add_argument("--extract", action="store_true", help="Also extract text and JSON for each PDF.")
    parser.add_argument("--ocr", action="store_true", help="When no text layer, try OCR (needs Tesseract installed).")
    parser.add_argument("--skip-existing", action="store_true", help="Skip rows whose PDF already exists (resume).")
    parser.add_argument("--force-extract", action="store_true", help="Rebuild text/json even if they exist.")
    args = parser.parse_args()

    try:
        asyncio.run(run(
            all_neighborhoods=args.all,
            neighborhoods=args.neighborhoods or [],
            out_dir=args.out,
            headless=not args.headed,
            since=args.since,
            max_pdfs_per_neighborhood=args.max_pdfs_per_neighborhood,
            slow_mo_ms=args.slow_mo,
            do_extract=args.extract,
            do_ocr=args.ocr,
            skip_existing=args.skip_existing,
            force_extract=args.force_extract,
        ))
    except KeyboardInterrupt:
        print("\n[warn] Stopped by user. CSV may be partial but is flushed.")
