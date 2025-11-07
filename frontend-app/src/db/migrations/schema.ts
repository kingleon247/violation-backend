// src/db/migrations/schema.ts

import {
  pgTable,
  uuid,
  text,
  index,
  timestamp,
  boolean,
  foreignKey,
  unique,
  //   serial,
  //   varchar,
  //   time,
  integer,
  primaryKey,
  jsonb, // ⬅️ added for scrape_requests.payload
  pgEnum, // ⬅️ enum for scrape status
} from "drizzle-orm/pg-core";

/* ==========
   AUTH TABLES
   ========== */

export const users = pgTable(
  "users",
  {
    // DB-generated UUID (no sql import needed)
    id: uuid("id").primaryKey().defaultRandom().notNull(),

    // NextAuth core fields
    name: text("name"),
    email: text("email").notNull(),
    emailVerified: timestamp("email_verified", { mode: "date" }),
    image: text("image"),

    // Your custom fields
    role: text("role").default("pending").notNull(),
    isAuthorized: boolean("is_authorized").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
  },
  (t) => [unique("users_email_unique").on(t.email)]
);

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id").notNull(), // was text -> uuid
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [
    foreignKey({
      columns: [t.userId],
      foreignColumns: [users.id],
    }).onDelete("cascade"),
    primaryKey({ columns: [t.provider, t.providerAccountId] }),
    index("accounts_user_id_idx").on(t.userId),
  ]
);

export const sessions = pgTable(
  "sessions",
  {
    sessionToken: text("session_token").primaryKey().notNull(),
    userId: uuid("user_id").notNull(), // was text -> uuid
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.userId],
      foreignColumns: [users.id],
    }).onDelete("cascade"),
    index("sessions_user_id_idx").on(t.userId),
    index("sessions_expires_idx").on(t.expires),
  ]
);

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [
    primaryKey({
      columns: [t.identifier, t.token],
      name: "verification_tokens_pk",
    }),
  ]
);

/* ==========
  END AUTH TABLES
   ========== */

/* ==========
   APP TABLES
   ========== */

/**
 * Violations — single source of truth for scraped records.
 * - Natural key = notice_number (unique), we also index by neighborhood & date.
 * - pdfUrl/textUrl are stable URLs (local nginx alias or Spaces/S3).
 */
export const violations = pgTable(
  "violations",
  {
    // natural key from city — promote to PRIMARY KEY for clean upserts
    noticeNumber: text("notice_number").primaryKey(),

    address: text("address").notNull(),
    type: text("type").notNull(),
    district: text("district"),
    neighborhood: text("neighborhood").notNull(),
    dateNotice: timestamp("date_notice", { mode: "date" }).notNull(),

    pdfUrl: text("pdf_url"),
    textUrl: text("text_url"),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // With PK on noticeNumber we don't also need a unique constraint.
    index("violations_neighborhood_idx").on(t.neighborhood),
    index("violations_date_neighborhood_idx").on(t.dateNotice, t.neighborhood),
  ]
);

/**
 * Scrape requests — queue table for on-demand scrapes.
 * A worker/process polls for `queued` rows and runs the scraper out of band.
 */
export const scrapeStatus = pgEnum("scrape_status", [
  // queued | running | success | error
  "queued",
  "running",
  "success",
  "error",
]);

export const scrapeRequests = pgTable(
  "scrape_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),

    // NEW: heartbeat used by the reaper (nullable; only set while running)
    heartbeatAt: timestamp("heartbeat_at", {
      withTimezone: true,
      mode: "date",
    }),

    status: scrapeStatus("status").default("queued").notNull(),

    // Arbitrary JSON payload: { neighborhoods?: string[], extract?: boolean, ocr?: boolean, ... }
    payload: jsonb("payload").notNull(),

    ok: boolean("ok"),
    error: text("error"),
  },
  (t) => {
    return {
      ixCreated: index("ix_scrape_requests_created_at").on(t.createdAt),
      ixStatus: index("ix_scrape_requests_status_created").on(
        t.status,
        t.createdAt
      ),
      ixStarted: index("ix_scrape_requests_started_at").on(t.startedAt),
      ixHeartbeat: index("ix_scrape_requests_heartbeat_at").on(t.heartbeatAt),
    };
  }
);
