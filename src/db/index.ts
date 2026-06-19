import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// prepare:false es obligatorio con el pooler transaction (puerto 6543) de Supabase.
const cliente = postgres(process.env.DATABASE_URL!, { prepare: false });
export const db = drizzle(cliente, { schema });
