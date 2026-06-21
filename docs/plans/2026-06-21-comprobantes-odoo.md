# Registración de comprobantes a Odoo — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar una quincena (congelar tarifas + bloquear la carga) y registrar en Odoo una factura de proveedor en borrador por cada obrero, con una línea por obra (cantidad = horas, precio = jornal/8, distribución analítica por obra, sin IVA), guardando el id de cada comprobante.

**Architecture:** El cálculo de líneas es una función pura testeada en `calc.ts`. Las escrituras a Odoo (`account.move`) viven en `lib/odoo/queries.ts`. Dos server actions nuevas orquestan: `cierre.ts` (congela `liquidaciones` + setea estado) y `comprobantes.ts` (arma y crea las facturas, idempotente por obrero). La UI de `/saldos` gana botones Cerrar/Registrar y muestra el estado por obrero; `/carga` queda solo-lectura cuando la quincena está cerrada (garantía dura en `guardarHoras`).

**Tech Stack:** TypeScript · Next.js (App Router/Server Actions) · Drizzle (Supabase Postgres) · Odoo JSON-RPC (`account.move`, `product.product`, `account.analytic.account`) · shadcn/ui · Vitest.

**Diseño de referencia:** [docs/2026-06-21-comprobantes-odoo-design.md](../2026-06-21-comprobantes-odoo-design.md).

---

## Mapa de archivos

```
src/
├─ db/schema.ts                   # MODIFICAR: liquidaciones + odoo_factura_id, + odoo_factura_numero
├─ lib/calc.ts (+ calc.test.ts)   # MODIFICAR: + construirLineasComprobante() (pura, testeada)
├─ lib/odoo/queries.ts            # MODIFICAR: + obtenerProductoManoObra(), crearFacturaProveedor(), leerFacturas()
├─ actions/quincenas.ts           # MODIFICAR: guardarHoras rechaza si cerrada; obtenerHorasGuardadas devuelve estado
├─ actions/cierre.ts              # CREAR: cerrarQuincena() + reabrirQuincena()
├─ actions/comprobantes.ts        # CREAR: registrarComprobantes() + estadoComprobantes()
├─ actions/saldos.ts              # MODIFICAR: construirSaldos devuelve quincena.estado
├─ app/saldos/page.tsx            # MODIFICAR: pasa estado + registros a la tabla
├─ app/saldos/saldos-tabla.tsx    # MODIFICAR: botones Cerrar/Registrar + estado por obrero
└─ app/carga/carga-form.tsx       # MODIFICAR: banner "cerrada" + Guardar deshabilitado
```

**Contratos de tipos (fijados acá, usados en todas las tareas):**

```ts
// calc.ts
export type LineaComprobante = { obraId: number; horas: number; precioUnit: number };

// lib/odoo/queries.ts
export type LineaFactura = { productId: number; nombre: string; cantidad: number; precioUnit: number; obraId: number };

// actions/comprobantes.ts
type ResultadoObrero = {
  obreroId: number; nombre: string;
  estado: "creado" | "ya_registrado" | "sin_tarifa" | "sin_horas" | "error";
  facturaId?: number; mensaje?: string;
};
type Registro = { facturaId: number; numero: string; estadoOdoo: string };
// estadoComprobantes(quincenaId): Promise<Record<number, Registro>>  (clave = obreroId)
```

**Constante de negocio (fijada acá):** `EMPRESA_FACTURACION = 2` (BIMEG B) — empresa donde se crean las facturas. Ver "Bordes" en el diseño: si una quincena es de BIMEG CONSTRUCTORA, sus obras (cuentas analíticas) pueden no pertenecer a BIMEG B; verificar al primer registro real.

**Nota sobre tests (patrón del proyecto):** las server actions y la UI dependen de DB + Odoo, así que **no llevan unit test** (igual que `saldos.ts`, `quincenas.ts`). Toda la lógica pura testeable se extrae a `calc.ts` (Task 2). El resto se verifica con `pnpm build` y un smoke manual final (Task 9), incluyendo crear una factura draft real en Odoo.

---

## Task 1: Columnas de comprobante en `liquidaciones` + migración

**Files:**
- Modify: `src/db/schema.ts:49-55`

- [ ] **Step 1: Agregar las dos columnas a `liquidaciones`**

En `src/db/schema.ts`, reemplazá el bloque `liquidaciones` por:

```ts
// Snapshot escrito AL CERRAR: congela jornal y adelantos para fijar el histórico.
// Al registrar en Odoo se completa odooFacturaId (y odooFacturaNumero al publicarse).
export const liquidaciones = pgTable("liquidaciones", {
  id: serial("id").primaryKey(),
  quincenaId: integer("quincena_id").notNull().references(() => quincenas.id, { onDelete: "cascade" }),
  obreroId: integer("obrero_id").notNull().references(() => obreros.id),
  valorJornal: numeric("valor_jornal", { precision: 12, scale: 2 }).notNull(),
  adelantos: numeric("adelantos", { precision: 12, scale: 2 }).notNull(),
  odooFacturaId: integer("odoo_factura_id"),       // account.move id (siempre, aun en borrador)
  odooFacturaNumero: text("odoo_factura_numero"),  // número fiscal; se llena al publicar en Odoo
}, (t) => ({ obreroUnico: unique().on(t.quincenaId, t.obreroId) }));
```

- [ ] **Step 2: Generar y aplicar la migración**

Run: `pnpm db:generate`
Expected: nuevo archivo en `drizzle/` con `ALTER TABLE "liquidaciones" ADD COLUMN ...` (dos columnas, ambas nullable). Sin DROP de nada.

Run: `pnpm db:push`
Expected: `Changes applied`. (Columnas nullable → migración aditiva, no toca datos existentes.)

- [ ] **Step 3: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat(db): liquidaciones + odoo_factura_id/numero"
```

---

## Task 2: Función pura `construirLineasComprobante` (TDD)

**Files:**
- Modify: `src/lib/calc.ts`
- Test: `src/lib/calc.test.ts`

Agrupa las horas `trabajado` de un obrero por obra y arma una línea por obra. El precio es el mismo en todas (la tarifa/hora congelada del obrero); 4 h en X y 4 h en Y → 2 líneas.

- [ ] **Step 1: Escribir los tests que fallan**

Agregá al final de `src/lib/calc.test.ts`:

```ts
import { construirLineasComprobante } from "./calc";

const f = (tipo: string, odooObraId: number | null, horas: number) => ({ tipo, odooObraId, horas });

test("construirLineasComprobante: una línea por obra (multi-obra mismo día)", () => {
  const lineas = construirLineasComprobante(
    [f("trabajado", 10, 4), f("trabajado", 20, 4)],
    100, // precio/hora
  );
  expect(lineas).toEqual([
    { obraId: 10, horas: 4, precioUnit: 100 },
    { obraId: 20, horas: 4, precioUnit: 100 },
  ]);
});

test("construirLineasComprobante: suma horas de la misma obra en varios bloques", () => {
  const lineas = construirLineasComprobante(
    [f("trabajado", 10, 4), f("trabajado", 10, 4)],
    100,
  );
  expect(lineas).toEqual([{ obraId: 10, horas: 8, precioUnit: 100 }]);
});

test("construirLineasComprobante: ignora ausencias y filas sin obra", () => {
  const lineas = construirLineasComprobante(
    [f("trabajado", 10, 4), f("ausente", null, 0), f("trabajado", null, 3)],
    100,
  );
  expect(lineas).toEqual([{ obraId: 10, horas: 4, precioUnit: 100 }]);
});

test("construirLineasComprobante: sin tarifa (precio 0) → sin líneas", () => {
  expect(construirLineasComprobante([f("trabajado", 10, 4)], 0)).toEqual([]);
});
```

- [ ] **Step 2: Correr para verificar que fallan**

Run: `pnpm test src/lib/calc.test.ts`
Expected: FAIL (`construirLineasComprobante is not a function`).

- [ ] **Step 3: Implementar al final de `src/lib/calc.ts`**

```ts
export type LineaComprobante = { obraId: number; horas: number; precioUnit: number };

/**
 * Líneas de factura de un obrero: una por obra, sumando las horas trabajadas en cada una.
 * `precioHora` es la tarifa/hora congelada del obrero (igual en todas las líneas).
 * Ignora ausencias y filas sin obra. Si la tarifa es 0 → sin líneas (no se factura).
 */
export function construirLineasComprobante(
  filas: { tipo: string; odooObraId: number | null; horas: number }[],
  precioHora: number,
): LineaComprobante[] {
  if (precioHora <= 0) return [];
  const porObra = new Map<number, number>();
  for (const f of filas) {
    if (f.tipo !== "trabajado" || f.odooObraId == null) continue;
    porObra.set(f.odooObraId, (porObra.get(f.odooObraId) ?? 0) + f.horas);
  }
  return [...porObra.entries()]
    .map(([obraId, horas]) => ({ obraId, horas, precioUnit: precioHora }))
    .sort((a, b) => a.obraId - b.obraId);
}
```

- [ ] **Step 4: Correr para verificar que pasan**

Run: `pnpm test src/lib/calc.test.ts`
Expected: PASS (todos, incluidos los 4 nuevos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/calc.ts src/lib/calc.test.ts
git commit -m "feat(calc): construirLineasComprobante (pura, testeada)"
```

---

## Task 3: Escrituras/lecturas a Odoo en `queries.ts`

**Files:**
- Modify: `src/lib/odoo/queries.ts`

`obtenerProductoManoObra` busca el producto por nombre (cacheado como obras/empresas). `crearFacturaProveedor` crea la `account.move` borrador y devuelve su id. `leerFacturas` lee número + estado para mostrar en `/saldos`.

- [ ] **Step 1: Agregar al final de `src/lib/odoo/queries.ts`**

```ts
// Producto "Mano de Obra" (servicio). Cambia poco → cacheado 10 min. null si no existe.
export const obtenerProductoManoObra = unstable_cache(
  async (): Promise<number | null> => {
    const filas = await ejecutar("product.product", "search_read",
      [[["name", "=", "Mano de Obra"]]],
      { fields: ["id"], limit: 1 });
    const f = (filas as any[])[0];
    return f ? f.id : null;
  },
  ["odoo-producto-mano-obra"],
  { revalidate: 600 },
);

export type LineaFactura = { productId: number; nombre: string; cantidad: number; precioUnit: number; obraId: number };

// Crea una factura de proveedor en BORRADOR. Una línea por obra, sin IVA, con distribución analítica.
// Devuelve el id de la account.move creada.
export async function crearFacturaProveedor(args: {
  partnerId: number; companyId: number; fechaFactura: string; referencia: string; lineas: LineaFactura[];
}): Promise<number> {
  const invoice_line_ids = args.lineas.map((l) => [0, 0, {
    product_id: l.productId,
    name: l.nombre,
    quantity: l.cantidad,
    price_unit: l.precioUnit,
    analytic_distribution: { [String(l.obraId)]: 100 },
    tax_ids: [[6, 0, []]], // sin IVA
  }]);
  const id = await ejecutar("account.move", "create", [{
    move_type: "in_invoice",
    partner_id: args.partnerId,
    company_id: args.companyId,
    invoice_date: args.fechaFactura,
    ref: args.referencia,
    invoice_line_ids,
  }]);
  return id as number;
}

// Lee número (name) y estado de facturas por id, para mostrar en /saldos.
export async function leerFacturas(ids: number[]): Promise<{ id: number; name: string; state: string }[]> {
  if (ids.length === 0) return [];
  const filas = await ejecutar("account.move", "read", [ids, ["name", "state"]]);
  return (filas as any[]).map((r) => ({ id: r.id, name: r.name, state: r.state }));
}
```

- [ ] **Step 2: Verificar que compila**

Run: `pnpm build`
Expected: build OK, sin errores de TS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/odoo/queries.ts
git commit -m "feat(odoo): producto Mano de Obra + crear/leer factura de proveedor"
```

---

## Task 4: Cierre de quincena + bloqueo de la carga

**Files:**
- Create: `src/actions/cierre.ts`
- Modify: `src/actions/quincenas.ts`

`cerrarQuincena` congela jornal + adelantos en `liquidaciones` (upsert) y setea `estado = "cerrada"`. `reabrirQuincena` vuelve a borrador solo si no hay facturas. `guardarHoras` pasa a rechazar quincenas cerradas; `obtenerHorasGuardadas` ahora devuelve el estado para que `/carga` lo muestre.

- [ ] **Step 1: Crear `src/actions/cierre.ts`**

```ts
"use server";
import { db } from "@/db";
import { quincenas, horas, obreros, categorias, liquidaciones } from "@/db/schema";
import { obtenerAdelantos } from "@/lib/odoo/queries";
import { jornalEfectivo } from "@/lib/calc";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

// Congela la tarifa efectiva + adelantos de cada obrero con horas y marca la quincena cerrada.
export async function cerrarQuincena(quincenaId: number) {
  const [q] = await db.select().from(quincenas).where(eq(quincenas.id, quincenaId));
  if (!q) throw new Error("Quincena no encontrada");
  if (q.estado === "cerrada") return; // idempotente

  const [filas, obrerosDb, cats] = await Promise.all([
    db.select().from(horas).where(eq(horas.quincenaId, quincenaId)),
    db.select().from(obreros),
    db.select().from(categorias),
  ]);
  const valorCategoria = new Map(cats.map((c) => [c.id, Number(c.valorJornal)]));
  const obreroById = new Map(obrerosDb.map((o) => [o.id, o]));

  const jornalDe = (obreroId: number): number => {
    const o = obreroById.get(obreroId);
    if (!o) return 0;
    const cat = o.categoriaId != null ? valorCategoria.get(o.categoriaId) ?? null : null;
    return jornalEfectivo(o.valorJornal != null ? Number(o.valorJornal) : null, cat);
  };

  const obreroIds = [...new Set(filas.map((f) => f.obreroId))];
  const contactoIds = obreroIds.map((id) => obreroById.get(id)?.odooContactoId).filter((x): x is number => x != null);
  const pagos = await obtenerAdelantos(contactoIds, q.fechaInicio, q.fechaFin);
  const adelantoPorContacto = new Map<number, number>();
  for (const p of pagos) adelantoPorContacto.set(p.contactoId, (adelantoPorContacto.get(p.contactoId) ?? 0) + p.monto);

  for (const obreroId of obreroIds) {
    const o = obreroById.get(obreroId);
    if (!o) continue;
    const valorJornal = jornalDe(obreroId);
    const adelantos = adelantoPorContacto.get(o.odooContactoId) ?? 0;
    await db.insert(liquidaciones)
      .values({ quincenaId, obreroId, valorJornal: String(valorJornal), adelantos: String(adelantos) })
      .onConflictDoUpdate({
        target: [liquidaciones.quincenaId, liquidaciones.obreroId],
        set: { valorJornal: String(valorJornal), adelantos: String(adelantos) },
      });
  }

  await db.update(quincenas).set({ estado: "cerrada", cerradaEn: sql`now()` }).where(eq(quincenas.id, quincenaId));
  revalidatePath("/saldos");
  revalidatePath("/carga");
}

// Reabre solo si no hay comprobantes ya creados (si los hay, anularlos en Odoo primero).
export async function reabrirQuincena(quincenaId: number) {
  const liqs = await db.select().from(liquidaciones).where(eq(liquidaciones.quincenaId, quincenaId));
  if (liqs.some((l) => l.odooFacturaId != null))
    throw new Error("No se puede reabrir: hay comprobantes registrados en Odoo. Anulalos primero.");
  await db.update(quincenas).set({ estado: "borrador", cerradaEn: null }).where(eq(quincenas.id, quincenaId));
  revalidatePath("/saldos");
  revalidatePath("/carga");
}
```

- [ ] **Step 2: Bloquear `guardarHoras` y devolver el estado en `obtenerHorasGuardadas`**

En `src/actions/quincenas.ts`, reemplazá `obtenerHorasGuardadas` por (devuelve `{ estado, filas }`):

```ts
// Trae lo ya guardado de un obrero en esa quincena + el estado (para reabrir/editar y bloquear si está cerrada).
export async function obtenerHorasGuardadas(empresaId: number, anio: number, mes: number, mitad: 1 | 2, obreroId: number) {
  const { inicio, fin } = rangoQuincena(anio, mes, mitad);
  const [q] = await db.select().from(quincenas)
    .where(and(eq(quincenas.odooEmpresaId, empresaId), eq(quincenas.fechaInicio, inicio), eq(quincenas.fechaFin, fin)));
  if (!q) return { estado: null as string | null, filas: [] };
  const filas = await db.select().from(horas).where(and(eq(horas.quincenaId, q.id), eq(horas.obreroId, obreroId)));
  return { estado: q.estado as string | null, filas };
}
```

Y al principio del cuerpo de `guardarHoras`, después de `const datos = GuardarHoras.parse(input);`, agregá la guarda:

```ts
  const [q] = await db.select().from(quincenas).where(eq(quincenas.id, datos.quincenaId));
  if (!q) throw new Error("Quincena no encontrada");
  if (q.estado === "cerrada") throw new Error("Quincena cerrada: no se pueden modificar las horas");
```

(`quincenas`, `and`, `eq` ya están importados en ese archivo.)

- [ ] **Step 3: Verificar que compila**

Run: `pnpm build`
Expected: build OK. (TS marcará si quedó algún uso viejo de `obtenerHorasGuardadas` como array — se arregla en Task 8.)

- [ ] **Step 4: Commit**

```bash
git add src/actions/cierre.ts src/actions/quincenas.ts
git commit -m "feat(cierre): cerrar/reabrir quincena + bloquear guardarHoras"
```

---

## Task 5: Registración de comprobantes — `actions/comprobantes.ts`

**Files:**
- Create: `src/actions/comprobantes.ts`

`registrarComprobantes` crea una factura draft por obrero (idempotente: saltea si ya tiene `odooFacturaId`), devolviendo un resultado por obrero. `estadoComprobantes` lee número + estado desde Odoo para la UI.

- [ ] **Step 1: Crear `src/actions/comprobantes.ts`**

```ts
"use server";
import { db } from "@/db";
import { quincenas, horas, obreros, liquidaciones } from "@/db/schema";
import { obtenerProductoManoObra, crearFacturaProveedor, leerFacturas, obtenerObras } from "@/lib/odoo/queries";
import { valorHora, construirLineasComprobante, etiquetaQuincena } from "@/lib/calc";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export const EMPRESA_FACTURACION = 2; // BIMEG B — ver "Bordes" en el diseño.

type ResultadoObrero = {
  obreroId: number; nombre: string;
  estado: "creado" | "ya_registrado" | "sin_tarifa" | "sin_horas" | "error";
  facturaId?: number; mensaje?: string;
};

export async function registrarComprobantes(quincenaId: number, obreroIds?: number[]): Promise<ResultadoObrero[]> {
  const [q] = await db.select().from(quincenas).where(eq(quincenas.id, quincenaId));
  if (!q) throw new Error("Quincena no encontrada");
  if (q.estado !== "cerrada") throw new Error("La quincena debe estar cerrada para registrar comprobantes");

  const productoId = await obtenerProductoManoObra();
  if (productoId == null) throw new Error('No se encontró el producto "Mano de Obra" en Odoo');

  const [filas, liqs, obrerosDb, obras] = await Promise.all([
    db.select().from(horas).where(eq(horas.quincenaId, quincenaId)),
    db.select().from(liquidaciones).where(eq(liquidaciones.quincenaId, quincenaId)),
    db.select().from(obreros),
    obtenerObras(q.odooEmpresaId),
  ]);

  const obreroById = new Map(obrerosDb.map((o) => [o.id, o]));
  const liqByObrero = new Map(liqs.map((l) => [l.obreroId, l]));
  const nombreObra = new Map(obras.map((o) => [o.id, o.nombre]));
  const etiqueta = etiquetaQuincena(q.fechaInicio);
  const objetivo = obreroIds ?? liqs.map((l) => l.obreroId);

  const resultados: ResultadoObrero[] = [];
  for (const obreroId of objetivo) {
    const o = obreroById.get(obreroId);
    const liq = liqByObrero.get(obreroId);
    if (!o || !liq) { resultados.push({ obreroId, nombre: o?.nombre ?? `#${obreroId}`, estado: "error", mensaje: "Sin liquidación; cerrá la quincena primero" }); continue; }
    if (liq.odooFacturaId != null) { resultados.push({ obreroId, nombre: o.nombre, estado: "ya_registrado", facturaId: liq.odooFacturaId }); continue; }

    const precioHora = valorHora(Number(liq.valorJornal)); // jornal congelado / 8
    if (precioHora <= 0) { resultados.push({ obreroId, nombre: o.nombre, estado: "sin_tarifa" }); continue; }

    const suyas = filas.filter((f) => f.obreroId === obreroId)
      .map((f) => ({ tipo: f.tipo, odooObraId: f.odooObraId, horas: Number(f.horas) }));
    const lineas = construirLineasComprobante(suyas, precioHora);
    if (lineas.length === 0) { resultados.push({ obreroId, nombre: o.nombre, estado: "sin_horas" }); continue; }

    try {
      const facturaId = await crearFacturaProveedor({
        partnerId: o.odooContactoId,
        companyId: EMPRESA_FACTURACION,
        fechaFactura: q.fechaFin,
        referencia: `${etiqueta} · ${o.nombre}`,
        lineas: lineas.map((l) => ({
          productId: productoId,
          nombre: `Mano de obra — ${nombreObra.get(l.obraId) ?? `#${l.obraId}`}`,
          cantidad: l.horas,
          precioUnit: l.precioUnit,
          obraId: l.obraId,
        })),
      });
      await db.update(liquidaciones).set({ odooFacturaId: facturaId })
        .where(and(eq(liquidaciones.quincenaId, quincenaId), eq(liquidaciones.obreroId, obreroId)));
      resultados.push({ obreroId, nombre: o.nombre, estado: "creado", facturaId });
    } catch (e) {
      resultados.push({ obreroId, nombre: o.nombre, estado: "error", mensaje: e instanceof Error ? e.message : String(e) });
    }
  }
  revalidatePath("/saldos");
  return resultados;
}

type Registro = { facturaId: number; numero: string; estadoOdoo: string };

// Estado de las facturas ya registradas (por obrero), leyendo número + estado vivo de Odoo.
export async function estadoComprobantes(quincenaId: number): Promise<Record<number, Registro>> {
  const liqs = await db.select().from(liquidaciones).where(eq(liquidaciones.quincenaId, quincenaId));
  const ids = liqs.map((l) => l.odooFacturaId).filter((x): x is number => x != null);
  const facturas = await leerFacturas(ids);
  const byId = new Map(facturas.map((f) => [f.id, f]));
  const out: Record<number, Registro> = {};
  for (const l of liqs) {
    if (l.odooFacturaId == null) continue;
    const f = byId.get(l.odooFacturaId);
    out[l.obreroId] = { facturaId: l.odooFacturaId, numero: f?.name ?? "/", estadoOdoo: f?.state ?? "?" };
  }
  return out;
}
```

- [ ] **Step 2: Verificar que compila**

Run: `pnpm build`
Expected: build OK, sin errores de TS.

- [ ] **Step 3: Commit**

```bash
git add src/actions/comprobantes.ts
git commit -m "feat(comprobantes): registrar facturas a Odoo + estado por obrero"
```

---

## Task 6: `construirSaldos` devuelve el estado de la quincena

**Files:**
- Modify: `src/actions/saldos.ts:109-114`

- [ ] **Step 1: Incluir `estado` en el objeto `quincena` que devuelve `construirSaldos`**

En `src/actions/saldos.ts`, en el `return` final de `construirSaldos`, cambiá la línea de `quincena:` por:

```ts
    quincena: { id: q.id, etiqueta: etiquetaQuincena(q.fechaInicio), empresaNombre, estado: q.estado, fechaInicio: q.fechaInicio, fechaFin: q.fechaFin },
```

- [ ] **Step 2: Verificar que compila**

Run: `pnpm build`
Expected: build OK.

- [ ] **Step 3: Commit**

```bash
git add src/actions/saldos.ts
git commit -m "feat(saldos): exponer estado de la quincena"
```

---

## Task 7: UI de `/saldos` — Cerrar, Registrar y estado por obrero

**Files:**
- Modify: `src/app/saldos/page.tsx`
- Modify: `src/app/saldos/saldos-tabla.tsx`

La page trae el estado del registro en paralelo y lo pasa a la tabla. La tabla gana: badge de estado, botón Cerrar (borrador) / Registrar todo + Reabrir (cerrada), y por fila un botón Registrar o el número de comprobante.

- [ ] **Step 1: Page — traer registros y pasar estado + registros**

En `src/app/saldos/page.tsx`, agregá el import y reemplazá la obtención de `data` + el render del componente:

```tsx
import { estadoComprobantes } from "@/actions/comprobantes";
```

```tsx
  const [data, registros] = await Promise.all([
    construirSaldos(elegida),
    estadoComprobantes(elegida),
  ]);
  if (!data) return <main className="mx-auto max-w-5xl p-4 sm:p-6">Quincena no encontrada.</main>;

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <h1 className="text-xl font-semibold tracking-tight">Saldos · {data.quincena.etiqueta}</h1>
      <SaldosTabla
        quincenas={lista}
        quincenaId={elegida}
        empresaNombre={data.quincena.empresaNombre}
        estado={data.quincena.estado}
        saldos={data.saldos}
        costos={data.costos}
        totales={data.totales}
        registros={registros}
      />
    </main>
  );
```

- [ ] **Step 2: Reescribir `src/app/saldos/saldos-tabla.tsx`**

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRightIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cerrarQuincena, reabrirQuincena } from "@/actions/cierre";
import { registrarComprobantes } from "@/actions/comprobantes";

const money = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);

type Detalle = { fecha: string; obra: string | null; horas: number; tipo: string; comentario: string | null };
type SaldoRow = {
  obreroId: number; nombre: string; aliasCbu: string | null; dni: string | null;
  dias: number; horas: number; devengado: number; adelantos: number; saldo: number;
  sinTarifa: boolean; detalle: Detalle[];
};
type Costo = { obra: string; costo: number };
type Totales = { devengado: number; adelantos: number; saldo: number; costo: number };
type Quincena = { id: number; etiqueta: string };
type Registro = { facturaId: number; numero: string; estadoOdoo: string };

// Igual que antes + última columna (Odoo) un poco más ancha para el botón/numero.
const GRID = "sm:grid-cols-[1.75rem_minmax(0,1.4fr)_3.5rem_3.5rem_repeat(3,minmax(5rem,1fr))_6.5rem]";

export function SaldosTabla({ quincenas, quincenaId, empresaNombre, estado, saldos, costos, totales, registros }: {
  quincenas: Quincena[]; quincenaId: number; empresaNombre: string; estado: string;
  saldos: SaldoRow[]; costos: Costo[]; totales: Totales; registros: Record<number, Registro>;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState<number | null>(null);
  const [pendiente, startTransition] = useTransition();
  const cerrada = estado === "cerrada";
  const items = Object.fromEntries(quincenas.map((q) => [String(q.id), q.etiqueta]));

  function cerrar() {
    if (!confirm("Cerrar la quincena congela las tarifas y bloquea la carga. ¿Continuar?")) return;
    startTransition(async () => {
      try { await cerrarQuincena(quincenaId); toast.success("Quincena cerrada"); router.refresh(); }
      catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo cerrar"); }
    });
  }
  function reabrir() {
    startTransition(async () => {
      try { await reabrirQuincena(quincenaId); toast.success("Quincena reabierta"); router.refresh(); }
      catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo reabrir"); }
    });
  }
  function registrar(obreroIds?: number[]) {
    startTransition(async () => {
      try {
        const res = await registrarComprobantes(quincenaId, obreroIds);
        const creados = res.filter((r) => r.estado === "creado").length;
        const errores = res.filter((r) => r.estado === "error");
        if (creados) toast.success(`${creados} comprobante${creados === 1 ? "" : "s"} en borrador`);
        if (errores.length) toast.error(`${errores.length} con error: ${errores.map((e) => e.nombre).join(", ")}`);
        if (!creados && !errores.length) toast.info("Sin comprobantes nuevos para crear");
        router.refresh();
      } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo registrar"); }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">{empresaNombre}</p>
          <Badge variant={cerrada ? "default" : "secondary"}>{cerrada ? "Cerrada" : "Borrador"}</Badge>
        </div>
        <Select items={items} value={String(quincenaId)} onValueChange={(v) => { if (v) router.push(`/saldos?q=${v}`); }}>
          <SelectTrigger className="w-full sm:w-80"><SelectValue /></SelectTrigger>
          <SelectContent>
            {quincenas.map((q) => <SelectItem key={q.id} value={String(q.id)}>{q.etiqueta}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {saldos.length > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Total a pagar</p>
            <p className={`text-2xl font-semibold tabular-nums ${totales.saldo < 0 ? "text-destructive" : ""}`}>{money(totales.saldo)}</p>
          </div>
          <div className="flex items-center gap-2">
            {pendiente && <Loader2Icon className="size-4 animate-spin text-muted-foreground" />}
            {cerrada ? (
              <>
                <Button variant="ghost" onClick={reabrir} disabled={pendiente}>Reabrir</Button>
                <Button onClick={() => registrar()} disabled={pendiente} className="w-full sm:w-auto">Registrar todo en Odoo</Button>
              </>
            ) : (
              <Button onClick={cerrar} disabled={pendiente} className="w-full sm:w-auto">Cerrar quincena</Button>
            )}
          </div>
        </div>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Saldo por obrero</h2>

        <div className={`hidden gap-3 px-3 text-xs font-medium text-muted-foreground sm:grid ${GRID}`}>
          <span /><span>Obrero</span>
          <span className="text-center">Días</span><span className="text-center">Horas</span>
          <span className="text-center">Devengado</span><span className="text-center">Adelantos</span><span className="text-center">A pagar</span>
          <span className="text-center">Odoo</span>
        </div>

        {saldos.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">No hay horas cargadas en esta quincena.</p>}

        {saldos.map((s) => {
          const open = abierto === s.obreroId;
          const reg = registros[s.obreroId];
          return (
            <div key={s.obreroId} className="rounded-lg border sm:rounded-none sm:border-0 sm:border-b">
              <div className={`grid grid-cols-1 items-center gap-1.5 p-3 sm:gap-3 ${GRID}`}>
                <button
                  onClick={() => setAbierto(open ? null : s.obreroId)}
                  aria-expanded={open}
                  aria-label={`${open ? "Cerrar" : "Ver"} detalle de ${s.nombre}`}
                  className="flex w-fit cursor-pointer items-center gap-1 rounded-md py-0.5 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronRightIcon className={`size-4 transition-transform ${open ? "rotate-90" : ""}`} />
                  <span className="text-xs sm:hidden">{open ? "Ocultar detalle" : "Ver detalle"}</span>
                </button>
                <span className="font-medium">
                  {s.nombre}
                  {s.sinTarifa && <Badge variant="destructive" className="ml-2 align-middle text-[10px]">sin tarifa</Badge>}
                </span>
                <span className="text-sm tabular-nums sm:text-center"><span className="text-muted-foreground sm:hidden">Días: </span>{s.dias}</span>
                <span className="text-sm tabular-nums sm:text-center"><span className="text-muted-foreground sm:hidden">Horas: </span>{s.horas}</span>
                <span className="text-sm tabular-nums sm:text-center"><span className="text-muted-foreground sm:hidden">Devengado: </span>{money(s.devengado)}</span>
                <span className="text-sm tabular-nums sm:text-center"><span className="text-muted-foreground sm:hidden">Adelantos: </span>{money(s.adelantos)}</span>
                <span className={`text-sm font-semibold tabular-nums sm:text-center ${s.saldo < 0 ? "text-destructive" : ""}`}>
                  <span className="font-normal text-muted-foreground sm:hidden">A pagar: </span>{money(s.saldo)}
                </span>
                <div className="sm:text-center">
                  {reg ? (
                    <Badge variant="secondary" title={`Factura Odoo #${reg.facturaId} (${reg.estadoOdoo})`}>
                      {reg.numero !== "/" ? reg.numero : `#${reg.facturaId}`}
                    </Badge>
                  ) : cerrada && !s.sinTarifa ? (
                    <Button variant="outline" size="sm" onClick={() => registrar([s.obreroId])} disabled={pendiente} className="w-full">Registrar</Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
              </div>

              {open && (
                <div className="border-t bg-muted/30 px-3 py-2 text-sm sm:pl-11">
                  {(s.dni || s.aliasCbu) && (
                    <p className="mb-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                      {s.dni && <span>DNI: <span className="font-mono text-foreground">{s.dni}</span></span>}
                      {s.aliasCbu && <span>Alias/CBU: <span className="font-mono text-foreground">{s.aliasCbu}</span></span>}
                    </p>
                  )}
                  <ul className="space-y-1">
                    {s.detalle.map((d, i) => (
                      <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 tabular-nums">
                        <span className="w-12 text-muted-foreground">{d.fecha.slice(8, 10)}/{d.fecha.slice(5, 7)}</span>
                        {d.tipo === "ausente"
                          ? <span className="italic text-muted-foreground">Ausente{d.comentario ? ` — ${d.comentario}` : ""}</span>
                          : <><span className="min-w-0 flex-1 truncate">{d.obra ?? "—"}</span><span>{d.horas} h</span></>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}

        {saldos.length > 0 && (
          <div className={`grid grid-cols-1 gap-1.5 px-3 pt-2 text-sm font-semibold sm:gap-3 ${GRID}`}>
            <span /><span>Total</span><span className="hidden sm:block" /><span className="hidden sm:block" />
            <span className="tabular-nums sm:text-center"><span className="text-muted-foreground sm:hidden">Devengado: </span>{money(totales.devengado)}</span>
            <span className="tabular-nums sm:text-center"><span className="text-muted-foreground sm:hidden">Adelantos: </span>{money(totales.adelantos)}</span>
            <span className="tabular-nums sm:text-center"><span className="text-muted-foreground sm:hidden">A pagar: </span>{money(totales.saldo)}</span>
            <span className="hidden sm:block" />
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Costo de mano de obra por obra</h2>
        {costos.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">Sin horas trabajadas cargadas en esta quincena.</p>
        ) : (
          <div>
            {costos.map((c) => (
              <div key={c.obra} className="flex items-center justify-between border-b px-3 py-2 text-sm">
                <span className="min-w-0 truncate pr-3">{c.obra}</span>
                <span className="font-medium tabular-nums">{money(c.costo)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between px-3 py-2 text-sm font-semibold">
              <span>Total</span><span className="tabular-nums">{money(totales.costo)}</span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Verificar que compila y la ruta resuelve**

Run: `pnpm build`
Expected: build OK, `/saldos` = `ƒ` dynamic.

- [ ] **Step 4: Commit**

```bash
git add src/app/saldos/page.tsx src/app/saldos/saldos-tabla.tsx
git commit -m "feat(saldos): UI cerrar/registrar + estado de comprobante por obrero"
```

---

## Task 8: `/carga` solo-lectura cuando la quincena está cerrada

**Files:**
- Modify: `src/app/carga/carga-form.tsx`

El server ya rechaza (Task 4). Acá el form lee el estado y muestra banner + deshabilita Guardar, y el `catch` de guardar muestra el mensaje real.

- [ ] **Step 1: Estado `cerrada` + tipo de fila guardada**

En `src/app/carga/carga-form.tsx`, cambiá la línea del tipo `HoraGuardada` (la nueva forma de `obtenerHorasGuardadas` es `{ estado, filas }`):

```tsx
type HoraGuardada = Awaited<ReturnType<typeof obtenerHorasGuardadas>>["filas"][number];
```

Agregá el estado junto a los otros `useState` (cerca de `const [guardando, setGuardando] = useState(false);`):

```tsx
  const [cerrada, setCerrada] = useState(false);
```

- [ ] **Step 2: Setear `cerrada` al cargar la quincena**

Reemplazá el `useEffect` de carga por:

```tsx
  // Reabrir la quincena de este obrero: trae lo guardado + el estado; el resto queda Ausente por defecto.
  useEffect(() => {
    let cancel = false;
    setCargando(true);
    const { inicio, fin } = rangoQuincena(anio, mes, mitad);
    obtenerHorasGuardadas(empresaId, anio, mes, mitad, obreroId)
      .then((r) => { if (!cancel) { cargarDias(construirDias(inicio, fin, r.filas)); setCerrada(r.estado === "cerrada"); } })
      .catch(() => { if (!cancel) { cargarDias(construirDias(inicio, fin, [])); setCerrada(false); } })
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [empresaId, obreroId, anio, mes, mitad, cargarDias]);
```

- [ ] **Step 3: Mensaje de error real al guardar**

En `onGuardar`, cambiá el `catch`:

```tsx
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar. Reintentá.");
    } finally {
```

- [ ] **Step 4: Banner + Guardar deshabilitado**

Después del `<p className="px-1 text-sm text-muted-foreground">…</p>` (el texto "Cargando {obrero}…"), agregá:

```tsx
      {cerrada && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Quincena cerrada — solo lectura. Reabrila desde <a className="underline" href="/saldos">Saldos</a> para editar.
        </p>
      )}
```

Y en el botón Guardar, agregá `cerrada` a `disabled`:

```tsx
          <Button onClick={onGuardar} disabled={guardando || cargando || !obreroId || cerrada}>
```

- [ ] **Step 5: Verificar que compila**

Run: `pnpm build`
Expected: build OK, sin errores de TS.

- [ ] **Step 6: Commit**

```bash
git add src/app/carga/carga-form.tsx
git commit -m "feat(carga): solo-lectura cuando la quincena está cerrada"
```

---

## Task 9: Build final + smoke E2E manual

**Files:** ninguno (verificación).

- [ ] **Step 1: Build + tests**

Run: `pnpm build`
Expected: build OK, `/saldos` y `/carga` = `ƒ` dynamic, sin errores de TS/lint.

Run: `pnpm test`
Expected: PASS (incluye los 4 tests de `construirLineasComprobante`).

- [ ] **Step 2: Smoke manual (🧑 con datos reales)**

Prerrequisito en Odoo: que exista el producto **"Mano de Obra"** y un diario de compras por defecto en **BIMEG B**.

```bash
pnpm dev   # http://localhost:3000
```

Probar con una quincena de **BIMEG B** (empresa de facturación) para evitar el borde cross-company:
- En `/saldos`, badge muestra **Borrador**. Tocar **Cerrar quincena** → confirma, badge pasa a **Cerrada**, los botones cambian a Registrar/Reabrir.
- Ir a `/carga`, misma quincena/obrero → banner "Quincena cerrada — solo lectura", Guardar deshabilitado. (Si se fuerza un guardado, el server lo rechaza.)
- Volver a `/saldos` → **Registrar todo en Odoo**. Toast "N comprobantes en borrador".
- En Odoo: hay una **factura de proveedor en borrador** por obrero, con **una línea por obra**, cantidad = horas, precio = jornal/8, distribución analítica a la obra, **sin impuestos**, en **BIMEG B**.
- Total de la factura = devengado del obrero en `/saldos`.
- La fila del obrero muestra el número/id en la columna **Odoo**.
- Tocar **Registrar** de nuevo → no duplica (toast "Sin comprobantes nuevos"; estado `ya_registrado`).
- Obrero **sin tarifa** → no se factura (sin botón Registrar; no aparece en errores).
- **Reabrir** con facturas creadas → error "hay comprobantes registrados…". Anular en Odoo y reintentar reabrir → vuelve a Borrador.
- Publicar una factura en Odoo y refrescar `/saldos` → la columna Odoo muestra el **número fiscal**.

---

## Self-Review (cobertura vs diseño)

- ✅ Cierre: snapshot a `liquidaciones` + `estado=cerrada` → Task 1 (columnas), Task 4 (`cerrarQuincena`).
- ✅ Bloqueo de edición al cerrar → Task 4 (`guardarHoras` rechaza) + Task 8 (UI banner/disabled).
- ✅ Reapertura abierta, bloqueada si hay facturas → Task 4 (`reabrirQuincena`).
- ✅ Factura de proveedor, borrador, sin IVA, en BIMEG B → Task 3 (`crearFacturaProveedor`) + Task 5 (`EMPRESA_FACTURACION`).
- ✅ Una línea por obra, cantidad=horas, precio=jornal/8 (congelado) → Task 2 (`construirLineasComprobante`) + Task 5.
- ✅ Distribución analítica por obra → Task 3 (`analytic_distribution`).
- ✅ Bruto (sin restar adelantos) → Task 5 (líneas desde horas, sin tocar adelantos).
- ✅ Producto "Mano de Obra" por nombre → Task 3 (`obtenerProductoManoObra`).
- ✅ Identificar el comprobante por obrero → Task 1 (`odooFacturaId/Numero`) + Task 5 (`estadoComprobantes`) + Task 7 (columna Odoo).
- ✅ Idempotencia + falla parcial por obrero → Task 5.
- ✅ Solo si la quincena está cerrada → Task 5 (guarda) + Task 7 (botón solo cuando `cerrada`).
- ⏸️ Fuera de alcance (confirmado): rol Administrador real (better-auth), publicar automático, conciliación de adelantos.

## Bordes documentados (verificar en smoke)

- **Empresa factura vs quincena:** `EMPRESA_FACTURACION = 2`. Una quincena de BIMEG CONSTRUCTORA puede tener obras de company 1; Odoo puede rechazar la distribución analítica cross-company. Verificar; ajustar la constante o la lógica si hace falta.
- **Número fiscal en borrador:** Odoo lo asigna al publicar; hasta entonces se muestra `#<id>`. `estadoComprobantes` relee el número en cada carga de `/saldos`.
```
