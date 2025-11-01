import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveDataPath } from "@/lib/fs";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  const rel = new URL(req.url).searchParams.get("p");
  if (!rel) return new NextResponse("Missing p", { status: 400 });
  const abs = resolveDataPath(rel);
  const stat = await fs.stat(abs).catch(() => null);
  if (!stat?.isFile()) return new NextResponse("Not found", { status: 404 });
  const ext = path.extname(abs).toLowerCase();
  const mime =
    ext === ".pdf"
      ? "application/pdf"
      : ext === ".txt"
      ? "text/plain; charset=utf-8"
      : ext === ".json"
      ? "application/json; charset=utf-8"
      : "application/octet-stream";
  return new NextResponse(await fs.readFile(abs), {
    headers: { "Content-Type": mime },
  });
}
