import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit es un CLI: no lee .env.local como Next. Lo cargamos a mano.
config({ path: ".env.local" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DIRECT_URL! },
});
