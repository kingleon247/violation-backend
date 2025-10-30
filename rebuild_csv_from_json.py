#!/usr/bin/env python3
"""
Rebuild data/violations.csv from existing per-notice JSON files.
Usage:
  python rebuild_csv_from_json.py  [root_dir]   # default: ./data
"""
import csv, json, sys
from pathlib import Path

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("data")
json_root = root / "json"
text_root = root / "text"
csv_path  = root / "violations.csv"

rows = []
for j in json_root.rglob("*.json"):
    try:
        payload = json.loads(j.read_text(encoding="utf-8"))
    except Exception:
        continue

    row = payload.get("row", {}) or {}
    nhood = payload.get("neighborhood") or ""
    source_pdf = payload.get("source_pdf") or ""
    text_path = ""

    if source_pdf:
        try:
            pdf_name = Path(source_pdf).name
            cand = (text_root / nhood / (Path(pdf_name).stem + ".txt"))
            if cand.exists():
                text_path = str(cand)
        except Exception:
            pass

    rows.append([
        row.get("address",""),
        row.get("type",""),
        row.get("date_notice",""),
        row.get("notice_number",""),
        row.get("district",""),
        row.get("neighborhood_cell","") or nhood,
        source_pdf,
        text_path,
    ])

csv_path.parent.mkdir(parents=True, exist_ok=True)
with open(csv_path, "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["address","type","date_notice","notice_number","district","neighborhood","pdf_path","text_path"])
    w.writerows(rows)

print(f"[ok] Wrote {csv_path} with {len(rows)} rows")
