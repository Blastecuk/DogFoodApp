import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

const DATA_DIR = process.env.PGLITE_DATA_DIR ?? "./.pgdata";

async function main() {
  const client = new PGlite(DATA_DIR);
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await client.close();
  console.log(`Migrations applied to PGlite database at ${DATA_DIR}`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
