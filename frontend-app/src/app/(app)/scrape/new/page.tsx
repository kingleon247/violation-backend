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

// Build an absolute URL (Next 15/16: headers() is async)
async function absoluteUrl(path: string) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  if (!host) throw new Error("Missing host header");
  return `${proto}://${host}${path.startsWith("/") ? path : `/${path}`}`;
}

// ---- Server Action: enqueue scrape ----
async function enqueueScrape(formData: FormData) {
  "use server";

  // Multi-select values come back as an array
  const neighborhoodsSel = formData
    .getAll("neighborhoods")
    .map((v) => String(v))
    .filter(Boolean);
  const neighborhoods =
    neighborhoodsSel.length > 0 ? neighborhoodsSel : undefined;

  const since = (formData.get("since") as string | null)?.trim() || undefined; // YYYY-MM-DD
  const extract = formData.get("extract") === "on";
  const ocr = formData.get("ocr") === "on";
  const maxRaw =
    (formData.get("maxPdfsPerNeighborhood") as string | null) || "";
  const maxPdfsPerNeighborhood = maxRaw !== "" ? Number(maxRaw) : undefined;

  const payload: Record<string, unknown> = { extract, ocr };
  if (since) payload.since = since;
  if (neighborhoods) payload.neighborhoods = neighborhoods;
  if (
    maxPdfsPerNeighborhood !== undefined &&
    !Number.isNaN(maxPdfsPerNeighborhood)
  ) {
    payload.maxPdfsPerNeighborhood = maxPdfsPerNeighborhood;
  }

  try {
    const url = await absoluteUrl("/api/scrape");
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch {
    // swallow network errors; we still redirect with a flag
  }

  redirect("/violations?enqueued=1");
}

// Fetch neighborhoods for the select (server component fetch)
async function getNeighborhoods(): Promise<string[]> {
  try {
    const url = await absoluteUrl("/api/neighborhoods");
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const json = (await res.json()) as { neighborhoods?: string[] } | string[];
    // Support either { neighborhoods: [...] } or simple array
    return Array.isArray(json) ? json : json.neighborhoods ?? [];
  } catch {
    return [];
  }
}

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
                size={Math.min(8, Math.max(4, neighborhoods.length || 4))} // show a few rows without getting huge
              >
                {neighborhoods.length === 0 ? (
                  // Graceful fallback if API returns none
                  <>
                    <option value="" disabled>
                      (No neighborhoods available)
                    </option>
                  </>
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
