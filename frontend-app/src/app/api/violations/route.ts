// src/app/api/violations/route.ts
import { NextResponse, NextRequest } from "next/server";
import { and, desc, eq, gte, lte, ilike, or, sql } from "drizzle-orm";
import { db } from "@db/config/configureClient"; // your drizzle(db) using postgres.js
import { violations } from "@/db/migrations/schema"; // adjust path if different

type Row = typeof violations.$inferSelect;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  const neighborhood = url.searchParams.get("neighborhood") ?? undefined;
  const from = url.searchParams.get("from") ?? undefined; // YYYY-MM-DD
  const to = url.searchParams.get("to") ?? undefined; // YYYY-MM-DD
  const q = url.searchParams.get("q") ?? undefined;

  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") ?? "25") || 25, 5),
    100
  );
  const offset = (page - 1) * limit;

  // Build WHERE
  const where: any[] = [];
  if (neighborhood) where.push(eq(violations.neighborhood, neighborhood));
  if (from) where.push(gte(violations.dateNotice, new Date(from)));
  if (to) where.push(lte(violations.dateNotice, new Date(to)));
  if (q) {
    const like = `%${q}%`;
    where.push(
      or(
        ilike(violations.address, like),
        ilike(violations.noticeNumber, like),
        ilike(violations.neighborhood, like)
      )
    );
  }
  const whereExpr = where.length ? and(...where) : undefined;

  try {
    // Keep slow queries from hanging forever
    await db.execute(sql`set local statement_timeout to 15000`);

    // Total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(violations)
      .where(whereExpr);

    // Page rows
    const rows: Row[] = await db
      .select()
      .from(violations)
      .where(whereExpr)
      .orderBy(desc(violations.dateNotice))
      .limit(limit)
      .offset(offset);

    const pages = Math.max(1, Math.ceil(Number(count) / Math.max(1, limit)));

    return NextResponse.json(
      { rows, total: Number(count), page, pages, limit },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err: any) {
    // Return a friendly, consumable payload so the UI stays up
    return NextResponse.json(
      {
        rows: [],
        total: 0,
        page,
        pages: 1,
        limit,
        error: err?.message ?? "Unknown error",
      },
      { status: 200, headers: { "x-api-warning": "violations-query-failed" } }
    );
  }
}
