import { NextResponse } from "next/server";
import { db } from "@db/config/configureClient";
import { violations } from "@/db/migrations/schema";
import { and, gte, lte, eq } from "drizzle-orm";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const neighborhood = searchParams.get("neighborhood") || undefined;
  const from = searchParams.get("from") || undefined; // YYYY-MM-DD
  const to = searchParams.get("to") || undefined;

  const where = [];
  if (neighborhood) where.push(eq(violations.neighborhood, neighborhood));
  if (from) where.push(gte(violations.dateNotice, new Date(from)));
  if (to) where.push(lte(violations.dateNotice, new Date(to)));

  const rows = await db
    .select()
    .from(violations)
    .where(where.length ? and(...where) : undefined);

  return NextResponse.json({ rows });
}
