import { NextRequest, NextResponse } from "next/server";
import { readViolationsCsv, parseCsv } from "@/lib/fs";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const n = url.searchParams.get("neighborhood") || undefined;
  const since = url.searchParams.get("since") || undefined;
  const q = url.searchParams.get("q")?.toLowerCase() || "";
  const rows = parseCsv(await readViolationsCsv()).filter((r) => {
    if (n && r.neighborhood !== n) return false;
    if (since && r.date_notice && new Date(r.date_notice) < new Date(since))
      return false;
    if (q && !JSON.stringify(r).toLowerCase().includes(q)) return false;
    return true;
  });
  return NextResponse.json({ rows });
}
