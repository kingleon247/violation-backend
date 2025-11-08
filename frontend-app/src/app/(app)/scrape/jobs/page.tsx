// src/app/(app)/scrape/jobs/page.tsx
import "server-only";

import { cache } from "react";
import Link from "next/link";
import { Suspense } from "react";
import { headers as nextHeaders } from "next/headers";

import { Heading, Subheading } from "@components/catalyst/heading";
import { Divider } from "@components/catalyst/divider";
import { Button } from "@components/catalyst/button";
import { Badge } from "@components/catalyst/badge";

type Job = {
  id: string;
  createdAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  status: "queued" | "running" | "success" | "error";
  ok: boolean | null;
  error: string | null;
  payload: Record<string, unknown> | null;
  heartbeatAt?: string | null;
};

/**
 * Resolve a base URL for server-side fetches.
 * - Uses NEXT_PUBLIC_BASE_URL if set (good for prod).
 * - Otherwise derives from request headers (works locally).
 */
async function getBaseUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  try {
    // In some Next versions headers() is async; in others it's sync.
    // Using `await` handles both (TS-wise) without tripping the “Property 'get'” error.
    const h = await nextHeaders();
    const host = h.get("host") ?? "localhost:3000";
    const proto = host.includes("localhost") ? "http" : "https";
    return `${proto}://${host}`;
  } catch {
    return "http://localhost:3000";
  }
}

const getJobs = cache(async (): Promise<Job[]> => {
  const base = await getBaseUrl();
  const res = await fetch(`${base}/api/scrape?limit=50&page=1`, {
    cache: "no-store",
    headers: { "content-type": "application/json" },
  });
  if (!res.ok) return [];
  const json = await res.json();
  return json?.jobs ?? [];
});

function fmt(dt?: string | null) {
  if (!dt) return "—";
  try {
    return new Date(dt).toLocaleString();
  } catch {
    return dt ?? "—";
  }
}

function StatusBadge({ status }: { status: Job["status"] }) {
  // Map statuses to Catalyst badge color tokens
  const color: Record<
    Job["status"],
    React.ComponentProps<typeof Badge>["color"]
  > = {
    queued: "amber",
    running: "sky",
    success: "emerald",
    error: "rose",
  };
  return <Badge color={color[status]}>{status}</Badge>;
}

function JobRow({ j }: { j: Job }) {
  const nhoods = Array.isArray(j.payload?.neighborhoods)
    ? (j.payload!.neighborhoods as string[]).join(", ")
    : "all";
  const max = (j.payload?.maxPdfsPerNeighborhood as number) || 0;

  return (
    <tr className="border-b border-zinc-200/80 last:border-0">
      <td className="px-3 py-3 font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
        {j.id}
      </td>
      <td className="px-3 py-3">
        <StatusBadge status={j.status} />
      </td>
      <td className="px-3 py-3">{nhoods}</td>
      <td className="px-3 py-3">{fmt(j.createdAt)}</td>
      <td className="px-3 py-3">{fmt(j.startedAt)}</td>
      <td className="px-3 py-3">{fmt(j.finishedAt)}</td>
      <td className="px-3 py-3">{fmt(j.heartbeatAt)}</td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap gap-2">
          {/* Button supports `href` directly; no size/variant props in Catalyst */}
          <Button
            href={`/api/scrape/log?id=${j.id}&tail=65536`}
            target="_blank"
            rel="noreferrer"
          >
            View log
          </Button>
          <Button href={`/api/scrape/log?id=${j.id}&download=1`} outline>
            Download
          </Button>
        </div>
      </td>
      <td
        className="px-3 py-3 max-w-[320px] truncate text-zinc-700 dark:text-zinc-300"
        title={j.error || ""}
      >
        {j.error ? j.error : "—"}
      </td>
      <td className="px-3 py-3">{max || "—"}</td>
    </tr>
  );
}

function JobsTable({ jobs }: { jobs: Job[] }) {
  if (!jobs.length) {
    return (
      <div className="rounded-lg border border-zinc-200 p-6 text-sm text-zinc-500 dark:border-white/10">
        No jobs yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-white/10">
      <table className="min-w-full text-sm">
        <thead className="bg-zinc-50 dark:bg-zinc-900/40">
          <tr className="text-left text-zinc-600 dark:text-zinc-300">
            <th className="px-3 py-2 font-semibold">ID</th>
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="px-3 py-2 font-semibold">Neighborhoods</th>
            <th className="px-3 py-2 font-semibold">Created</th>
            <th className="px-3 py-2 font-semibold">Started</th>
            <th className="px-3 py-2 font-semibold">Finished</th>
            <th className="px-3 py-2 font-semibold">Heartbeat</th>
            <th className="px-3 py-2 font-semibold">Logs</th>
            <th className="px-3 py-2 font-semibold">Error</th>
            <th className="px-3 py-2 font-semibold">Max/PDFs</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-white/10">
          {jobs.map((j) => (
            <JobRow key={j.id} j={j} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Lightweight server refresh wrapper.
 * We keep it server-side for clean data access, and let the user click "Refresh".
 * If you want auto-polling, add a client component with setInterval.
 */
async function LiveJobs({ initial }: { initial: Job[] }) {
  const jobs = await getJobs();
  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <form action="/(app)/scrape/jobs">
            <Button type="submit" outline>
              Refresh
            </Button>
          </form>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Server-fetched; click Refresh to update.
          </span>
        </div>
      </div>
      <div className="mt-4">
        <JobsTable jobs={jobs.length ? jobs : initial} />
      </div>
    </>
  );
}

export default async function JobsPage() {
  const initial = await getJobs();

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Heading>Scrape jobs</Heading>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Track job state, view logs, and download raw run output.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/scrape/new">
            <Button outline>New scrape</Button>
          </Link>
          <Link href="/violations">
            <Button>Back to violations</Button>
          </Link>
        </div>
      </div>

      <Divider />

      <Suspense
        fallback={
          <div className="text-sm text-zinc-500 dark:text-zinc-400">
            Loading jobs…
          </div>
        }
      >
        {/* Server component; no client state needed */}
        <LiveJobs initial={initial} />
      </Suspense>
    </div>
  );
}
