// src/db/config/configureClient.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { Sql } from "postgres";
import * as schema from "@db/migrations/schema";

const DB_URL = process.env.DB_URL!;
if (!DB_URL) throw new Error("DB_URL is not set");

// Prevent connection storms during Next dev hot reload
declare global {
  // eslint-disable-next-line no-var
  var __pg__: { query: Sql<any>; migrate: Sql<any> } | undefined;
}

// Separate tiny pool for migrations; normal pool for app queries
const create = () => ({
  migrate: postgres(DB_URL, { max: 1 }),
  query: postgres(DB_URL),
});

const clients = global.__pg__ ?? create();
if (process.env.NODE_ENV !== "production") global.__pg__ = clients;

// For CLI/programmatic migrations
export const migrationConnection = clients.migrate;
export const migrationClient = drizzle(migrationConnection);

// For runtime queries
export const db = drizzle(clients.query, { schema });
