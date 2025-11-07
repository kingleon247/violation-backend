// src/app/(app)/scrape/new/page.tsx
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { Heading } from "@components/catalyst/heading";
import { Button } from "@components/catalyst/button";
import {
  Fieldset,
  Legend,
  FieldGroup,
  Field,
  Label,
  Description,
} from "@components/catalyst/fieldset";
import { Input } from "@components/catalyst/input";
import { Checkbox } from "@components/catalyst/checkbox";
import { Select } from "@components/catalyst/select";

export const metadata: Metadata = { title: "Run scrape" };

/* -------------------------------- helpers -------------------------------- */

function clamp(n: number, min: number, max: number) {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

// Normalize browser <input type="date"> value to YYYY-MM-DD or undefined
function normalizeDateISO(s: string | null): string | undefined {
  const raw = (s ?? "").trim();
  if (!raw) return undefined;
  // Most browsers already give YYYY-MM-DD; still coerce via Date for safety.
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return undefined;
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    .toISOString()
    .slice(0, 10);
}

// Build absolute URL (supports proxy headers and optional APP_URL fallback)
async function absoluteUrl(path: string) {
  const h = await headers();
  const appUrl = process.env.APP_URL; // optional explicit base (e.g., https://scraper.yourdomain.com)
  if (appUrl) return `${appUrl}${path.startsWith("/") ? path : `/${path}`}`;

  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  if (!host) throw new Error("Missing host header");
  return `${proto}://${host}${path.startsWith("/") ? path : `/${path}`}`;
}

// Fetch neighborhoods for the select (server component fetch)
async function getNeighborhoods(): Promise<string[]> {
  try {
    const url = await absoluteUrl("/api/neighborhoods");
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const json = (await res.json()) as { neighborhoods?: string[] } | string[];
    return Array.isArray(json) ? json : json.neighborhoods ?? [];
  } catch {
    return [];
  }
}

/* ---------------------------- server action ------------------------------- */

async function enqueueScrape(formData: FormData) {
  "use server";

  // Pull the authoritative list server-side too (never trust form values).
  const allowed = new Set(
    (await getNeighborhoods()).map((n) => n.toUpperCase())
  );

  // Multi-select → array; filter to allowed values; de-dup
  const neighborhoodsSel = formData
    .getAll("neighborhoods")
    .map((v) => String(v).trim())
    .filter(Boolean);

  const neighborhoodsFiltered = Array.from(
    new Set(neighborhoodsSel.filter((n) => allowed.has(n.toUpperCase())))
  );

  const neighborhoods =
    neighborhoodsFiltered.length > 0 ? neighborhoodsFiltered : undefined;

  const since = normalizeDateISO(formData.get("since") as string | null);

  const extract = formData.get("extract") === "on";
  const ocr = formData.get("ocr") === "on";

  // Positive int, clamp to a sensible safety ceiling
  const maxRaw =
    (formData.get("maxPdfsPerNeighborhood") as string | null) ?? "";
  const maxParsed =
    maxRaw.trim() === "" ? undefined : Math.floor(Number(maxRaw));
  const maxPdfsPerNeighborhood =
    maxParsed === undefined ? undefined : clamp(maxParsed, 1, 500); // hard cap so no one enqueues 1e9 by mistake

  const payload: Record<string, unknown> = { extract, ocr };
  if (since) payload.since = since;
  if (neighborhoods) payload.neighborhoods = neighborhoods;
  if (maxPdfsPerNeighborhood !== undefined) {
    payload.maxPdfsPerNeighborhood = maxPdfsPerNeighborhood;
  }

  try {
    const url = await absoluteUrl("/api/scrape");
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    // Log non-2xx to server console so we can diagnose, but don't block UX.
    if (!res.ok) {
      console.error(
        "[enqueueScrape] POST /api/scrape failed:",
        res.status,
        await res.text().catch(() => "")
      );
    }
  } catch (e) {
    console.error("[enqueueScrape] network error:", e);
  }

  redirect("/violations?enqueued=1");
}

/* --------------------------------- page ---------------------------------- */

export default async function NewScrapePage() {
  const neighborhoods = await getNeighborhoods();

  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <Heading>Run scrape</Heading>
        <Button href="/violations" className="-my-0.5">
          Back to violations
        </Button>
      </div>

      <form action={enqueueScrape} className="mt-8 space-y-10 max-w-3xl">
        {/* Scope */}
        <Fieldset>
          <Legend>Scope</Legend>
          <FieldGroup>
            <Field>
              <Label htmlFor="neighborhoods">Neighborhoods (optional)</Label>
              <Description>
                Choose one or more neighborhoods. Leave empty to scrape{" "}
                <strong>all</strong>.
              </Description>

              {/* Multi-select dropdown (Catalyst Select supports `multiple`) */}
              <Select
                id="neighborhoods"
                name="neighborhoods"
                multiple
                size={Math.min(8, Math.max(4, neighborhoods.length || 4))}
              >
                {neighborhoods.length === 0 ? (
                  <option value="" disabled>
                    (No neighborhoods available)
                  </option>
                ) : (
                  neighborhoods.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))
                )}
              </Select>
            </Field>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <Field>
                <Label htmlFor="since">Since (optional)</Label>
                <Description>
                  Start date (inclusive). Leave blank to auto-compute from DB.
                </Description>
                <Input id="since" name="since" type="date" />
              </Field>

              <Field>
                <Label htmlFor="maxPdfsPerNeighborhood">
                  Max PDFs per neighborhood (optional)
                </Label>
                <Description>
                  Limit downloads per neighborhood during this run.
                </Description>
                <Input
                  id="maxPdfsPerNeighborhood"
                  name="maxPdfsPerNeighborhood"
                  type="number"
                  min={1}
                  placeholder="unlimited"
                />
              </Field>
            </div>
          </FieldGroup>
        </Fieldset>

        {/* Options */}
        <Fieldset>
          <Legend>Options</Legend>
          <FieldGroup>
            <Field>
              <Label htmlFor="extract">Extract text from PDFs</Label>
              <Checkbox id="extract" name="extract" defaultChecked />
            </Field>
            <Field>
              <Label htmlFor="ocr">
                Enable OCR (slower; for image-based PDFs)
              </Label>
              <Checkbox id="ocr" name="ocr" />
            </Field>
          </FieldGroup>
        </Fieldset>

        <div className="flex items-center gap-3">
          <Button type="submit">Enqueue scrape</Button>
          <span className="text-sm text-zinc-500">
            Job is queued; the worker will pick it up and write artifacts/DB.
          </span>
        </div>
      </form>
    </>
  );
}
