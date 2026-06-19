# BIMEG Quincenas — Bitácora de desarrollo

> Registro paso a paso del avance. Una entrada por tarea ejecutada, con fecha, qué se hizo, decisiones/desvíos y cómo se verificó.
> Plan de referencia: [docs/plans/2026-06-19-implementation-plan.md](plans/2026-06-19-implementation-plan.md).
> Leyenda: 🤖 hecho por IA · 🧑 pendiente del usuario · ✅ verificado · ⏸️ diferido a propósito.

## Estado por fase

| Fase | Estado |
|---|---|
| 0 · Setup y credenciales | 🤖 setup hecho · 🧑 falta crear cuentas + `.env.local` |
| 1 · Capa de datos (TDD) | ✅ rediseñado (obreros desde Contactos · jornal) · 5 tablas en Supabase |
| 2 · Categorías + Obreros | ✅ ABM categorías + pantalla obreros (botón "Actualizar contactos") |
| 3 · Carga de horas | ✅ store + acciones + pantalla (write-path verificado) |
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

### 2026-06-19 · Task 1.2 ✅ Tablas creadas en Supabase
- `.env.local` completado (Supabase + Odoo `bimeg.odoo.com`/db `bimeg`).
- **Fix:** drizzle-kit no leía `.env.local` → se agregó `dotenv` en `drizzle.config.ts` (commit `631c3be`).
- **Conexión:** `DATABASE_URL` = Transaction pooler (6543); `DIRECT_URL` = Session pooler (5432, mismo host/usuario, IPv4). Se evitó la Direct connection `db.<ref>.supabase.co` por ser solo IPv6.
- `pnpm db:push` → **Changes applied**. Verificado: 5 tablas en `public` (categorias, tarifas_obrero, quincenas, horas, liquidaciones).

---

## Fase 2 — Categorías (valor hora)

### 2026-06-19 · Verificación de Odoo en vivo (antes de construir)
Probé credenciales + queries contra `bimeg.odoo.com` (Odoo 19, JSON-RPC OK, uid 2). Hallazgos:
- **Empresas (2):** `1 = BIMEG CONSTRUCTORA S.R.L.`, `2 = BIMEG B`.
- **Puestos (hr.job): solo 4**, 3 son demo de Odoo (CEO, Consultant, Experienced Developer) + `Obrero Capataz`. 🧑 **Faltan los reales** (HERRERO, OFICIAL, etc.).
- **Obreros sin puesto:** los 5 de BIMEG B tienen `job_id: false`. 🧑 Con tarifa por categoría darían 0 hasta asignarles el puesto en Odoo (o cargar override por obrero).
- **OK:** `work_contact_id` cargado (adelantos cruzarán bien) y 8 obras como cuentas analíticas con nombres reales.

### 2026-06-19 · Task 2.1 🤖 Pantalla de categorías ✅
- `src/actions/categorias.ts` — `listarCategorias` (puestos de Odoo + valor guardado) y `guardarValorCategoria` (upsert con Zod).
- `src/app/categorias/page.tsx` — tabla con un form por fila para fijar el valor hora.
- Verificación: `pnpm build` OK (compila, TS pasa, lint sin errores; `/categorias` = ƒ dynamic). Integraciones Odoo/DB ya verificadas aparte.

### 🧑 Pendiente del usuario en Odoo (para que los números cierren)
- Crear los **puestos reales** (HERRERO, OFICIAL, CAPATAZ…) en *Empleados → Configuración → Puestos*.
- **Asignar el puesto** a cada obrero (o, en su defecto, usaremos el override por obrero en una pantalla futura).
- Borrar/ignorar los puestos demo (CEO, Consultant, Experienced Developer).

---

## Rediseño 2026-06-19 — Obreros desde Contactos + modelo de jornal

Cambio de fondo pedido por el usuario (supera el enfoque hr.job/hr.employee de las secciones de arriba).

**Decisiones nuevas:**
- **Obreros = Contactos (res.partner) con etiqueta "Obrero"** (contact tag), no más `hr.employee`. La app los **persiste** y los enriquece.
- **Categorías 100% de la app** (se elimina la dependencia de `hr.job`). El usuario las crea/edita en la app.
- **Valor por JORNAL** (día de 8 hs), no por hora: `devengado = horas × (valor_jornal / 8)`. Constante `HORAS_JORNAL = 8`. >8 hs escala lineal (sin extras, según decisión "solo total de horas").
- **alias/CBU**: un solo campo de texto en el obrero (dato para transferir).
- **Override por obrero**: deja de ser tabla aparte → columna `obreros.valor_jornal` (null = usa la categoría).

**Esquema final (5 tablas):**
- `categorias` (id, nombre, valor_jornal) — sin lazo con Odoo.
- `obreros` (odoo_contacto_id unique, nombre, categoria_id→, valor_jornal override, alias_cbu) — **NUEVA**, reemplaza `tarifas_obrero`.
- `quincenas` (igual). `horas` y `liquidaciones`: `odoo_obrero_id` → `obrero_id` (FK a obreros). `liquidaciones.valor_hora` → `valor_jornal`.

**Queries Odoo:** `obtenerContactosObreros()` (res.partner con etiqueta) reemplaza a `obtenerObreros`/`obtenerPuestos`/`normalizarObrero`. `obtenerAdelantos` igual (el contacto **es** el obrero).

**Pantallas:** `/categorias` reescrita como ABM propio (nombre + valor jornal). `/obreros` **nueva**: botón *Actualizar contactos* (`sincronizarObreros` → upsert preservando lo cargado) + asignar categoría/override/alias.

**Verificación (todo contra datos reales):**
- `pnpm test` → **13 PASS** (incluye jornal, medio jornal, override).
- Migración: tablas viejas dropeadas + `db:push` → 5 tablas nuevas confirmadas.
- Odoo en vivo: la etiqueta **"Obrero" existe** y trae **5 obreros** (GUSTAVO BUCZEK, ISMAEL CARI, JORGE ARMELLA, ROBERTO VAZQUEZ, RODOLFO HERMAN). Filtro `category_id.name = "Obrero"` OK.
- `pnpm build` OK · `/categorias` y `/obreros` = ƒ dynamic (`force-dynamic`).

**🧑 Pendiente del usuario:** en /obreros tocar *Actualizar contactos* (trae los 5), asignarles categoría y alias/CBU. Cargar las categorías reales en /categorias.

---

## Fase 3 — Carga de horas

### 2026-06-19 · Task 3.1/3.2/3.3 🤖 Carga de horas ✅
- `src/store/carga-store.ts` — Zustand, borrador del form (filas: fecha, obra, horas). Solo UI.
- `src/actions/quincenas.ts` — `asegurarQuincena(empresa, año, mes, mitad)` (crea o devuelve) y `guardarHoras` (reemplaza las filas del obrero en la quincena; idempotente para re-carga).
- `src/app/carga/page.tsx` + `carga-form.tsx` — selector de empresa/obrero/quincena + tabla de días (obra de Odoo filtrada por empresa, horas). Botón Guardar.
- `src/app/page.tsx` — home con navegación (Categorías → Obreros → Cargar horas).
- Verificación: `pnpm build` OK (`/carga` ƒ dynamic). **Write-path probado contra la DB real** (insert obrero→categoría→quincena→horas con FKs y numeric) dentro de una transacción **revertida** (sin dejar datos).

### Pendiente (cuando se implemente el cierre, Fase 4+)
- `guardarHoras` debe rechazar si la quincena está `cerrada` (hoy ninguna lo está, se agrega con el cierre).

---

## UI — shadcn en las 3 pantallas + UX de carga rápida

### 2026-06-19 · Componentes shadcn + carga rápida ✅
Pedido: usar shadcn en todas las secciones (estilos mínimos), priorizando carga de datos rápida.
- **Componentes:** se reemplazó HTML crudo por shadcn `Table`, `Select`, `Card`, `Label`, `Input`, `Button` en `/categorias`, `/obreros`, `/carga`.
- **Nota técnica:** el Select es de **Base UI** (`@base-ui/react`), no Radix. Soporta `items` (label), `value`/`onValueChange` (controlado) y `name`/`form` (submit nativo).
- **/categorias** (server): Card con form "nueva categoría" + tabla editable (inputs asociados por atributo `form`).
- **/obreros**: pasó a **componente cliente** (`obreros-tabla.tsx`) con Select controlado → más robusto que Select dentro de form nativo. `guardarObrero` cambió a args tipados.
- **/carga** (cliente): selers de empresa/obrero/quincena en Card + tabla de días. **Mejoras de velocidad:** "+ Día" autocompleta la **fecha siguiente** y repite la **misma obra** de la última fila (el admin solo ajusta excepciones). Jornada default 8 hs.
- Verificación: `pnpm build` OK, TS limpio, 3 rutas ƒ dynamic. (Render visual: a validar en `pnpm dev`.)

---

## Carga: rango horario, multi-obra/día y ausencias

### 2026-06-19 · Modelo de carga ampliado ✅
Pedido del usuario sobre cómo se registra realmente la tarja:
- **Multi-obra por día** (obra X 4 hs + obra Y 4 hs) → ya soportado con varias filas; se agregó botón **"+ Bloque mismo día"**.
- **Rango horario** (8–13, 14–17) → cada fila tiene **desde/hasta**; las **horas se calculan solas** (`horasEntre`, con test). Editable igual si solo se sabe el total.
- **Ausente + motivo** ("Médico") → cada fila tiene **tipo** Trabajó/Ausente; ausente lleva `comentario` y **horas 0** (no paga).
- **Tabla `horas`** (migración NO destructiva, datos preservados): +`tipo` (default `trabajado`), +`desde`, +`hasta`, +`comentario`; `odoo_obra_id` ahora **nullable** (ausencias); se quitó el unique por día (permite turnos partidos / mismo obra dos veces).
- `guardarHoras` acepta los campos nuevos; el form arma filas trabajado/ausente y filtra las incompletas.
- Verificación: `pnpm test` → **16 PASS** (incluye `horasEntre`), `db:push` aplicado sin perder datos, `pnpm build` OK.

### Pendiente para Fase 4 (saldos)
- Al armar el cálculo: incluir solo filas `trabajado` en devengado/costo (las `ausente` aportan 0 y no tienen obra).

### 2026-06-19 · Correcciones de UX en /carga ✅
- **Año y Mes** pasan a **Select** (mes con nombres) alineados en el Card de filtros.
- **Tabla sin scroll horizontal**: contenedor a `max-w-6xl` + `table-fixed`, obra/nota flexibles, horas/tipo/fecha con ancho fijo.
- **Nota** se habilita **solo cuando Tipo = Ausente** (motivo de la falta).
- **Mismo día / misma obra** más intuitivo: se quitó el botón global "+ Bloque"; ahora cada fila tiene un **＋** que inserta otro bloque debajo (mismo día y obra, horario en blanco). `duplicarFila` en el store.

---

## Diferido a propósito (⏸️ del plan)
- Autenticación (better-auth + Google + allowlist) → **antes de cualquier deploy** (es dato de sueldos; mientras tanto correr solo en `localhost`).
- Escritura del costo a Odoo (cerrar quincena → factura vs asiento) → definir con el contador.
- Skill de liquidación de Claude (planilla + constancias) → artefacto aparte (Python + MCP).
