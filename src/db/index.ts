import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "./schema";

const DATA_DIR = process.env.PGLITE_DATA_DIR ?? "./.pgdata";

const globalForDb = globalThis as unknown as {
  pglite?: PGlite;
};

export const client =
  globalForDb.pglite ?? new PGlite(DATA_DIR);

if (process.env.NODE_ENV !== "production") {
  globalForDb.pglite = client;
}

export const db = drizzle(client, { schema });

export { schema };
