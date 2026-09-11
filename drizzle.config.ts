import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  driver: "pglite",
  dbCredentials: {
    url: process.env.PGLITE_DATA_DIR ?? "./.pgdata",
  },
});
