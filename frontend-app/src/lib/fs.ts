import fs from "node:fs/promises";
import path from "node:path";
import { DATA_ROOT } from "./paths";

export async function listNeighborhoodsFromData() {
  const kinds = ["pdf", "json", "text", "ocr"];
  const set = new Set<string>();
  for (const k of kinds) {
    try {
      const dir = path.join(DATA_ROOT, k);
      const items = await fs.readdir(dir, { withFileTypes: true });
      for (const e of items) if (e.isDirectory()) set.add(e.name);
    } catch {}
  }
  return Array.from(set).sort();
}

export type RecordRow = {
  address: string;
  type: string;
  date_notice: string;
  notice_number: string;
  district: string;
  neighborhood: string;
  pdf_path: string;
};

export async function readViolationsCsv(): Promise<string> {
  try {
    return await fs.readFile(path.join(DATA_ROOT, "violations.csv"), "utf8");
  } catch {
    return "";
  }
}

export function parseCsv(csv: string): RecordRow[] {
  if (!csv) return [];
  const [hdr, ...lines] = csv.split(/\r?\n/).filter(Boolean);
  const headers = hdr.split(",");
  return lines.map((l) => {
    const cols = split(l);
    const row: any = {};
    headers.forEach((h, i) => (row[h] = cols[i] ?? ""));
    return row as RecordRow;
  });
}
function split(s: string) {
  const out: string[] = [];
  let q = false,
    cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += ch;
    } else {
      if (ch === ",") {
        out.push(cur);
        cur = "";
      } else if (ch === '"') {
        q = true;
      } else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function resolveDataPath(rel: string) {
  const abs = path.normalize(path.join(DATA_ROOT, rel));
  if (!abs.startsWith(DATA_ROOT)) throw new Error("Bad path");
  return abs;
}
