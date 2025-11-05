// src/app/api/violations/route.ts
import { NextResponse, NextRequest } from "next/server";
import { and, desc, eq, gte, lte, ilike, or, sql } from "drizzle-orm";
import { db } from "@db/config/configureClient";
import { violations } from "@/db/migrations/schema";
type Row = typeof violations.$inferSelect;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const neighborhood = url.searchParams.get("neighborhood") ?? undefined;
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  const q = url.searchParams.get("q") ?? undefined;
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") ?? "25") || 25, 5),
    100
  );
  const offset = (page - 1) * limit;

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
    let total = 0;
    let rows: Row[] = [];

    await db.transaction(async (tx) => {
      await tx.execute(sql`set local statement_timeout to 15000`); // <- inside tx now

      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)` })
        .from(violations)
        .where(whereExpr);

      rows = await tx
        .select()
        .from(violations)
        .where(whereExpr)
        .orderBy(desc(violations.dateNotice))
        .limit(limit)
        .offset(offset);

      total = Number(count);
    });

    const pages = Math.max(1, Math.ceil(total / Math.max(1, limit)));
    return NextResponse.json(
      { rows, total, page, pages, limit },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err: any) {
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
