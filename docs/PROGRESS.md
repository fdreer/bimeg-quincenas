# BIMEG Quincenas — Bitácora de desarrollo

> Registro paso a paso del avance. Una entrada por tarea ejecutada, con fecha, qué se hizo, decisiones/desvíos y cómo se verificó.
> Plan de referencia: [docs/plans/2026-06-19-implementation-plan.md](plans/2026-06-19-implementation-plan.md).
> Leyenda: 🤖 hecho por IA · 🧑 pendiente del usuario · ✅ verificado · ⏸️ diferido a propósito.

## Estado por fase

| Fase | Estado |
|---|---|
| 0 · Setup y credenciales | 🤖 setup hecho · 🧑 falta crear cuentas + `.env.local` |
| 1 · Capa de datos (TDD) | 🤖 hecho (schema + odoo + calc, 12 tests) · 🧑 falta `db:push` |
| 2 · Categorías (valor hora) | pendiente |
| 3 · Carga de horas | pendiente |
| 4 · Saldos y costos | pendiente |
| 5 · Prueba end-to-end | pendiente |

---

## Fase 0 — Setup y credenciales

### 2026-06-19 · Task 0.2 🤖 Scaffold + dependencias ✅
- `create-next-app@latest .` → Next.js **16.2.9** (App Router, TS, Tailwind **v4**, `src/`, ESLint, alias `@/*`, sin Turbopack).
- Deps runtime (últimas): drizzle-orm 0.45.2, postgres 3.4.9, zod 4.4.3, zustand 5.0.14, date-fns 4.4.0, @tanstack/react-table 8.21.3.
- Deps dev (últimas): drizzle-kit 0.31.10, vitest 4.1.9.
- shadcn/ui: `init` + componentes `button input table select card label` (6/6).
- **Desvío 1:** pnpm 11 bloquea build scripts por defecto. Habilitados `sharp`, `unrs-resolver`, `esbuild` vía `allowBuilds:` en `pnpm-workspace.yaml` (formato que usa pnpm 11; la lista vieja `onlyBuiltDependencies` no la toma esta versión).
- Verificación: `pnpm install` corre los postinstall sin errores.

### 2026-06-19 · Task 0.3 🤖 `.env.example` ✅ / 🧑 `.env.local` pendiente
- Creado `.env.example` con las 6 variables (Supabase `DATABASE_URL`/`DIRECT_URL` + Odoo `URL/DB/USERNAME/API_KEY`).
- **Desvío 2:** create-next-app ignora `.env*` entero → agregada excepción `!.env.example` en `.gitignore` para versionar el template (el `.env.local` real sigue ignorado).
- 🧑 **Pendiente del usuario:** `cp .env.example .env.local` y completar con valores reales (depende de Task 0.1).

### 2026-06-19 · Task 0.4 🤖 Vitest ✅
- `vitest.config.ts` (environment node), `src/lib/smoke.test.ts`, script `"test": "vitest run"` en `package.json`.
- Verificación: `pnpm test` → **PASS (1 test)**.

### 2026-06-19 · Commit del setup ✅
- Repo git inicializado (branch `master`). Commit `d79b758` con todo el setup (31 archivos versionados, `node_modules` ignorado).
- **Nota:** el plan preveía 2 commits (Tasks 0.2 y 0.4); en repo nuevo sin HEAD no se pudo `git restore --staged`, quedó **1 commit** con todo. Resultado equivalente, no se rehace.

### 🧑 Pendiente del usuario antes de Fase 1
- **Task 0.1:** crear proyecto en Supabase (anotar pass de DB + connection strings pooler 6543 y directo 5432) y generar API key en Odoo (URL, DB, usuario, key).
- **Task 0.3:** completar `.env.local`.

---

## Fase 1 — Capa de datos

### 2026-06-19 · Decisiones de diseño (verificación de tablas antes de codear)
Brainstorming para no migrar a futuro. Decisiones:
1. **Tarifa histórica → congelar al cerrar.** En borrador se usa la tarifa viva; al cerrar la quincena se guarda la tarifa efectiva + adelantos en `liquidaciones` y no cambian más.
2. **Tipos de hora → solo total.** Una columna `horas`, un valor. Sin extras 50/100.
3. **Alcance tarifa → categoría + override por obrero.** `categorias` fija el valor base; `tarifas_obrero` lo pisa para obreros puntuales.
4. **Tarifa por empresa → misma en ambas.** Tablas de tarifa globales, sin columna de empresa.
5. **Conceptos del saldo → solo horas − adelantos.** Sin tabla de ajustes manuales.
6. **Idioma del código → español** (tablas, columnas, tipos, funciones, rutas). Los literales de APIs externas (modelos/campos de Odoo, librerías) quedan como los define el vendor.

**Cambios vs el esquema original del plan:** +2 tablas (`tarifas_obrero`, `liquidaciones`), +`cerrada_en` en quincenas, e identificadores en español (antes: `categories`/`hour_entries`/`hourlyRate`…).

### 2026-06-19 · Task 1.1/1.3/1.4/1.5 🤖 Implementación (TDD) ✅
- `src/db/schema.ts` — 5 tablas: `categorias`, `tarifas_obrero`, `quincenas`, `horas`, `liquidaciones`.
- `src/db/index.ts` — cliente Drizzle (pooler, `prepare:false`). `drizzle.config.ts` (usa `DIRECT_URL`). Scripts `db:generate` / `db:push`.
- `src/lib/odoo/client.ts` — JSON-RPC (`obtenerUid`, `ejecutar`).
- `src/lib/odoo/queries.ts` — `obtenerEmpresas/Obras/Puestos/Obreros/Adelantos` + `normalizarObrero` (tuplas `[id,nombre]` de Odoo).
- `src/lib/calc.ts` — `rangoQuincena`, `tarifaEfectiva` (override→categoría→0), `devengadoPorObrero`, `costoPorObra`, `saldo`.
- Verificación: **`pnpm test` → 12 PASS** (calc + normalización + override) · `tsc --noEmit` OK · `db:generate` → SQL de las 5 tablas sin errores (`drizzle/0000_*.sql`).

### 🧑 Pendiente del usuario (Task 1.2)
- Con `.env.local` completo: `pnpm db:push` y verificar las 5 tablas en Supabase → *Table editor*.

---

## Diferido a propósito (⏸️ del plan)
- Autenticación (better-auth + Google + allowlist) → **antes de cualquier deploy** (es dato de sueldos; mientras tanto correr solo en `localhost`).
- Escritura del costo a Odoo (cerrar quincena → factura vs asiento) → definir con el contador.
- Skill de liquidación de Claude (planilla + constancias) → artefacto aparte (Python + MCP).
