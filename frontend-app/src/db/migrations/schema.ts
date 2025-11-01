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
  (t) => ({
    usersEmailUnique: unique("users_email_unique").on(t.email),
  })
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
  (t) => ({
    fkUser: foreignKey({
      columns: [t.userId],
      foreignColumns: [users.id],
    }).onDelete("cascade"),
    pk: primaryKey({ columns: [t.provider, t.providerAccountId] }),
    byUser: index("accounts_user_id_idx").on(t.userId),
  })
);

export const sessions = pgTable(
  "sessions",
  {
    sessionToken: text("session_token").primaryKey().notNull(),
    userId: uuid("user_id").notNull(), // was text -> uuid
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => ({
    fkUser: foreignKey({
      columns: [t.userId],
      foreignColumns: [users.id],
    }).onDelete("cascade"),
    byUser: index("sessions_user_id_idx").on(t.userId),
    byExpires: index("sessions_expires_idx").on(t.expires),
  })
);

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => ({
    pk: primaryKey({
      columns: [t.identifier, t.token],
      name: "verification_tokens_pk",
    }),
  })
);

/* ==========
  END AUTH TABLES
   ========== */
