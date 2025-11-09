#!/usr/bin/env tsx
/**
 * Import violations from CSV into the PostgreSQL database
 * Usage: tsx src/scripts/importViolations.ts
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { db } from "@db/config/configureClient";
import { violations } from "@db/migrations/schema";
import { readViolationsCsv, parseCsv } from "@/lib/fs";
import { eq } from "drizzle-orm";

async function main() {
  console.log("📖 Reading violations.csv...");
  const csvContent = await readViolationsCsv();
  
  if (!csvContent) {
    console.error("❌ No CSV file found or file is empty");
    process.exit(1);
  }

  const rows = parseCsv(csvContent);
  console.log(`✅ Found ${rows.length} violations in CSV\n`);

  if (rows.length === 0) {
    console.log("No violations to import");
    return;
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  console.log("🔄 Importing violations into database...\n");

  for (const row of rows) {
    try {
      // Skip rows without notice number
      if (!row.notice_number?.trim()) {
        skipped++;
        continue;
      }

      // Parse date
      let dateNotice: Date;
      try {
        // Try parsing as ISO date first (YYYY-MM-DD)
        dateNotice = new Date(row.date_notice);
        if (isNaN(dateNotice.getTime())) {
          // Try parsing as MM/DD/YYYY
          const parts = row.date_notice.split("/");
          if (parts.length === 3) {
            dateNotice = new Date(
              parseInt(parts[2]),
              parseInt(parts[0]) - 1,
              parseInt(parts[1])
            );
          } else {
            throw new Error("Invalid date format");
          }
        }
      } catch (e) {
        console.warn(
          `⚠️  Skipping ${row.notice_number}: invalid date "${row.date_notice}"`
        );
        skipped++;
        continue;
      }

      // Build PDF and text URLs (relative paths for now)
      const pdfUrl = row.pdf_path ? `/violations/pdf/${row.pdf_path}` : null;
      const textUrl = row.text_path
        ? `/violations/text/${row.text_path}`
        : null;

      // Check if exists
      const existing = await db
        .select()
        .from(violations)
        .where(eq(violations.noticeNumber, row.notice_number))
        .limit(1);

      const violationData = {
        noticeNumber: row.notice_number,
        address: row.address || "Unknown",
        type: row.type || "Unknown",
        district: row.district || null,
        neighborhood: row.neighborhood,
        dateNotice: dateNotice,
        pdfUrl,
        textUrl,
        updatedAt: new Date(),
      };

      if (existing.length > 0) {
        // Update existing
        await db
          .update(violations)
          .set(violationData)
          .where(eq(violations.noticeNumber, row.notice_number));
        updated++;
      } else {
        // Insert new
        await db.insert(violations).values({
          ...violationData,
          createdAt: new Date(),
        });
        inserted++;
      }

      // Progress indicator
      if ((inserted + updated + skipped + errors) % 100 === 0) {
        process.stdout.write(
          `\r  Processed: ${inserted + updated + skipped + errors}/${
            rows.length
          }...`
        );
      }
    } catch (error) {
      errors++;
      console.error(
        `\n❌ Error processing ${row.notice_number}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  console.log(`\n\n✅ Import complete!\n`);
  console.log(`📊 Results:`);
  console.log(`   - Inserted: ${inserted}`);
  console.log(`   - Updated:  ${updated}`);
  console.log(`   - Skipped:  ${skipped}`);
  console.log(`   - Errors:   ${errors}`);
  console.log(`   - Total:    ${rows.length}\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ Fatal error:", err);
  process.exit(1);
});

