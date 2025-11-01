// app/db/config/runMigration.ts
import "dotenv/config";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { migrationClient, migrationConnection } from "./configureClient";

(async () => {
  try {
    console.log("Running migration...");

    // Run migrations on the database, skipping the ones already applied
    await migrate(migrationClient, { migrationsFolder: "src/db/migrations" });

    console.log("Migration successful!");

    // Don't forget to close the connection, otherwise the script will hang
    await migrationConnection.end();
    console.log("Migration connection closed!");
  } catch (error) {
    console.error("Migration failed:", error);
  }
})();
