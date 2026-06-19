# BIMEG Quincenas — Bitácora de desarrollo

> Registro paso a paso del avance. Una entrada por tarea ejecutada, con fecha, qué se hizo, decisiones/desvíos y cómo se verificó.
> Plan de referencia: [docs/plans/2026-06-19-implementation-plan.md](plans/2026-06-19-implementation-plan.md).
> Leyenda: 🤖 hecho por IA · 🧑 pendiente del usuario · ✅ verificado · ⏸️ diferido a propósito.

## Estado por fase

| Fase | Estado |
|---|---|
| 0 · Setup y credenciales | 🤖 setup hecho · 🧑 falta crear cuentas + `.env.local` |
| 1 · Capa de datos (TDD) | pendiente |
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

## Diferido a propósito (⏸️ del plan)
- Autenticación (better-auth + Google + allowlist) → **antes de cualquier deploy** (es dato de sueldos; mientras tanto correr solo en `localhost`).
- Escritura del costo a Odoo (cerrar quincena → factura vs asiento) → definir con el contador.
- Skill de liquidación de Claude (planilla + constancias) → artefacto aparte (Python + MCP).
