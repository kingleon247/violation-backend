// src/app/(app)/violations/page.tsx
import { headers } from "next/headers";
import type { Metadata } from "next";
import { Fragment } from "react";

import { Heading } from "@components/catalyst/heading";
import { Button } from "@components/catalyst/button";
import {
  Table,
  TableHead,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
} from "@components/catalyst/table";
import {
  Pagination,
  PaginationPrevious,
  PaginationNext,
  PaginationList,
  PaginationPage,
  PaginationGap,
} from "@components/catalyst/pagination";
import { Input } from "@components/catalyst/input";

export const metadata: Metadata = {
  title: "Violations",
};

type Violation = {
  notice_number: string;
  neighborhood: string | null;
  address: string | null;
  date_notice: string | null; // ISO date string
  status?: string | null;
  pdf_url?: string | null;
};

type ViolationsResponse = {
  rows: Violation[];
  page: number;
  pages: number;
  total?: number;
  limit?: number;
};

type SP = Record<string, string | string[] | undefined>;

/* ---------- helpers ---------- */

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso ?? "—";
  }
}

async function absoluteUrl(path: string) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  if (!host) throw new Error("Missing host header to build absolute URL");
  return `${proto}://${host}${path.startsWith("/") ? path : `/${path}`}`;
}

function clean<T>(obj: Record<string, T | undefined>) {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    out.set(k, String(v));
  }
  return out;
}

function pageList(current: number, total: number) {
  // 1 … [current-1, current, current+1] … total  (with guards)
  const pages: (number | "...")[] = [];
  const push = (p: number | "...") => pages.push(p);

  const window = 1;
  const start = Math.max(1, current - window);
  const end = Math.min(total, current + window);

  if (start > 1) push(1);
  if (start > 2) push("...");

  for (let p = start; p <= end; p++) push(p);

  if (end < total - 1) push("...");
  if (end < total) push(total);

  return pages;
}

/* ---------- data fetch ---------- */

async function fetchViolations(sp: SP): Promise<ViolationsResponse> {
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const limit = Math.min(Math.max(Number(sp.limit ?? "25") || 25, 5), 100);

  const params = clean({
    page,
    limit,
    neighborhood:
      typeof sp.neighborhood === "string" ? sp.neighborhood : undefined,
    from: typeof sp.from === "string" ? sp.from : undefined,
    to: typeof sp.to === "string" ? sp.to : undefined,
    q: typeof sp.q === "string" ? sp.q : undefined,
  });

  const url = await absoluteUrl(`/api/violations?${params.toString()}`);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`/api/violations failed: ${res.status}`);
  }
  // Allow slightly flexible payloads
  const json = (await res.json()) as Partial<ViolationsResponse>;
  return {
    rows: json.rows ?? [],
    page: json.page ?? page,
    pages: json.pages ?? 1,
    total: json.total ?? undefined,
    limit: json.limit ?? limit,
  };
}

/* ---------- page ---------- */

export default async function ViolationsPage(props: {
  searchParams: Promise<SP>;
}) {
  const sp = await props.searchParams;
  const { rows, page, pages } = await fetchViolations(sp);

  const buildHref = (nextPage: number) => {
    const params = new URLSearchParams();

    if (typeof sp.neighborhood === "string")
      params.set("neighborhood", sp.neighborhood);
    if (typeof sp.from === "string") params.set("from", sp.from);
    if (typeof sp.to === "string") params.set("to", sp.to);
    if (typeof sp.q === "string") params.set("q", sp.q);

    params.set("page", String(nextPage));
    params.set("limit", String(sp.limit ?? "25"));

    return `/violations?${params.toString()}`;
  };

  const pageItems = pageList(page, pages);

  return (
    <>
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <Heading>Violations</Heading>
        {/* Link-style button: pass href (no `asChild` needed) */}
        <Button href="/scrape/new" className="-my-0.5">
          Run scrape
        </Button>
      </div>

      {/* Filters (minimal example to avoid type issues) */}
      <form
        className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3"
        action="/violations"
      >
        <Input
          name="neighborhood"
          placeholder="Neighborhood"
          defaultValue={
            typeof sp.neighborhood === "string" ? sp.neighborhood : ""
          }
        />
        <Input
          type="date"
          name="from"
          defaultValue={typeof sp.from === "string" ? sp.from : ""}
        />
        <Input
          type="date"
          name="to"
          defaultValue={typeof sp.to === "string" ? sp.to : ""}
        />
        <div className="sm:col-span-3 flex items-center gap-3">
          <Input
            name="q"
            placeholder="Search address / notice #"
            defaultValue={typeof sp.q === "string" ? sp.q : ""}
            className="max-w-lg flex-1"
          />
          <input type="hidden" name="limit" value={String(sp.limit ?? "25")} />
          <Button type="submit">Apply filters</Button>
        </div>
      </form>

      {/* Table */}
      <Table className="mt-8" striped>
        <TableHead>
          <TableRow>
            <TableHeader>Notice #</TableHeader>
            <TableHeader>Date</TableHeader>
            <TableHeader>Neighborhood</TableHeader>
            <TableHeader>Address</TableHeader>
            <TableHeader>PDF</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-zinc-500">
                No results.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((v) => (
              <TableRow key={v.notice_number}>
                <TableCell>{v.notice_number}</TableCell>
                <TableCell className="text-zinc-500">
                  {formatDate(v.date_notice)}
                </TableCell>
                <TableCell>{v.neighborhood ?? "—"}</TableCell>
                <TableCell>{v.address ?? "—"}</TableCell>
                <TableCell>
                  {v.pdf_url ? (
                    <Button href={v.pdf_url} plain target="_blank">
                      Open
                    </Button>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* Pagination */}
      <div className="mt-8">
        <Pagination aria-label="Page navigation">
          <PaginationPrevious href={page > 1 ? buildHref(page - 1) : null} />
          <PaginationList>
            {pageItems.map((p, i) =>
              p === "..." ? (
                <PaginationGap key={`gap-${i}`} />
              ) : (
                <PaginationPage
                  key={p}
                  href={buildHref(p)}
                  current={p === page}
                >
                  {p}
                </PaginationPage>
              )
            )}
          </PaginationList>
          <PaginationNext href={page < pages ? buildHref(page + 1) : null} />
        </Pagination>
      </div>
    </>
  );
}
