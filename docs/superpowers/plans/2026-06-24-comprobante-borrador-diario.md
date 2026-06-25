# Comprobante borrador diario en Odoo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un cron diario cree/actualice en Odoo un comprobante de proveedor **en borrador** por obrero, reflejando las horas cargadas hasta el momento, en vez de crearlo recién al cerrar la quincena.

**Architecture:** Se extrae el núcleo de armado/registro de comprobantes a un módulo plano `src/lib/comprobantes-core.ts` (sin `"use server"`, sin auth) que crea, actualiza o desvincula el borrador de cada obrero según su estado en Odoo. Una ruta de cron protegida por `CRON_SECRET` lo dispara a diario sobre todas las quincenas en borrador con horas. El `odooFacturaId` se guarda en la tabla `liquidaciones` que ya existe (fila escrita temprano por el cron y congelada al cerrar). El cierre y un botón "Sincronizar ahora" reusan el mismo núcleo.

**Tech Stack:** Next.js 16 (App Router, server actions, route handlers), Drizzle ORM (Postgres), Odoo JSON-RPC, Vitest, Vercel Cron.

**Spec:** `docs/superpowers/specs/2026-06-24-comprobante-borrador-diario-design.md`

---

## Setup (antes de empezar)

Estamos en `master` (trunk). Crear una rama de trabajo:

```bash
git checkout -b feat/comprobante-borrador-diario
```

## File Structure

- `src/lib/calc.ts` — **modificar**: agregar la función pura `decidirAccionSync` (decisión crear/actualizar/saltar/desvincular). Sin I/O.
- `src/lib/calc.test.ts` — **modificar**: tests de `decidirAccionSync`.
- `src/lib/odoo/queries.ts` — **modificar**: `actualizarFacturaBorrador` (reescribe líneas de un borrador) y `eliminarFactura` (unlink).
- `src/lib/comprobantes-core.ts` — **crear**: núcleo de sincronización (`sincronizarQuincena`, `sincronizarBorradores`, narración). Server-side, sin `"use server"`, sin auth.
- `src/actions/comprobantes.ts` — **modificar**: `registrarComprobantes` se reemplaza por `sincronizarAhora` (wrapper con `requireAdmin` que delega al core). Se conserva `estadoComprobantes`.
- `src/actions/cierre.ts` — **modificar**: tras congelar, una sync final; guard de `reabrirQuincena` pasa a chequear estado `posted` en Odoo.
- `src/app/api/cron/sincronizar-borradores/route.ts` — **crear**: ruta GET protegida por `CRON_SECRET`.
- `vercel.json` — **crear**: schedule del cron diario.
- `.env.example` — **modificar**: agregar `CRON_SECRET`.
- `src/app/saldos/saldos-tabla.tsx` — **modificar**: relabel del botón a "Sincronizar ahora" y disponible también en borrador.
- `src/db/schema.ts` — **modificar**: comentario de `liquidaciones` (cambia la semántica de "snapshot al cerrar").

---

### Task 1: Función pura `decidirAccionSync` (TDD)

**Files:**
- Modify: `src/lib/calc.ts` (agregar al final)
- Test: `src/lib/calc.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `src/lib/calc.test.ts`. Primero sumar `decidirAccionSync` al import existente de `./calc` (línea 2):

```ts
// en el import de la línea 2, agregar decidirAccionSync a la lista:
// ... fechasARellenar, decidirAccionSync } from "./calc";
```

Y los tests:

```ts
// decidirAccionSync: precondición → el caller ya limpió huérfanos (id que no existe en Odoo = null).
test("decidirAccionSync: sin tarifa → saltar", () => {
  expect(decidirAccionSync({ tieneTarifa: false, tieneLineas: true, idFactura: null, estadoOdoo: null })).toBe("saltar");
});
test("decidirAccionSync: sin factura + con líneas → crear", () => {
  expect(decidirAccionSync({ tieneTarifa: true, tieneLineas: true, idFactura: null, estadoOdoo: null })).toBe("crear");
});
test("decidirAccionSync: sin factura + sin líneas → saltar", () => {
  expect(decidirAccionSync({ tieneTarifa: true, tieneLineas: false, idFactura: null, estadoOdoo: null })).toBe("saltar");
});
test("decidirAccionSync: borrador en Odoo + con líneas → actualizar", () => {
  expect(decidirAccionSync({ tieneTarifa: true, tieneLineas: true, idFactura: 55, estadoOdoo: "draft" })).toBe("actualizar");
});
test("decidirAccionSync: borrador en Odoo + sin líneas → desvincular", () => {
  expect(decidirAccionSync({ tieneTarifa: true, tieneLineas: false, idFactura: 55, estadoOdoo: "draft" })).toBe("desvincular");
});
test("decidirAccionSync: factura posteada → saltar (no se puede editar)", () => {
  expect(decidirAccionSync({ tieneTarifa: true, tieneLineas: true, idFactura: 55, estadoOdoo: "posted" })).toBe("saltar");
});
test("decidirAccionSync: centinela en proceso (id negativo) → saltar", () => {
  expect(decidirAccionSync({ tieneTarifa: true, tieneLineas: true, idFactura: -1, estadoOdoo: null })).toBe("saltar");
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `pnpm test -- calc`
Expected: FAIL — `decidirAccionSync is not a function` / no exportada.

- [ ] **Step 3: Implementar la función**

Agregar al final de `src/lib/calc.ts`:

```ts
export type AccionSync = "saltar" | "crear" | "actualizar" | "desvincular";

/**
 * Decide qué hacer con el comprobante borrador de un obrero:
 * - tieneTarifa: precio/hora > 0.
 * - tieneLineas: hay al menos una línea facturable (horas trabajadas con obra).
 * - idFactura: id guardado en la liquidación. null = no hay; < 0 = centinela "en proceso".
 *   PRECONDICIÓN: el caller ya limpió huérfanos (id que ya no existe en Odoo → pasar null).
 * - estadoOdoo: state de la account.move si idFactura > 0 ("draft" | "posted" | …); null si no aplica.
 */
export function decidirAccionSync(args: {
  tieneTarifa: boolean; tieneLineas: boolean; idFactura: number | null; estadoOdoo: string | null;
}): AccionSync {
  const { tieneTarifa, tieneLineas, idFactura, estadoOdoo } = args;
  if (!tieneTarifa) return "saltar";
  if (idFactura != null && idFactura < 0) return "saltar";       // EN_PROCESO: otra corrida lo está creando
  if (idFactura == null) return tieneLineas ? "crear" : "saltar"; // sin factura (o huérfana ya limpiada)
  if (estadoOdoo !== "draft") return "saltar";                   // posted u otro: no se puede editar
  return tieneLineas ? "actualizar" : "desvincular";
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `pnpm test -- calc`
Expected: PASS (incluidos los 7 nuevos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/calc.ts src/lib/calc.test.ts
git commit -m "feat(comprobantes): decidirAccionSync (decisión pura de sync de borrador)"
```

---

### Task 2: Helpers de Odoo — actualizar y eliminar factura borrador

**Files:**
- Modify: `src/lib/odoo/queries.ts` (agregar después de `crearFacturaProveedor`, ~línea 82)

No tiene test unitario (es I/O contra Odoo); se verifica con typecheck en tareas siguientes.

- [ ] **Step 1: Agregar las funciones**

En `src/lib/odoo/queries.ts`, después de `crearFacturaProveedor` (antes de `leerFacturas`):

```ts
// Reescribe líneas + narración de una factura de proveedor en BORRADOR.
// El caller garantiza state == "draft" (Odoo no deja editar líneas de una factura posteada).
// [5,0,0] borra todas las líneas actuales; los [0,0,{…}] crean las nuevas. Odoo recalcula totales.
export async function actualizarFacturaBorrador(args: {
  facturaId: number; referencia: string; narracion: string; lineas: LineaFactura[];
}): Promise<void> {
  const invoice_line_ids: unknown[] = [[5, 0, 0]];
  for (const l of args.lineas) invoice_line_ids.push([0, 0, {
    product_id: l.productId,
    name: l.nombre,
    quantity: l.cantidad,
    price_unit: l.precioUnit,
    analytic_distribution: { [String(l.obraId)]: 100 },
    tax_ids: [[6, 0, []]], // sin IVA
  }]);
  await ejecutar("account.move", "write", [[args.facturaId], {
    ref: args.referencia,
    narration: args.narracion,
    invoice_line_ids,
  }]);
}

// Borra una factura en BORRADOR (cuando el obrero se queda sin líneas). unlink solo permitido en draft.
export async function eliminarFactura(facturaId: number): Promise<void> {
  await ejecutar("account.move", "unlink", [[facturaId]]);
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (sin errores nuevos).

- [ ] **Step 3: Commit**

```bash
git add src/lib/odoo/queries.ts
git commit -m "feat(odoo): actualizarFacturaBorrador y eliminarFactura"
```

> **A validar contra Odoo en runtime** (no bloquea el plan): confirmar con el MCP de Odoo que `write` de `invoice_line_ids` con `[5,0,0]` sobre una `account.move` en `draft` deja el move consistente (totales recalculados). Si no, cambiar la estrategia a borrar líneas por id y recrearlas.

---

### Task 3: Núcleo de sincronización `comprobantes-core.ts`

**Files:**
- Create: `src/lib/comprobantes-core.ts`

Módulo plano (NO `"use server"`, NO auth): lo importan tanto la ruta de cron (protegida por secreto) como las server actions. La lógica de claim atómico y limpieza de huérfanos se mueve acá desde `comprobantes.ts`.

- [ ] **Step 1: Crear el archivo**

```ts
import { db } from "@/db";
import { quincenas, horas, obreros, categorias, liquidaciones } from "@/db/schema";
import {
  obtenerObras, leerFacturas, crearFacturaProveedor, actualizarFacturaBorrador, eliminarFactura,
} from "@/lib/odoo/queries";
import {
  valorHora, jornalEfectivo, etiquetaQuincena, desglosarJornales, construirLineasComprobante,
  decidirAccionSync, HORAS_JORNAL,
} from "@/lib/calc";
import { EMPRESA_BIMEG, DIARIO_COMPRAS, PRODUCTO_MANO_OBRA } from "@/lib/constantes";
import { and, eq, isNull, inArray } from "drizzle-orm";

// Centinela "factura en proceso" para el claim atómico (ningún id real de Odoo es negativo).
const EN_PROCESO = -1;

export type ResultadoObrero = {
  obreroId: number; nombre: string;
  estado: "creado" | "actualizado" | "desvinculado" | "ya_posteado" | "sin_tarifa" | "sin_horas" | "omitido" | "error";
  facturaId?: number; mensaje?: string;
};

// Términos y condiciones de la factura: desglose legible de la liquidación (HTML, lo renderiza Odoo).
function construirNarracion(args: {
  etiqueta: string; nombre: string; categoria: string | null; valorJornal: number; aliasCbu: string | null; horasTotal: number;
}): string {
  const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
  const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  const { jornales, sobrante } = desglosarJornales(args.horasTotal);
  const totalTrabajado = `${jornales} jornal${jornales === 1 ? "" : "es"}${sobrante > 0 ? ` + ${sobrante} h` : ""}`;
  return [
    `<p><strong>Liquidación · ${escHtml(args.etiqueta)} — ${escHtml(args.nombre)}</strong></p>`,
    args.categoria ? `<p><strong>Categoría:</strong> ${escHtml(args.categoria)}</p>` : null,
    `<p><strong>Valor jornal:</strong> ${money.format(args.valorJornal)} (${HORAS_JORNAL} hs)</p>`,
    `<p><strong>Total trabajado:</strong> ${totalTrabajado}</p>`,
    args.aliasCbu ? `<p><strong>Alias/CBU:</strong> ${escHtml(args.aliasCbu)}</p>` : null,
  ].filter(Boolean).join("");
}

/**
 * Sincroniza el borrador en Odoo de los obreros de una quincena (todos, o el subconjunto `obreroIds`).
 * - borrador → usa la tarifa VIVA (override del obrero → categoría).
 * - cerrada  → usa el jornal CONGELADO de la liquidación.
 * Crea, actualiza o desvincula la factura según su estado en Odoo. Idempotente.
 */
export async function sincronizarQuincena(quincenaId: number, obreroIds?: number[]): Promise<ResultadoObrero[]> {
  const [q] = await db.select().from(quincenas).where(eq(quincenas.id, quincenaId));
  if (!q) throw new Error("Quincena no encontrada");
  const cerrada = q.estado === "cerrada";

  const [filas, liqs, obrerosDb, cats, obras] = await Promise.all([
    db.select().from(horas).where(eq(horas.quincenaId, quincenaId)),
    db.select().from(liquidaciones).where(eq(liquidaciones.quincenaId, quincenaId)),
    db.select().from(obreros),
    db.select().from(categorias),
    obtenerObras(q.odooEmpresaId),
  ]);

  const obreroById = new Map(obrerosDb.map((o) => [o.id, o]));
  const liqByObrero = new Map(liqs.map((l) => [l.obreroId, l]));
  const valorCategoria = new Map(cats.map((c) => [c.id, Number(c.valorJornal)]));
  const nombreObra = new Map(obras.map((o) => [o.id, o.nombre]));
  const nombreCategoria = new Map(cats.map((c) => [c.id, c.nombre]));
  const referencia = `QUINCENA${q.fechaFin.replace(/-/g, "")}`;
  const etiqueta = etiquetaQuincena(q.fechaInicio);

  // Estados vivos de las facturas ya guardadas (una sola lectura a Odoo).
  const idsReales = liqs.map((l) => l.odooFacturaId).filter((x): x is number => x != null && x > 0);
  const facturas = await leerFacturas(idsReales);
  const estadoFactura = new Map(facturas.map((f) => [f.id, f.state]));

  const precioHoraDe = (obreroId: number): number => {
    if (cerrada) {
      const l = liqByObrero.get(obreroId);
      return l ? valorHora(Number(l.valorJornal)) : 0;
    }
    const o = obreroById.get(obreroId);
    if (!o) return 0;
    const cat = o.categoriaId != null ? valorCategoria.get(o.categoriaId) ?? null : null;
    return valorHora(jornalEfectivo(o.valorJornal != null ? Number(o.valorJornal) : null, cat));
  };

  async function procesar(obreroId: number): Promise<ResultadoObrero> {
    const o = obreroById.get(obreroId)!;
    const precioHora = precioHoraDe(obreroId);
    const suyas = filas.filter((f) => f.obreroId === obreroId)
      .map((f) => ({ tipo: f.tipo, odooObraId: f.odooObraId, horas: Number(f.horas) }));
    const lineas = construirLineasComprobante(suyas, precioHora);

    // Asegura la fila de liquidación para poder guardar el id. Placeholder en borrador
    // (valorJornal/adelantos se ignoran mientras la quincena no esté cerrada).
    await db.insert(liquidaciones)
      .values({ quincenaId, obreroId, valorJornal: String(precioHora * HORAS_JORNAL), adelantos: "0" })
      .onConflictDoNothing({ target: [liquidaciones.quincenaId, liquidaciones.obreroId] });
    const [liq] = await db.select().from(liquidaciones)
      .where(and(eq(liquidaciones.quincenaId, quincenaId), eq(liquidaciones.obreroId, obreroId)));

    // Huérfano: id guardado que ya no existe en Odoo (borrado a mano) → limpiar y tratar como sin factura.
    let idFactura = liq.odooFacturaId;
    if (idFactura != null && idFactura > 0 && !estadoFactura.has(idFactura)) {
      await db.update(liquidaciones).set({ odooFacturaId: null, odooFacturaNumero: null })
        .where(and(eq(liquidaciones.quincenaId, quincenaId), eq(liquidaciones.obreroId, obreroId)));
      idFactura = null;
    }
    const estadoOdoo = idFactura != null && idFactura > 0 ? estadoFactura.get(idFactura) ?? null : null;

    const accion = decidirAccionSync({
      tieneTarifa: precioHora > 0, tieneLineas: lineas.length > 0, idFactura, estadoOdoo,
    });

    if (accion === "saltar") {
      if (precioHora <= 0) return { obreroId, nombre: o.nombre, estado: "sin_tarifa" };
      if (idFactura != null && idFactura < 0) return { obreroId, nombre: o.nombre, estado: "omitido" };
      if (estadoOdoo && estadoOdoo !== "draft") return { obreroId, nombre: o.nombre, estado: "ya_posteado", facturaId: idFactura ?? undefined };
      return { obreroId, nombre: o.nombre, estado: "sin_horas" };
    }

    const lineasOdoo = lineas.map((l) => ({
      productId: PRODUCTO_MANO_OBRA,
      nombre: `Mano de obra — ${nombreObra.get(l.obraId) ?? `#${l.obraId}`}`,
      cantidad: l.horas, precioUnit: l.precioUnit, obraId: l.obraId,
    }));
    const narracion = construirNarracion({
      etiqueta, nombre: o.nombre,
      categoria: o.categoriaId != null ? nombreCategoria.get(o.categoriaId) ?? null : null,
      valorJornal: precioHora * HORAS_JORNAL, aliasCbu: o.aliasCbu,
      horasTotal: lineas.reduce((s, l) => s + l.horas, 0),
    });

    if (accion === "desvincular") {
      await eliminarFactura(idFactura!);
      await db.update(liquidaciones).set({ odooFacturaId: null, odooFacturaNumero: null })
        .where(and(eq(liquidaciones.quincenaId, quincenaId), eq(liquidaciones.obreroId, obreroId)));
      return { obreroId, nombre: o.nombre, estado: "desvinculado" };
    }

    if (accion === "actualizar") {
      await actualizarFacturaBorrador({ facturaId: idFactura!, referencia, narracion, lineas: lineasOdoo });
      return { obreroId, nombre: o.nombre, estado: "actualizado", facturaId: idFactura! };
    }

    // accion === "crear": claim atómico (marca EN_PROCESO solo si sigue sin factura).
    const claim = await db.update(liquidaciones).set({ odooFacturaId: EN_PROCESO })
      .where(and(eq(liquidaciones.quincenaId, quincenaId), eq(liquidaciones.obreroId, obreroId), isNull(liquidaciones.odooFacturaId)))
      .returning({ id: liquidaciones.id });
    if (claim.length === 0) return { obreroId, nombre: o.nombre, estado: "omitido" }; // otra corrida ganó el claim
    try {
      const facturaId = await crearFacturaProveedor({
        partnerId: o.odooContactoId, companyId: EMPRESA_BIMEG, journalId: DIARIO_COMPRAS,
        fecha: q.fechaFin, referencia, narracion, lineas: lineasOdoo,
      });
      await db.update(liquidaciones).set({ odooFacturaId: facturaId })
        .where(and(eq(liquidaciones.quincenaId, quincenaId), eq(liquidaciones.obreroId, obreroId)));
      return { obreroId, nombre: o.nombre, estado: "creado", facturaId };
    } catch (e) {
      // Falló Odoo: liberar el centinela para poder reintentar.
      await db.update(liquidaciones).set({ odooFacturaId: null })
        .where(and(eq(liquidaciones.quincenaId, quincenaId), eq(liquidaciones.obreroId, obreroId), eq(liquidaciones.odooFacturaId, EN_PROCESO)));
      throw e;
    }
  }

  const conHoras = new Set(filas.map((f) => f.obreroId));
  const objetivo = [...new Set(obreroIds ?? [...conHoras])].filter((id) => conHoras.has(id) && obreroById.has(id));
  const resultados: ResultadoObrero[] = [];
  for (const obreroId of objetivo) {
    try { resultados.push(await procesar(obreroId)); }
    catch (e) { resultados.push({ obreroId, nombre: obreroById.get(obreroId)?.nombre ?? `#${obreroId}`, estado: "error", mensaje: e instanceof Error ? e.message : String(e) }); }
  }
  return resultados;
}

/**
 * Disparador del cron: sincroniza el borrador de todas las quincenas en estado "borrador"
 * de BIMEG B que ya tengan horas cargadas. No crea quincenas.
 */
export async function sincronizarBorradores(): Promise<{ quincenas: number; resultados: ResultadoObrero[] }> {
  const qs = await db.select({ id: quincenas.id }).from(quincenas)
    .where(and(
      eq(quincenas.odooEmpresaId, EMPRESA_BIMEG),
      eq(quincenas.estado, "borrador"),
      inArray(quincenas.id, db.select({ id: horas.quincenaId }).from(horas)),
    ));
  const resultados: ResultadoObrero[] = [];
  for (const q of qs) resultados.push(...await sincronizarQuincena(q.id));
  return { quincenas: qs.length, resultados };
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Correr la suite de tests (no rompe nada existente)**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/comprobantes-core.ts
git commit -m "feat(comprobantes): núcleo de sync de borradores (crear/actualizar/desvincular)"
```

---

### Task 4: Refactor de `comprobantes.ts` → `sincronizarAhora`

**Files:**
- Modify: `src/actions/comprobantes.ts` (reemplazo completo)

`registrarComprobantes` se reemplaza por `sincronizarAhora`, un wrapper fino con `requireAdmin` que delega al core. `estadoComprobantes` se conserva tal cual.

- [ ] **Step 1: Reescribir el archivo**

Reemplazar TODO el contenido de `src/actions/comprobantes.ts` por:

```ts
"use server";
import { db } from "@/db";
import { liquidaciones } from "@/db/schema";
import { leerFacturas } from "@/lib/odoo/queries";
import { sincronizarQuincena, type ResultadoObrero } from "@/lib/comprobantes-core";
import { requireAdmin } from "@/lib/auth-server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

// Sincroniza los borradores de la quincena en Odoo bajo demanda (botón "Sincronizar ahora").
// borrador → tarifa viva; cerrada → tarifa congelada. `obreroIds` opcional para un subconjunto.
export async function sincronizarAhora(quincenaId: number, obreroIds?: number[]): Promise<ResultadoObrero[]> {
  await requireAdmin();
  const res = await sincronizarQuincena(quincenaId, obreroIds);
  revalidatePath("/saldos");
  return res;
}

type Registro = { facturaId: number; numero: string; estadoOdoo: string };

// Estado de las facturas ya registradas (por obrero), leyendo número + estado vivo de Odoo.
// Sincroniza huérfanos: si un id guardado ya no existe en Odoo (borrado a mano), limpia el
// odooFacturaId en la DB para que el obrero vuelva a aparecer como no-registrado.
export async function estadoComprobantes(quincenaId: number): Promise<Record<number, Registro>> {
  await requireAdmin();
  const liqs = await db.select().from(liquidaciones).where(eq(liquidaciones.quincenaId, quincenaId));
  // id > 0: ignora el centinela EN_PROCESO de un registro en curso (no es una factura real).
  const ids = liqs.map((l) => l.odooFacturaId).filter((x): x is number => x != null && x > 0);
  const facturas = await leerFacturas(ids);
  const byId = new Map(facturas.map((f) => [f.id, f]));

  for (const l of liqs) {
    if (l.odooFacturaId != null && l.odooFacturaId > 0 && !byId.has(l.odooFacturaId)) {
      await db.update(liquidaciones).set({ odooFacturaId: null, odooFacturaNumero: null })
        .where(and(eq(liquidaciones.quincenaId, quincenaId), eq(liquidaciones.obreroId, l.obreroId)));
    }
  }

  const out: Record<number, Registro> = {};
  for (const l of liqs) {
    if (l.odooFacturaId == null || l.odooFacturaId < 0) continue; // null o centinela en proceso
    const f = byId.get(l.odooFacturaId);
    if (!f) continue; // huérfano: ya se limpió arriba
    out[l.obreroId] = { facturaId: l.odooFacturaId, numero: f.name ?? "/", estadoOdoo: f.state ?? "?" };
  }
  return out;
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: FAIL — `saldos-tabla.tsx` todavía importa `registrarComprobantes` (se arregla en Task 7). El resto sin errores. Anotar el error esperado y seguir.

- [ ] **Step 3: Commit**

```bash
git add src/actions/comprobantes.ts
git commit -m "refactor(comprobantes): sincronizarAhora delega al core; conserva estadoComprobantes"
```

---

### Task 5: Cierre — sync final + guard de reabrir por estado en Odoo

**Files:**
- Modify: `src/actions/cierre.ts`

- [ ] **Step 1: Agregar imports**

En `src/actions/cierre.ts`, modificar los imports de la cabecera. Reemplazar la línea:

```ts
import { obtenerAdelantos } from "@/lib/odoo/queries";
```

por:

```ts
import { obtenerAdelantos, leerFacturas } from "@/lib/odoo/queries";
import { sincronizarQuincena } from "@/lib/comprobantes-core";
```

- [ ] **Step 2: Sync final tras congelar en `cerrarQuincena`**

En `cerrarQuincena`, reemplazar las dos últimas líneas del cuerpo:

```ts
  revalidatePath("/saldos");
  revalidatePath("/carga");
}
```

por:

```ts
  // Última sincronización del borrador con la tarifa CONGELADA (deja la factura con los números finales).
  await sincronizarQuincena(quincenaId);
  revalidatePath("/saldos");
  revalidatePath("/carga");
}
```

(La transacción de congelado ya hizo commit y `estado` quedó `cerrada`, así que `sincronizarQuincena` usa el jornal congelado.)

- [ ] **Step 3: Cambiar el guard de `reabrirQuincena`**

Reemplazar el cuerpo de `reabrirQuincena` por:

```ts
export async function reabrirQuincena(quincenaId: number) {
  await requireAdmin();
  const liqs = await db.select().from(liquidaciones).where(eq(liquidaciones.quincenaId, quincenaId));
  // Con borradores diarios, tener una factura en borrador es lo normal: solo bloquea reabrir
  // si alguna ya está CONTABILIZADA (posted) en Odoo. Los borradores siguen vivos al reabrir.
  const ids = liqs.map((l) => l.odooFacturaId).filter((x): x is number => x != null && x > 0);
  const facturas = await leerFacturas(ids);
  if (facturas.some((f) => f.state === "posted"))
    throw new Error("No se puede reabrir: hay comprobantes contabilizados en Odoo. Anulalos primero.");
  await db.update(quincenas).set({ estado: "borrador", cerradaEn: null }).where(eq(quincenas.id, quincenaId));
  revalidatePath("/saldos");
  revalidatePath("/carga");
}
```

- [ ] **Step 4: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: el único error restante es el de `saldos-tabla.tsx` (Task 7). `cierre.ts` sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/actions/cierre.ts
git commit -m "feat(cierre): sync final con tarifa congelada; reabrir chequea posted en Odoo"
```

---

### Task 6: Ruta de cron + vercel.json + env

**Files:**
- Create: `src/app/api/cron/sincronizar-borradores/route.ts`
- Create: `vercel.json`
- Modify: `.env.example`

- [ ] **Step 1: Crear la ruta**

`src/app/api/cron/sincronizar-borradores/route.ts`:

```ts
import { NextResponse } from "next/server";
import { sincronizarBorradores } from "@/lib/comprobantes-core";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // la sync puede tardar con varios obreros (I/O contra Odoo)

// Disparado a diario por Vercel Cron (manda Authorization: Bearer ${CRON_SECRET}) o cron externo.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }
  try {
    const r = await sincronizarBorradores();
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Crear `vercel.json`**

```json
{
  "crons": [
    { "path": "/api/cron/sincronizar-borradores", "schedule": "0 2 * * *" }
  ]
}
```

(`0 2 * * *` UTC ≈ 23:00 ART. En plan Hobby de Vercel el cron corre 1 vez/día, que es lo requerido.)

- [ ] **Step 3: Agregar `CRON_SECRET` a `.env.example`**

Agregar al final de `.env.example`:

```
# Cron (sincronización diaria de borradores en Odoo). Generar: openssl rand -base64 32
# Vercel Cron manda este valor como "Authorization: Bearer <CRON_SECRET>".
CRON_SECRET=""
```

- [ ] **Step 4: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: solo el error de `saldos-tabla.tsx` (Task 7).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/sincronizar-borradores/route.ts vercel.json .env.example
git commit -m "feat(cron): ruta diaria protegida por CRON_SECRET para sincronizar borradores"
```

---

### Task 7: UI — "Sincronizar ahora" en /saldos

**Files:**
- Modify: `src/app/saldos/saldos-tabla.tsx`

- [ ] **Step 1: Cambiar el import de la action**

Reemplazar (línea 11):

```ts
import { registrarComprobantes } from "@/actions/comprobantes";
```

por:

```ts
import { sincronizarAhora } from "@/actions/comprobantes";
```

- [ ] **Step 2: Reescribir la función `registrar` → `sincronizar`**

Reemplazar la función `registrar` (líneas 55-67) por:

```ts
  function sincronizar(obreroIds?: number[]) {
    startTransition(async () => {
      try {
        const res = await sincronizarAhora(quincenaId, obreroIds);
        const tocados = res.filter((r) => r.estado === "creado" || r.estado === "actualizado").length;
        const errores = res.filter((r) => r.estado === "error");
        if (tocados) toast.success(`${tocados} comprobante${tocados === 1 ? "" : "s"} sincronizado${tocados === 1 ? "" : "s"} en borrador`);
        if (errores.length) toast.error(`${errores.length} con error: ${errores.map((e) => e.nombre).join(", ")}`);
        if (!tocados && !errores.length) toast.info("Nada que sincronizar");
        router.refresh();
      } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo sincronizar"); }
    });
  }
```

- [ ] **Step 3: Actualizar la barra de acciones (borrador y cerrada)**

Reemplazar el bloque condicional `{cerrada ? ( … ) : ( … )}` de la barra "Total a pagar" (líneas 91-99) por:

```tsx
            {cerrada ? (
              <>
                <Button variant="ghost" onClick={reabrir} disabled={pendiente}>Reabrir</Button>
                <Button onClick={() => sincronizar()} disabled={pendiente} className="w-full sm:w-auto">Sincronizar ahora</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => sincronizar()} disabled={pendiente}>Sincronizar ahora</Button>
                <Button onClick={() => setConfirmarCerrar(true)} disabled={pendiente} className="w-full sm:w-auto">Cerrar quincena</Button>
              </>
            )}
```

- [ ] **Step 4: Botón por obrero disponible también en borrador**

Reemplazar el bloque de la columna Odoo por obrero (líneas 143-151) por:

```tsx
                  {reg ? (
                    <Badge variant="secondary" title={`Factura Odoo #${reg.facturaId} (${reg.estadoOdoo})`}>
                      {reg.numero !== "/" ? reg.numero : `#${reg.facturaId}`}
                    </Badge>
                  ) : !s.sinTarifa ? (
                    <Button variant="outline" size="sm" onClick={() => sincronizar([s.obreroId])} disabled={pendiente} className="w-full">Sincronizar</Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
```

- [ ] **Step 5: Verificar typecheck + lint**

Run: `npx tsc --noEmit`
Expected: PASS (sin errores; el de `registrarComprobantes` quedó resuelto).

Run: `pnpm lint`
Expected: PASS (sin errores nuevos).

- [ ] **Step 6: Commit**

```bash
git add src/app/saldos/saldos-tabla.tsx
git commit -m "feat(saldos): botón 'Sincronizar ahora' (borrador y cerrada)"
```

---

### Task 8: Comentario de schema + verificación final

**Files:**
- Modify: `src/db/schema.ts:101-102` (solo el comentario sobre `liquidaciones`)

- [ ] **Step 1: Actualizar el comentario**

Reemplazar las dos líneas de comentario arriba de `export const liquidaciones` (líneas 101-102):

```ts
// Snapshot escrito AL CERRAR: congela jornal y adelantos para fijar el histórico.
// Al registrar en Odoo se completa odooFacturaId (y odooFacturaNumero al publicarse).
```

por:

```ts
// Fila de vida del comprobante por (quincena, obrero): la crea temprano la sync diaria con valores
// placeholder (valorJornal/adelantos se ignoran mientras la quincena está en borrador) y guarda el
// odooFacturaId del borrador. Al CERRAR se congelan jornal y adelantos para fijar el histórico.
```

- [ ] **Step 2: Build completo**

Run: `pnpm build`
Expected: PASS (compila sin errores de tipos).

- [ ] **Step 3: Suite completa**

Run: `pnpm test`
Expected: PASS (todos los tests, incluidos los de `decidirAccionSync`).

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts
git commit -m "docs(schema): aclarar la nueva semántica de liquidaciones"
```

---

## Verificación manual post-implementación (smoke test contra Odoo real)

No automatizable acá; hacerlo en un entorno con Odoo:

1. Con una quincena en borrador y horas cargadas, pegarle a la ruta de cron con el secreto:
   `curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/sincronizar-borradores`
   → en Odoo aparece una factura de proveedor en **borrador** por obrero, con líneas por obra.
2. Cargar más horas de un obrero y re-disparar → la misma factura borrador se **actualiza** (no se duplica).
3. Borrar todas las horas de un obrero y re-disparar → su borrador se **desvincula** (desaparece de Odoo).
4. Cerrar la quincena → la factura queda con los números finales (tarifa congelada), en borrador.
5. Validar/postear esa factura en Odoo y probar **Reabrir** → debe bloquear con "hay comprobantes contabilizados".

---

## Self-Review (hecha)

- **Cobertura del spec:** disparador cron (Task 6), mantener cierre + sync final (Task 5), devengado bruto (la narración/líneas no tocan adelantos — Task 3), reuso de `liquidaciones` (Task 3 ensure-row + Task 8 comentario), `decidirAccionSync` + test (Task 1), Odoo update/unlink (Task 2), UI (Task 7), guard de reabrir (Task 5), `CRON_SECRET` (Task 6). Sin huecos.
- **Sin placeholders:** todo el código está completo; el único "a validar" (Task 2) es verificación de runtime contra Odoo, marcada como no bloqueante.
- **Consistencia de tipos:** `ResultadoObrero` se define en `comprobantes-core.ts` (Task 3) y se reexporta/consume en `comprobantes.ts` (Task 4) y `saldos-tabla.tsx` (Task 7). `decidirAccionSync` mismo shape en Task 1 (def) y Task 3 (uso). `sincronizarQuincena`/`sincronizarBorradores` mismas firmas en core (Task 3), actions (Task 4), cron (Task 6) y cierre (Task 5).
