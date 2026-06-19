# BIMEG Quincenas — Plan de Implementación (MVP de prueba)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App web interna para que un admin cargue las horas trabajadas por obrero/obra/día de una quincena, leyendo maestros desde Odoo (obras, obreros, adelantos) y calculando saldo por obrero y costo de mano de obra por obra.

**Architecture:** Next.js full-stack (App Router + Server Actions). La app **lee** de Odoo por JSON-RPC server-side (obras=cuentas analíticas, obreros=empleados con puesto, adelantos=pagos a cuenta) y **posee** su propia DB en Supabase (Postgres) para lo que Odoo no modela: tarifa por categoría, horas cargadas y quincenas. El cálculo (devengado/saldo/costo por obra) vive en funciones puras testeadas.

**Tech Stack:** TypeScript · Next.js (App Router/Server Actions) · Supabase Postgres + Drizzle · Zustand · date-fns · TanStack Table · Tailwind + shadcn/ui · Zod · Vitest · cliente Odoo JSON-RPC.

---

## Leyenda de responsabilidades

- **🤖 IA** — lo desarrollo yo (código, tests, archivos).
- **🧑 VOS** — lo hacés vos a mano (crear cuentas, generar credenciales, pegar variables de entorno, correr migraciones, cargar datos de prueba en Odoo). Te doy el paso exacto.

## Qué queda FUERA de este plan (a propósito)
- **Autenticación/autorización (better-auth):** se saltea para probar. ⚠️ **Es dato de sueldos: hay que implementarla ANTES de cualquier deploy público.** Mientras tanto: correr **solo local** (`localhost`).
- **Escritura del costo a Odoo (cerrar quincena → factura/asiento):** diferido hasta que el contador defina **factura de proveedor vs asiento de diario**. Este MVP llega hasta *calcular y mostrar* saldo y costo; no postea a Odoo todavía.
- **Skill de liquidación de Claude (planilla + constancias):** artefacto aparte (Python + MCP), no es esta app.
- Estilos elaborados (por pedido: simples), OCR/foto, PWA offline.

## Supuestos (si alguno es falso, avisá antes de ejecutar)
- Quincenas = **1 al 15** y **16 a fin de mes**.
- Categoría del obrero = **Puesto de trabajo (hr.job)** en Odoo (capataz/oficial/herrero…). La **tarifa por hora** la pone el admin en la app, por categoría.
- Pago = **valor hora × horas**. Saldo = devengado − adelantos.
- Adelanto = **pago saliente (account.payment, payment_type=outbound)** al contacto del obrero, dentro del rango de la quincena. *(A refinar luego a "a cuenta"/no conciliado.)*
- Carga **por día** (una fila por día/obra), espejando la tarja.

---

## Mapa de archivos

```
bimeg-quincenas/
├─ .env.example                     # 🤖 plantilla de variables (VOS la copiás a .env.local)
├─ drizzle.config.ts                # 🤖 config de migraciones
├─ src/
│  ├─ db/
│  │  ├─ schema.ts                  # 🤖 tablas: categories, quincenas, hour_entries
│  │  └─ index.ts                   # 🤖 cliente Drizzle (pooler de Supabase)
│  ├─ lib/
│  │  ├─ odoo/
│  │  │  ├─ client.ts               # 🤖 JSON-RPC: login + execute_kw
│  │  │  └─ queries.ts              # 🤖 getObras/getObreros/getJobs/getAdelantos/getCompanies
│  │  ├─ calc.ts                    # 🤖 funciones puras: rango quincena, devengado, costo por obra, saldo
│  │  └─ calc.test.ts               # 🤖 tests de calc.ts
│  ├─ app/
│  │  ├─ layout.tsx                 # 🤖 layout base
│  │  ├─ page.tsx                   # 🤖 home / navegación
│  │  ├─ categorias/page.tsx        # 🤖 tarifa por categoría
│  │  ├─ carga/page.tsx             # 🤖 carga de horas por obrero
│  │  └─ saldos/page.tsx            # 🤖 saldo por obrero + costo por obra
│  ├─ actions/
│  │  ├─ categorias.ts              # 🤖 server actions categorías
│  │  ├─ quincenas.ts               # 🤖 server actions quincenas + horas
│  │  └─ saldos.ts                  # 🤖 server action: arma saldos/costos
│  └─ store/
│     └─ carga-store.ts             # 🤖 Zustand: borrador del form de carga (solo UI)
└─ docs/plans/2026-06-19-implementation-plan.md
```

---

# FASE 0 — Setup y credenciales

### Task 0.1 🧑 VOS: Prerrequisitos y cuentas

- [ ] **Paso 1:** Instalar Node 20+ y pnpm. Verificá:
```bash
node -v   # >= 20
pnpm -v   # si falta: npm i -g pnpm
```
- [ ] **Paso 2:** Crear proyecto en **Supabase** (https://supabase.com → New project). Anotá la contraseña de la DB.
- [ ] **Paso 3:** En Supabase → *Project Settings → Database → Connection string*:
  - Copiá la **Transaction pooler** (puerto **6543**) → será `DATABASE_URL`.
  - Copiá la **Direct connection** (puerto **5432**) → será `DIRECT_URL`.
- [ ] **Paso 4:** En **Odoo** → ícono de usuario → *Mi perfil → Seguridad de la cuenta → Nueva clave de API*. Generá una y guardala. Anotá también:
  - `ODOO_URL` (ej. `https://bimeg.odoo.com`)
  - `ODOO_DB` (nombre de la base; en Odoo Online suele ser el subdominio)
  - `ODOO_USERNAME` (tu email de login)
  - `ODOO_API_KEY` (la clave recién creada)
- [ ] **Paso 5:** Dejá estos 6 valores a mano para el Task 0.3.

### Task 0.2 🤖 IA: Scaffold del proyecto

**Files:** crea el árbol base dentro de `bimeg-quincenas/`.

- [ ] **Paso 1:** Crear la app Next.js (App Router, TS, Tailwind, `src/`):
```bash
cd bimeg-quincenas
pnpm dlx create-next-app@latest . --ts --tailwind --app --src-dir --eslint --import-alias "@/*" --no-turbopack
```
- [ ] **Paso 2:** Instalar dependencias:
```bash
pnpm add drizzle-orm postgres zod zustand date-fns @tanstack/react-table
pnpm add -D drizzle-kit vitest
```
- [ ] **Paso 3:** Inicializar shadcn/ui y agregar componentes mínimos:
```bash
pnpm dlx shadcn@latest init -d
pnpm dlx shadcn@latest add button input table select card label
```
- [ ] **Paso 4:** Commit.
```bash
git init && git add -A && git commit -m "chore: scaffold Next.js + tailwind + shadcn + deps"
```

### Task 0.3 🧑 VOS: Variables de entorno

**Files:** `.env.example` (🤖 la creo), `.env.local` (🧑 la creás vos pegando valores).

- [ ] **Paso 1 (🤖 IA):** crear `.env.example`:
```env
# Supabase
DATABASE_URL="postgres://...:6543/postgres?pgbouncer=true"   # pooler transaction (runtime)
DIRECT_URL="postgres://...:5432/postgres"                     # directo (migraciones)

# Odoo (JSON-RPC)
ODOO_URL="https://tuempresa.odoo.com"
ODOO_DB="tuempresa"
ODOO_USERNAME="vos@tuempresa.com"
ODOO_API_KEY="xxxxxxxxxxxxxxxx"
```
- [ ] **Paso 2 (🧑 VOS):** copiar y completar con tus valores reales:
```bash
cp .env.example .env.local
# editá .env.local con los 6 valores del Task 0.1
```
- [ ] **Paso 3 (🧑 VOS):** confirmar que `.env.local` está en `.gitignore` (create-next-app ya lo agrega). NO commitear `.env.local`.

### Task 0.4 🤖 IA: Vitest funcionando

**Files:** Create `vitest.config.ts`, `src/lib/smoke.test.ts`

- [ ] **Paso 1: Test trivial que falla**
```ts
// src/lib/smoke.test.ts
import { test, expect } from "vitest";
test("tooling works", () => { expect(1 + 1).toBe(2); });
```
- [ ] **Paso 2: Config**
```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node" } });
```
Agregar script en `package.json`: `"test": "vitest run"`.
- [ ] **Paso 3: Correr**
```bash
pnpm test
```
Expected: PASS (1 test).
- [ ] **Paso 4: Commit**
```bash
git add -A && git commit -m "test: add vitest setup"
```

---

# FASE 1 — Capa de datos (TDD)

### Task 1.1 🤖 IA: Esquema Drizzle

**Files:** Create `src/db/schema.ts`, `src/db/index.ts`, `drizzle.config.ts`

- [ ] **Paso 1: Esquema**
```ts
// src/db/schema.ts
import { pgTable, serial, text, integer, numeric, date, timestamp, unique } from "drizzle-orm/pg-core";

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  odooJobId: integer("odoo_job_id").notNull().unique(), // hr.job id
  name: text("name").notNull(),
  hourlyRate: numeric("hourly_rate", { precision: 12, scale: 2 }).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const quincenas = pgTable("quincenas", {
  id: serial("id").primaryKey(),
  odooCompanyId: integer("odoo_company_id").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  status: text("status").notNull().default("draft"), // draft | closed
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({ uniqPeriod: unique().on(t.odooCompanyId, t.startDate, t.endDate) }));

export const hourEntries = pgTable("hour_entries", {
  id: serial("id").primaryKey(),
  quincenaId: integer("quincena_id").notNull().references(() => quincenas.id, { onDelete: "cascade" }),
  odooEmployeeId: integer("odoo_employee_id").notNull(),
  odooAnalyticId: integer("odoo_analytic_id").notNull(), // obra
  workDate: date("work_date").notNull(),
  hours: numeric("hours", { precision: 5, scale: 2 }).notNull(),
}, (t) => ({ uniqDay: unique().on(t.quincenaId, t.odooEmployeeId, t.workDate, t.odooAnalyticId) }));
```
- [ ] **Paso 2: Cliente Drizzle (pooler)**
```ts
// src/db/index.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// prepare:false es obligatorio con el pooler transaction de Supabase
const client = postgres(process.env.DATABASE_URL!, { prepare: false });
export const db = drizzle(client, { schema });
```
- [ ] **Paso 3: Config de migraciones (usa DIRECT_URL)**
```ts
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DIRECT_URL! },
});
```
Agregar script: `"db:push": "drizzle-kit push"`.
- [ ] **Paso 4: Commit**
```bash
git add -A && git commit -m "feat: drizzle schema (categories, quincenas, hour_entries)"
```

### Task 1.2 🧑 VOS: Crear las tablas en Supabase

- [ ] **Paso 1:** Con `.env.local` ya completo, correr:
```bash
pnpm db:push
```
Expected: drizzle-kit crea 3 tablas en Supabase sin errores.
- [ ] **Paso 2:** Verificar en Supabase → *Table editor* que existan `categories`, `quincenas`, `hour_entries`.

### Task 1.3 🤖 IA: Cliente Odoo JSON-RPC

**Files:** Create `src/lib/odoo/client.ts`

- [ ] **Paso 1: Implementación**
```ts
// src/lib/odoo/client.ts
const URL = process.env.ODOO_URL!;
const DB = process.env.ODOO_DB!;
const USER = process.env.ODOO_USERNAME!;
const KEY = process.env.ODOO_API_KEY!;

let uidCache: number | null = null;

async function jsonRpc(service: string, method: string, args: unknown[]) {
  const res = await fetch(`${URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service, method, args }, id: 1 }),
    cache: "no-store",
  });
  const json = await res.json();
  if (json.error) throw new Error(`Odoo error: ${JSON.stringify(json.error)}`);
  return json.result;
}

export async function getUid(): Promise<number> {
  if (uidCache) return uidCache;
  const uid = await jsonRpc("common", "login", [DB, USER, KEY]);
  if (!uid) throw new Error("Odoo: autenticación fallida (revisá ODOO_DB/USERNAME/API_KEY)");
  uidCache = uid as number;
  return uidCache;
}

export async function execute(
  model: string, method: string, params: unknown[], kwargs: Record<string, unknown> = {},
) {
  const uid = await getUid();
  return jsonRpc("object", "execute_kw", [DB, uid, KEY, model, method, params, kwargs]);
}
```
- [ ] **Paso 2: Commit** (este módulo se prueba indirectamente vía queries; sin test unitario por depender de red).
```bash
git add -A && git commit -m "feat: odoo json-rpc client"
```

### Task 1.4 🤖 IA: Queries a Odoo (con tests de normalización)

**Files:** Create `src/lib/odoo/queries.ts`, `src/lib/odoo/queries.test.ts`

- [ ] **Paso 1: Test que falla — normalización de tuplas Odoo**
Odoo devuelve relaciones como `[id, "nombre"]`. Probamos el normalizador puro:
```ts
// src/lib/odoo/queries.test.ts
import { test, expect } from "vitest";
import { normObrero } from "./queries";

test("normObrero parsea job_id y work_contact_id como tuplas", () => {
  const r = { id: 7, name: "Gustavo Buczek", job_id: [3, "HERRERO"], work_contact_id: [42, "Gustavo Buczek"] };
  expect(normObrero(r)).toEqual({ id: 7, name: "Gustavo Buczek", jobId: 3, jobName: "HERRERO", partnerId: 42 });
});

test("normObrero tolera campos falsos", () => {
  const r = { id: 8, name: "Sin puesto", job_id: false, work_contact_id: false };
  expect(normObrero(r)).toEqual({ id: 8, name: "Sin puesto", jobId: null, jobName: null, partnerId: null });
});
```
- [ ] **Paso 2: Correr → falla**
```bash
pnpm test src/lib/odoo/queries.test.ts
```
Expected: FAIL ("normObrero is not a function").
- [ ] **Paso 3: Implementación**
```ts
// src/lib/odoo/queries.ts
import { execute } from "./client";

export type Company = { id: number; name: string };
export type Obra = { id: number; name: string };
export type Job = { id: number; name: string };
export type Obrero = { id: number; name: string; jobId: number | null; jobName: string | null; partnerId: number | null };
export type Adelanto = { partnerId: number; amount: number; date: string };

type Tuple = [number, string] | false;
const tupId = (t: Tuple) => (t ? t[0] : null);
const tupName = (t: Tuple) => (t ? t[1] : null);

export function normObrero(r: any): Obrero {
  return { id: r.id, name: r.name, jobId: tupId(r.job_id), jobName: tupName(r.job_id), partnerId: tupId(r.work_contact_id) };
}

export async function getCompanies(): Promise<Company[]> {
  const rows = await execute("res.company", "search_read", [[]], { fields: ["id", "name"], order: "name" });
  return (rows as any[]).map((r) => ({ id: r.id, name: r.name }));
}

export async function getObras(companyId: number): Promise<Obra[]> {
  const rows = await execute("account.analytic.account", "search_read",
    [[["company_id", "in", [companyId, false]]]],
    { fields: ["id", "name"], order: "name" });
  return (rows as any[]).map((r) => ({ id: r.id, name: r.name }));
}

export async function getJobs(): Promise<Job[]> {
  const rows = await execute("hr.job", "search_read", [[]], { fields: ["id", "name"], order: "name" });
  return (rows as any[]).map((r) => ({ id: r.id, name: r.name }));
}

export async function getObreros(companyId: number): Promise<Obrero[]> {
  const rows = await execute("hr.employee", "search_read",
    [[["company_id", "=", companyId]]],
    { fields: ["id", "name", "job_id", "work_contact_id"], order: "name" });
  return (rows as any[]).map(normObrero);
}

export async function getAdelantos(partnerIds: number[], start: string, end: string): Promise<Adelanto[]> {
  if (partnerIds.length === 0) return [];
  const rows = await execute("account.payment", "search_read",
    [[["partner_id", "in", partnerIds], ["payment_type", "=", "outbound"], ["date", ">=", start], ["date", "<=", end]]],
    { fields: ["partner_id", "amount", "date"] });
  return (rows as any[]).map((r) => ({ partnerId: r.partner_id[0], amount: r.amount, date: r.date }));
}
```
- [ ] **Paso 4: Correr → pasa**
```bash
pnpm test src/lib/odoo/queries.test.ts
```
Expected: PASS (2 tests).
- [ ] **Paso 5: Commit**
```bash
git add -A && git commit -m "feat: odoo queries + normalization tests"
```

> ⚠️ Nota de verificación (no bloquea el MVP): el cruce **obrero↔contacto** para adelantos usa `work_contact_id`. Si en tu Odoo el pago a cuenta se hace contra otro contacto, hay que ajustar el campo. Se valida en Task 5.1.

### Task 1.5 🤖 IA: Cálculos (funciones puras, TDD)

**Files:** Create `src/lib/calc.ts`, `src/lib/calc.test.ts`

- [ ] **Paso 1: Tests que fallan**
```ts
// src/lib/calc.test.ts
import { test, expect } from "vitest";
import { quincenaRange, devengadoPorObrero, costoPorObra, saldo } from "./calc";

test("quincenaRange 1ra quincena", () => {
  expect(quincenaRange(2026, 6, 1)).toEqual({ start: "2026-06-01", end: "2026-06-15" });
});
test("quincenaRange 2da quincena (junio = 30)", () => {
  expect(quincenaRange(2026, 6, 2)).toEqual({ start: "2026-06-16", end: "2026-06-30" });
});
test("quincenaRange 2da quincena (febrero = 28)", () => {
  expect(quincenaRange(2026, 2, 2)).toEqual({ start: "2026-02-16", end: "2026-02-28" });
});

const entries = [
  { employeeId: 7, analyticId: 100, hours: 8 },  // Tres Cerritos
  { employeeId: 7, analyticId: 200, hours: 8 },  // La Verbena
  { employeeId: 9, analyticId: 100, hours: 4 },
];
const rate = (id: number) => (id === 7 ? 3500 : 3000); // valor hora por obrero (ya resuelto vía categoría)

test("devengadoPorObrero suma horas x valor hora", () => {
  const m = devengadoPorObrero(entries, rate);
  expect(m.get(7)).toBe(56000); // 16h * 3500
  expect(m.get(9)).toBe(12000); // 4h * 3000
});
test("costoPorObra agrupa por analítica", () => {
  const m = costoPorObra(entries, rate);
  expect(m.get(100)).toBe(40000); // 8*3500 + 4*3000
  expect(m.get(200)).toBe(28000); // 8*3500
});
test("saldo = devengado - adelantos", () => {
  expect(saldo(56000, 20000)).toBe(36000);
});
```
- [ ] **Paso 2: Correr → falla**
```bash
pnpm test src/lib/calc.test.ts
```
Expected: FAIL (funciones no definidas).
- [ ] **Paso 3: Implementación**
```ts
// src/lib/calc.ts
import { endOfMonth, format } from "date-fns";

const fmt = (d: Date) => format(d, "yyyy-MM-dd");

export function quincenaRange(year: number, month: number, half: 1 | 2): { start: string; end: string } {
  const first = new Date(year, month - 1, 1);
  if (half === 1) return { start: fmt(new Date(year, month - 1, 1)), end: fmt(new Date(year, month - 1, 15)) };
  return { start: fmt(new Date(year, month - 1, 16)), end: fmt(endOfMonth(first)) };
}

export type CalcEntry = { employeeId: number; analyticId: number; hours: number };

export function devengadoPorObrero(entries: CalcEntry[], rate: (employeeId: number) => number): Map<number, number> {
  const m = new Map<number, number>();
  for (const e of entries) m.set(e.employeeId, (m.get(e.employeeId) ?? 0) + e.hours * rate(e.employeeId));
  return m;
}

export function costoPorObra(entries: CalcEntry[], rate: (employeeId: number) => number): Map<number, number> {
  const m = new Map<number, number>();
  for (const e of entries) m.set(e.analyticId, (m.get(e.analyticId) ?? 0) + e.hours * rate(e.employeeId));
  return m;
}

export function saldo(devengado: number, adelantos: number): number {
  return devengado - adelantos;
}
```
- [ ] **Paso 4: Correr → pasa**
```bash
pnpm test src/lib/calc.test.ts
```
Expected: PASS (6 tests).
- [ ] **Paso 5: Commit**
```bash
git add -A && git commit -m "feat: calc (quincena range, devengado, costo por obra, saldo) + tests"
```

---

# FASE 2 — Configuración de categorías (tarifa por hora)

### Task 2.1 🤖 IA: Pantalla de categorías

Lee los puestos (hr.job) de Odoo y permite fijar/guardar el **valor hora** de cada uno en la DB propia.

**Files:** Create `src/actions/categorias.ts`, `src/app/categorias/page.tsx`

- [ ] **Paso 1: Server actions**
```ts
// src/actions/categorias.ts
"use server";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { getJobs } from "@/lib/odoo/queries";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export async function listCategorias() {
  const jobs = await getJobs();                       // de Odoo
  const saved = await db.select().from(categories);   // tarifas propias
  const rateByJob = new Map(saved.map((c) => [c.odooJobId, Number(c.hourlyRate)]));
  return jobs.map((j) => ({ odooJobId: j.id, name: j.name, hourlyRate: rateByJob.get(j.id) ?? 0 }));
}

const SetRate = z.object({ odooJobId: z.coerce.number().int(), name: z.string().min(1), hourlyRate: z.coerce.number().min(0) });

export async function setCategoriaRate(formData: FormData) {
  const data = SetRate.parse({
    odooJobId: formData.get("odooJobId"),
    name: formData.get("name"),
    hourlyRate: formData.get("hourlyRate"),
  });
  await db.insert(categories)
    .values({ odooJobId: data.odooJobId, name: data.name, hourlyRate: String(data.hourlyRate) })
    .onConflictDoUpdate({ target: categories.odooJobId, set: { hourlyRate: String(data.hourlyRate), name: data.name, updatedAt: sql`now()` } });
  revalidatePath("/categorias");
}
```
- [ ] **Paso 2: Página (server component + form por fila)**
```tsx
// src/app/categorias/page.tsx
import { listCategorias, setCategoriaRate } from "@/actions/categorias";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default async function CategoriasPage() {
  const rows = await listCategorias();
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-4">
      <h1 className="text-xl font-semibold">Categorías · valor hora</h1>
      <table className="w-full text-sm">
        <thead><tr className="text-left border-b"><th className="py-2">Categoría</th><th>Valor hora</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.odooJobId} className="border-b">
              <td className="py-2">{r.name}</td>
              <td colSpan={2}>
                <form action={setCategoriaRate} className="flex gap-2 items-center">
                  <input type="hidden" name="odooJobId" value={r.odooJobId} />
                  <input type="hidden" name="name" value={r.name} />
                  <Input name="hourlyRate" type="number" step="0.01" defaultValue={r.hourlyRate} className="w-32" />
                  <Button type="submit" size="sm">Guardar</Button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="text-muted-foreground">No hay puestos en Odoo. Creá los puestos (HERRERO, OFICIAL, CAPATAZ…) en Empleados → Configuración → Puestos.</p>}
    </main>
  );
}
```
- [ ] **Paso 3: Verificación manual (🧑 VOS)** — ver Task 5.1. Esta tarea no lleva test automático (UI + red).
- [ ] **Paso 4: Commit**
```bash
git add -A && git commit -m "feat: pantalla categorias (valor hora por puesto)"
```

---

# FASE 3 — Carga de horas

### Task 3.1 🤖 IA: Store del borrador (Zustand)

**Files:** Create `src/store/carga-store.ts`

- [ ] **Paso 1: Store (solo estado de UI del form)**
```ts
// src/store/carga-store.ts
import { create } from "zustand";

export type DraftRow = { id: string; workDate: string; analyticId: number | null; hours: number };

type CargaState = {
  rows: DraftRow[];
  addRow: (workDate: string) => void;
  updateRow: (id: string, patch: Partial<DraftRow>) => void;
  removeRow: (id: string) => void;
  reset: () => void;
};

let seq = 0;
export const useCargaStore = create<CargaState>((set) => ({
  rows: [],
  addRow: (workDate) => set((s) => ({ rows: [...s.rows, { id: `r${++seq}`, workDate, analyticId: null, hours: 8 }] })),
  updateRow: (id, patch) => set((s) => ({ rows: s.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
  removeRow: (id) => set((s) => ({ rows: s.rows.filter((r) => r.id !== id) })),
  reset: () => set({ rows: [] }),
}));
```
- [ ] **Paso 2: Commit**
```bash
git add -A && git commit -m "feat: zustand store for carga draft"
```

### Task 3.2 🤖 IA: Server actions de quincena + horas

**Files:** Create `src/actions/quincenas.ts`

- [ ] **Paso 1: Implementación**
```ts
// src/actions/quincenas.ts
"use server";
import { db } from "@/db";
import { quincenas, hourEntries } from "@/db/schema";
import { quincenaRange } from "@/lib/calc";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

export async function ensureQuincena(companyId: number, year: number, month: number, half: 1 | 2) {
  const { start, end } = quincenaRange(year, month, half);
  const existing = await db.select().from(quincenas)
    .where(and(eq(quincenas.odooCompanyId, companyId), eq(quincenas.startDate, start), eq(quincenas.endDate, end)));
  if (existing[0]) return existing[0];
  const [created] = await db.insert(quincenas)
    .values({ odooCompanyId: companyId, startDate: start, endDate: end }).returning();
  return created;
}

const SaveRows = z.object({
  quincenaId: z.number().int(),
  employeeId: z.number().int(),
  rows: z.array(z.object({ workDate: z.string(), analyticId: z.number().int(), hours: z.number().min(0).max(24) })),
});

export async function saveHoras(input: z.infer<typeof SaveRows>) {
  const data = SaveRows.parse(input);
  // Reemplaza las filas de ese obrero en esa quincena (idempotente para re-carga)
  await db.delete(hourEntries).where(and(eq(hourEntries.quincenaId, data.quincenaId), eq(hourEntries.odooEmployeeId, data.employeeId)));
  if (data.rows.length === 0) return { saved: 0 };
  await db.insert(hourEntries).values(data.rows.map((r) => ({
    quincenaId: data.quincenaId, odooEmployeeId: data.employeeId,
    odooAnalyticId: r.analyticId, workDate: r.workDate, hours: String(r.hours),
  })));
  return { saved: data.rows.length };
}
```
- [ ] **Paso 2: Commit**
```bash
git add -A && git commit -m "feat: server actions quincena + saveHoras"
```

### Task 3.3 🤖 IA: Pantalla de carga

**Files:** Create `src/app/carga/page.tsx`, `src/app/carga/carga-form.tsx`

- [ ] **Paso 1: Loader de datos (server component)**
```tsx
// src/app/carga/page.tsx
import { getCompanies, getObreros, getObras } from "@/lib/odoo/queries";
import { CargaForm } from "./carga-form";

export default async function CargaPage() {
  const companies = await getCompanies();
  const companyId = companies[0]?.id ?? 1;            // MVP: primera empresa; selector simple en el form
  const [obreros, obras] = await Promise.all([getObreros(companyId), getObras(companyId)]);
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-xl font-semibold">Carga de horas</h1>
      <CargaForm companyId={companyId} obreros={obreros} obras={obras} />
    </main>
  );
}
```
- [ ] **Paso 2: Form de carga (client component, usa Zustand)**
```tsx
// src/app/carga/carga-form.tsx
"use client";
import { useState } from "react";
import { useCargaStore } from "@/store/carga-store";
import { ensureQuincena, saveHoras } from "@/actions/quincenas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Obra, Obrero } from "@/lib/odoo/queries";

export function CargaForm({ companyId, obreros, obras }: { companyId: number; obreros: Obrero[]; obras: Obra[] }) {
  const now = new Date();
  const [employeeId, setEmployeeId] = useState<number>(obreros[0]?.id ?? 0);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [half, setHalf] = useState<1 | 2>(now.getDate() <= 15 ? 1 : 2);
  const [msg, setMsg] = useState("");
  const { rows, addRow, updateRow, removeRow, reset } = useCargaStore();

  async function onSave() {
    setMsg("Guardando…");
    const q = await ensureQuincena(companyId, year, month, half);
    const clean = rows.filter((r) => r.analyticId && r.hours > 0)
      .map((r) => ({ workDate: r.workDate, analyticId: r.analyticId as number, hours: r.hours }));
    const res = await saveHoras({ quincenaId: q.id, employeeId, rows: clean });
    setMsg(`Guardado: ${res.saved} días.`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-sm">Obrero
          <select className="block border rounded px-2 py-1" value={employeeId} onChange={(e) => setEmployeeId(Number(e.target.value))}>
            {obreros.map((o) => <option key={o.id} value={o.id}>{o.name}{o.jobName ? ` — ${o.jobName}` : " — (sin puesto)"}</option>)}
          </select>
        </label>
        <label className="text-sm">Año <Input type="number" className="w-24" value={year} onChange={(e) => setYear(Number(e.target.value))} /></label>
        <label className="text-sm">Mes <Input type="number" min={1} max={12} className="w-20" value={month} onChange={(e) => setMonth(Number(e.target.value))} /></label>
        <label className="text-sm">Quincena
          <select className="block border rounded px-2 py-1" value={half} onChange={(e) => setHalf(Number(e.target.value) as 1 | 2)}>
            <option value={1}>1ª (1–15)</option><option value={2}>2ª (16–fin)</option>
          </select>
        </label>
      </div>

      <table className="w-full text-sm">
        <thead><tr className="text-left border-b"><th className="py-2">Fecha</th><th>Obra</th><th>Horas</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b">
              <td className="py-1"><Input type="date" value={r.workDate} onChange={(e) => updateRow(r.id, { workDate: e.target.value })} /></td>
              <td>
                <select className="border rounded px-2 py-1" value={r.analyticId ?? ""} onChange={(e) => updateRow(r.id, { analyticId: Number(e.target.value) })}>
                  <option value="">— elegir obra —</option>
                  {obras.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </td>
              <td><Input type="number" step="0.5" className="w-20" value={r.hours} onChange={(e) => updateRow(r.id, { hours: Number(e.target.value) })} /></td>
              <td><Button variant="ghost" size="sm" onClick={() => removeRow(r.id)}>✕</Button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => addRow(new Date().toISOString().slice(0, 10))}>+ Día</Button>
        <Button onClick={onSave} disabled={rows.length === 0}>Guardar quincena</Button>
        <Button variant="ghost" onClick={reset}>Limpiar</Button>
      </div>
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
    </div>
  );
}
```
- [ ] **Paso 3: Commit**
```bash
git add -A && git commit -m "feat: pantalla de carga de horas"
```

---

# FASE 4 — Saldos y costos

### Task 4.1 🤖 IA: Server action que arma saldos y costos

**Files:** Create `src/actions/saldos.ts`

- [ ] **Paso 1: Implementación**
```ts
// src/actions/saldos.ts
"use server";
import { db } from "@/db";
import { quincenas, hourEntries, categories } from "@/db/schema";
import { getObreros, getAdelantos } from "@/lib/odoo/queries";
import { devengadoPorObrero, costoPorObra, saldo, type CalcEntry } from "@/lib/calc";
import { eq } from "drizzle-orm";

export async function buildSaldos(quincenaId: number) {
  const [q] = await db.select().from(quincenas).where(eq(quincenas.id, quincenaId));
  if (!q) throw new Error("Quincena no encontrada");

  const rows = await db.select().from(hourEntries).where(eq(hourEntries.quincenaId, quincenaId));
  const entries: CalcEntry[] = rows.map((r) => ({ employeeId: r.odooEmployeeId, analyticId: r.odooAnalyticId, hours: Number(r.hours) }));

  const obreros = await getObreros(q.odooCompanyId);
  const cats = await db.select().from(categories);
  const rateByJob = new Map(cats.map((c) => [c.odooJobId, Number(c.hourlyRate)]));
  const obreroById = new Map(obreros.map((o) => [o.id, o]));
  const rate = (employeeId: number) => {
    const o = obreroById.get(employeeId);
    return o?.jobId ? (rateByJob.get(o.jobId) ?? 0) : 0;
  };

  const devengado = devengadoPorObrero(entries, rate);
  const costos = costoPorObra(entries, rate);

  // adelantos por obrero (vía contacto)
  const partnerIds = [...devengado.keys()].map((id) => obreroById.get(id)?.partnerId).filter((x): x is number => !!x);
  const pagos = await getAdelantos(partnerIds, q.startDate, q.endDate);
  const adelantoByPartner = new Map<number, number>();
  for (const p of pagos) adelantoByPartner.set(p.partnerId, (adelantoByPartner.get(p.partnerId) ?? 0) + p.amount);

  const saldos = [...devengado.entries()].map(([employeeId, dev]) => {
    const o = obreroById.get(employeeId);
    const adel = o?.partnerId ? (adelantoByPartner.get(o.partnerId) ?? 0) : 0;
    return { employeeId, name: o?.name ?? `#${employeeId}`, devengado: dev, adelantos: adel, saldo: saldo(dev, adel) };
  });

  return { saldos, costos: [...costos.entries()].map(([analyticId, costo]) => ({ analyticId, costo })) };
}
```
- [ ] **Paso 2: Commit**
```bash
git add -A && git commit -m "feat: buildSaldos action"
```

### Task 4.2 🤖 IA: Pantalla de saldos (TanStack Table)

**Files:** Create `src/app/saldos/page.tsx`, `src/app/saldos/saldos-tables.tsx`

- [ ] **Paso 1: Loader (server) — lista quincenas y arma el reporte de la seleccionada**
```tsx
// src/app/saldos/page.tsx
import { db } from "@/db";
import { quincenas } from "@/db/schema";
import { desc } from "drizzle-orm";
import { buildSaldos } from "@/actions/saldos";
import { getObras } from "@/lib/odoo/queries";
import { SaldosTables } from "./saldos-tables";

export default async function SaldosPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const qs = await db.select().from(quincenas).orderBy(desc(quincenas.startDate));
  const current = sp.q ? qs.find((x) => String(x.id) === sp.q) : qs[0];
  if (!current) return <main className="p-6">No hay quincenas cargadas todavía.</main>;
  const { saldos, costos } = await buildSaldos(current.id);
  const obras = await getObras(current.odooCompanyId);
  const obraName = new Map(obras.map((o) => [o.id, o.name]));
  const costosNamed = costos.map((c) => ({ obra: obraName.get(c.analyticId) ?? `#${c.analyticId}`, costo: c.costo }));
  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-xl font-semibold">Saldos · {current.startDate} a {current.endDate}</h1>
      <SaldosTables saldos={saldos} costos={costosNamed} />
    </main>
  );
}
```
- [ ] **Paso 2: Tablas (client, TanStack Table)**
```tsx
// src/app/saldos/saldos-tables.tsx
"use client";
import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from "@tanstack/react-table";

type Saldo = { name: string; devengado: number; adelantos: number; saldo: number };
type Costo = { obra: string; costo: number };
const ars = (n: number) => n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });

function Table<T>({ data, columns }: { data: T[]; columns: any[] }) {
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });
  return (
    <table className="w-full text-sm border-collapse">
      <thead>{table.getHeaderGroups().map((hg) => (
        <tr key={hg.id} className="border-b text-left">
          {hg.headers.map((h) => <th key={h.id} className="py-2">{flexRender(h.column.columnDef.header, h.getContext())}</th>)}
        </tr>))}
      </thead>
      <tbody>{table.getRowModel().rows.map((row) => (
        <tr key={row.id} className="border-b">
          {row.getVisibleCells().map((c) => <td key={c.id} className="py-1">{flexRender(c.column.columnDef.cell, c.getContext())}</td>)}
        </tr>))}
      </tbody>
    </table>
  );
}

const s = createColumnHelper<Saldo>();
const c = createColumnHelper<Costo>();

export function SaldosTables({ saldos, costos }: { saldos: Saldo[]; costos: Costo[] }) {
  const saldoCols = [
    s.accessor("name", { header: "Obrero" }),
    s.accessor("devengado", { header: "Devengado", cell: (i) => ars(i.getValue()) }),
    s.accessor("adelantos", { header: "Adelantos", cell: (i) => ars(i.getValue()) }),
    s.accessor("saldo", { header: "Saldo a pagar", cell: (i) => <b>{ars(i.getValue())}</b> }),
  ];
  const costoCols = [
    c.accessor("obra", { header: "Obra" }),
    c.accessor("costo", { header: "Costo mano de obra", cell: (i) => ars(i.getValue()) }),
  ];
  return (
    <div className="space-y-6">
      <section><h2 className="font-medium mb-2">Saldo por obrero</h2><Table data={saldos} columns={saldoCols} /></section>
      <section><h2 className="font-medium mb-2">Costo por obra</h2><Table data={costos} columns={costoCols} /></section>
    </div>
  );
}
```
- [ ] **Paso 3: Commit**
```bash
git add -A && git commit -m "feat: pantalla de saldos y costos (tanstack-table)"
```

### Task 4.3 🤖 IA: Home / navegación

**Files:** Modify `src/app/page.tsx`

- [ ] **Paso 1: Links simples**
```tsx
// src/app/page.tsx
import Link from "next/link";
export default function Home() {
  return (
    <main className="max-w-md mx-auto p-6 space-y-3">
      <h1 className="text-2xl font-semibold">BIMEG · Quincenas</h1>
      <nav className="flex flex-col gap-2">
        <Link className="underline" href="/categorias">1) Categorías · valor hora</Link>
        <Link className="underline" href="/carga">2) Cargar horas</Link>
        <Link className="underline" href="/saldos">3) Saldos y costos</Link>
      </nav>
    </main>
  );
}
```
- [ ] **Paso 2: Commit**
```bash
git add -A && git commit -m "feat: home navigation"
```

---

# FASE 5 — Prueba end-to-end

### Task 5.1 🧑 VOS: Datos de prueba en Odoo + recorrer el flujo

- [ ] **Paso 1:** En Odoo, confirmar/crear datos mínimos en la **empresa de prueba**:
  - Puestos (Empleados → Configuración → Puestos): `HERRERO`, `OFICIAL`, `CAPATAZ`.
  - 1–2 obreros (Empleados) con **Puesto** asignado y **contacto** en *Información privada* (para adelantos).
  - 2–3 obras como **cuentas analíticas** (las que ya usás para flujo de fondos).
  - 1 **pago a cuenta** saliente a un obrero, con fecha dentro de la quincena de prueba.
- [ ] **Paso 2:** Levantar la app local:
```bash
pnpm dev   # http://localhost:3000
```
- [ ] **Paso 3:** Recorrer: `/categorias` (poner valor hora) → `/carga` (elegir obrero, agregar días con obra+horas, Guardar) → `/saldos` (ver devengado/adelantos/saldo + costo por obra).
- [ ] **Paso 4:** Validar contra una tarja real (ej. Gustavo Buczek): que el saldo y el costo por obra den lo esperado. Si el **adelanto no aparece**, revisar el cruce obrero↔contacto (ver nota en Task 1.4).

---

## Self-Review (cobertura vs diseño)

- ✅ Lee de Odoo: obras, obreros (+puesto), adelantos, empresas → Task 1.4.
- ✅ DB propia: tarifa por categoría, horas, quincenas → Task 1.1.
- ✅ Carga por día (espeja la tarja) → Task 3.3.
- ✅ Cálculo saldo por obrero + costo por obra (testeado) → Task 1.5 / 4.1.
- ✅ Distinción 🤖 IA / 🧑 VOS (env, Supabase, Odoo, datos de prueba) → Fase 0 y Task 1.2, 5.1.
- ✅ Estilos simples respetando UX (flujo 1→2→3, navegación, mensajes de guardado).
- ⏸️ Diferido explícito: auth (better-auth), escritura del costo a Odoo (factura vs asiento), skill de liquidación.

## Pendientes a resolver en paralelo (no bloquean el MVP)
1. **Contador:** factura de proveedor vs asiento de diario para postear el costo a Odoo (próximo plan).
2. **Verificar por MCP:** que las obras sean analíticas, módulos instalados, y el campo correcto para el cruce obrero↔contacto del pago a cuenta.
3. **Antes de deploy:** implementar better-auth (Google + allowlist). No publicar sin auth.
