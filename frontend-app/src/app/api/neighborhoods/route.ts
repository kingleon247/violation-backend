import { NextResponse } from "next/server";
import { listNeighborhoodsFromData } from "@/lib/fs";
export const runtime = "nodejs";
export async function GET() {
  return NextResponse.json({ items: await listNeighborhoodsFromData() });
}
