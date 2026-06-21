# Pantalla Saldos — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir `/saldos` — un visualizador read-only que, por quincena elegida, muestra el saldo a pagar por obrero (con desglose día×obra expandible) y el costo de mano de obra por obra.

**Architecture:** Server Component (`page.tsx`) que lee la quincena (de la DB + adelantos de Odoo) vía una server action thin (`construirSaldos`), delegando la agregación a funciones puras testeadas en `calc.ts`, y la renderiza en un Client Component (`saldos-tabla.tsx`) con filas expandibles y un selector de quincena que navega por query param.

**Tech Stack:** TypeScript · Next.js (App Router/Server Actions) · Drizzle (Supabase Postgres) · Odoo JSON-RPC · shadcn/ui (Base UI Select) · Vitest.

**Diseño de referencia:** [docs/2026-06-20-saldos-design.md](../2026-06-20-saldos-design.md).

---

## Mapa de archivos

```
src/
├─ lib/calc.ts (+ calc.test.ts)   # MODIFICAR: + etiquetaQuincena(), diasTrabajados() (puras, testeadas)
├─ actions/saldos.ts              # CREAR: listarQuincenas() + construirSaldos(quincenaId)
├─ app/saldos/
│  ├─ page.tsx                    # CREAR: server loader + selección por ?q=<id>
│  └─ saldos-tabla.tsx            # CREAR: client view (selector + tabla expandible + costos)
└─ components/nav.tsx             # MODIFICAR: + link "Saldos"
```

**Contrato de tipos (fijado acá, usado en todas las tareas):**

```ts
// Lo que devuelve construirSaldos(quincenaId): Promise<Reporte | null>
type Detalle = { fecha: string; obra: string | null; horas: number; tipo: string; comentario: string | null };
type SaldoRow = {
  obreroId: number; nombre: string; aliasCbu: string | null;
  dias: number; horas: number; devengado: number; adelantos: number; saldo: number;
  sinTarifa: boolean; detalle: Detalle[];
};
type Reporte = {
  quincena: { id: number; etiqueta: string; empresaNombre: string; fechaInicio: string; fechaFin: string };
  saldos: SaldoRow[];
  costos: { obra: string; costo: number }[];
  totales: { devengado: number; adelantos: number; saldo: number; costo: number };
};
// listarQuincenas(): Promise<{ id: number; etiqueta: string }[]>
```

**Nota sobre tests (patrón ya establecido en el proyecto):** las server actions y la UI dependen de DB + red, así que **no llevan unit test** (igual que `categorias.ts`, `quincenas.ts`, `obreros.ts`). Toda la lógica pura testeable se extrae a `calc.ts` (Task 1). Las Tasks 2–5 se verifican con `pnpm build` (compila + typecheck + lint) y un smoke manual final.

---

## Task 1: Helpers puros de agregación en `calc.ts` (TDD)

**Files:**
- Modify: `src/lib/calc.ts`
- Test: `src/lib/calc.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Agregá al final de `src/lib/calc.test.ts`:

```ts
import { etiquetaQuincena, diasTrabajados } from "./calc";

test("etiquetaQuincena: 1ª quincena (día 1)", () => {
  expect(etiquetaQuincena("2026-06-01")).toBe("1ª quincena · Jun 2026");
});
test("etiquetaQuincena: 2ª quincena (día 16)", () => {
  expect(etiquetaQuincena("2026-06-16")).toBe("2ª quincena · Jun 2026");
});
test("etiquetaQuincena: otro mes (febrero)", () => {
  expect(etiquetaQuincena("2026-02-16")).toBe("2ª quincena · Feb 2026");
});

test("diasTrabajados: cuenta días distintos trabajados (multi-obra mismo día = 1)", () => {
  const filas = [
    { fecha: "2026-06-01", tipo: "trabajado" }, // obra A
    { fecha: "2026-06-01", tipo: "trabajado" }, // obra B, mismo día
    { fecha: "2026-06-02", tipo: "trabajado" },
    { fecha: "2026-06-03", tipo: "ausente" },   // no cuenta
  ];
  expect(diasTrabajados(filas)).toBe(2);
});
```

- [ ] **Step 2: Correr para verificar que fallan**

Run: `pnpm test src/lib/calc.test.ts`
Expected: FAIL (`etiquetaQuincena is not a function`, `diasTrabajados is not a function`).

- [ ] **Step 3: Implementar al final de `src/lib/calc.ts`**

```ts
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/** Etiqueta legible de una quincena a partir de su fecha de inicio ("yyyy-mm-dd"). */
export function etiquetaQuincena(fechaInicio: string): string {
  const [anio, mes, dia] = fechaInicio.split("-").map(Number);
  const mitad = dia <= 15 ? "1ª" : "2ª";
  return `${mitad} quincena · ${MESES[mes - 1]} ${anio}`;
}

/** Cantidad de días distintos con al menos un bloque trabajado. */
export function diasTrabajados(filas: { fecha: string; tipo: string }[]): number {
  const dias = new Set<string>();
  for (const f of filas) if (f.tipo === "trabajado") dias.add(f.fecha);
  return dias.size;
}
```

- [ ] **Step 4: Correr para verificar que pasan**

Run: `pnpm test src/lib/calc.test.ts`
Expected: PASS (todos, incluidos los nuevos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/calc.ts src/lib/calc.test.ts
git commit -m "feat(calc): etiquetaQuincena + diasTrabajados (puras, testeadas)"
```

---

## Task 2: Server action `construirSaldos` + `listarQuincenas`

**Files:**
- Create: `src/actions/saldos.ts`

Lógica thin: lee de DB (quincena, horas, obreros, categorías) + Odoo (adelantos, obras, empresas) y arma el `Reporte` usando las funciones puras de `calc.ts`. **Solo filas `trabajado` con obra** entran al importe (el form de carga garantiza obra en las filas trabajadas; las ausencias aportan 0 y solo se ven en el desglose).

- [ ] **Step 1: Crear `src/actions/saldos.ts`**

```ts
"use server";
import { db } from "@/db";
import { quincenas, horas, obreros, categorias } from "@/db/schema";
import { obtenerEmpresas, obtenerObras, obtenerAdelantos } from "@/lib/odoo/queries";
import {
  jornalEfectivo, valorHora, devengadoPorObrero, costoPorObra, saldo,
  diasTrabajados, etiquetaQuincena, type FilaCalc,
} from "@/lib/calc";
import { desc, eq } from "drizzle-orm";

/** Todas las quincenas existentes (ambas empresas), recientes primero, con etiqueta legible. */
export async function listarQuincenas() {
  const [qs, empresas] = await Promise.all([
    db.select().from(quincenas).orderBy(desc(quincenas.fechaInicio)),
    obtenerEmpresas(),
  ]);
  const nombreEmpresa = new Map(empresas.map((e) => [e.id, e.nombre]));
  return qs.map((q) => ({
    id: q.id,
    etiqueta: `${nombreEmpresa.get(q.odooEmpresaId) ?? `Empresa #${q.odooEmpresaId}`} · ${etiquetaQuincena(q.fechaInicio)}`,
  }));
}

export async function construirSaldos(quincenaId: number) {
  const [q] = await db.select().from(quincenas).where(eq(quincenas.id, quincenaId));
  if (!q) return null;

  const [filas, obrerosDb, cats, empresas] = await Promise.all([
    db.select().from(horas).where(eq(horas.quincenaId, quincenaId)),
    db.select().from(obreros),
    db.select().from(categorias),
    obtenerEmpresas(),
  ]);

  const valorCategoria = new Map(cats.map((c) => [c.id, Number(c.valorJornal)]));
  const obreroById = new Map(obrerosDb.map((o) => [o.id, o]));

  // valor/hora por obrero: override propio → categoría → 0
  const tarifaHora = (obreroId: number): number => {
    const o = obreroById.get(obreroId);
    if (!o) return 0;
    const cat = o.categoriaId != null ? valorCategoria.get(o.categoriaId) ?? null : null;
    return valorHora(jornalEfectivo(o.valorJornal != null ? Number(o.valorJornal) : null, cat));
  };

  // ponytail: solo trabajado + obra entra al importe; el form de carga garantiza obra en trabajado.
  const trabajadas: FilaCalc[] = filas
    .filter((f) => f.tipo === "trabajado" && f.odooObraId != null)
    .map((f) => ({ obreroId: f.obreroId, obraId: f.odooObraId as number, horas: Number(f.horas) }));

  const devengado = devengadoPorObrero(trabajadas, tarifaHora);
  const costos = costoPorObra(trabajadas, tarifaHora);

  // Obreros que aparecen en esta quincena (tienen alguna fila cargada)
  const obrerosConHoras = [...new Set(filas.map((f) => f.obreroId))]
    .map((id) => obreroById.get(id))
    .filter((o): o is NonNullable<typeof o> => !!o);

  // Adelantos de Odoo (pagos salientes al contacto) → por contacto → por obrero
  const pagos = await obtenerAdelantos(obrerosConHoras.map((o) => o.odooContactoId), q.fechaInicio, q.fechaFin);
  const adelantoPorContacto = new Map<number, number>();
  for (const p of pagos) adelantoPorContacto.set(p.contactoId, (adelantoPorContacto.get(p.contactoId) ?? 0) + p.monto);

  // Nombres de obra de la empresa de la quincena
  const obras = await obtenerObras(q.odooEmpresaId);
  const nombreObra = new Map(obras.map((o) => [o.id, o.nombre]));

  const saldos: SaldoRow[] = obrerosConHoras.map((o) => {
    const suyas = filas.filter((f) => f.obreroId === o.id);
    const dev = devengado.get(o.id) ?? 0;
    const adel = adelantoPorContacto.get(o.odooContactoId) ?? 0;
    return {
      obreroId: o.id,
      nombre: o.nombre,
      aliasCbu: o.aliasCbu,
      dias: diasTrabajados(suyas),
      horas: suyas.filter((f) => f.tipo === "trabajado").reduce((s, f) => s + Number(f.horas), 0),
      devengado: dev,
      adelantos: adel,
      saldo: saldo(dev, adel),
      sinTarifa: tarifaHora(o.id) === 0,
      detalle: suyas
        .slice()
        .sort((a, b) => a.fecha.localeCompare(b.fecha))
        .map((f) => ({
          fecha: f.fecha,
          obra: f.odooObraId != null ? (nombreObra.get(f.odooObraId) ?? `#${f.odooObraId}`) : null,
          horas: Number(f.horas),
          tipo: f.tipo,
          comentario: f.comentario,
        })),
    };
  }).sort((a, b) => a.nombre.localeCompare(b.nombre));

  const costosList = [...costos.entries()]
    .map(([obraId, costo]) => ({ obra: nombreObra.get(obraId) ?? `#${obraId}`, costo }))
    .sort((a, b) => b.costo - a.costo);

  const totales = {
    devengado: saldos.reduce((s, x) => s + x.devengado, 0),
    adelantos: saldos.reduce((s, x) => s + x.adelantos, 0),
    saldo: saldos.reduce((s, x) => s + x.saldo, 0),
    costo: costosList.reduce((s, x) => s + x.costo, 0),
  };

  const empresaNombre = empresas.find((e) => e.id === q.odooEmpresaId)?.nombre ?? `Empresa #${q.odooEmpresaId}`;

  return {
    quincena: { id: q.id, etiqueta: etiquetaQuincena(q.fechaInicio), empresaNombre, fechaInicio: q.fechaInicio, fechaFin: q.fechaFin },
    saldos,
    costos: costosList,
    totales,
  };
}

// Tipos del reporte (re-export para la vista)
type Detalle = { fecha: string; obra: string | null; horas: number; tipo: string; comentario: string | null };
type SaldoRow = {
  obreroId: number; nombre: string; aliasCbu: string | null;
  dias: number; horas: number; devengado: number; adelantos: number; saldo: number;
  sinTarifa: boolean; detalle: Detalle[];
};
```

- [ ] **Step 2: Verificar que compila y typechequea**

Run: `pnpm build`
Expected: build OK, sin errores de TS. (`/saldos` todavía no existe como ruta; este paso solo valida que el módulo de la action compila.)

- [ ] **Step 3: Commit**

```bash
git add src/actions/saldos.ts
git commit -m "feat(saldos): action construirSaldos + listarQuincenas"
```

---

## Task 3: Vista `saldos-tabla.tsx` (Client Component)

**Files:**
- Create: `src/app/saldos/saldos-tabla.tsx`

Selector de quincena (navega a `?q=<id>`), tabla de obreros con filas expandibles (desglose día×obra + alias/CBU), tabla de costos por obra, y totales. Mismos patrones que `obreros-tabla.tsx` (grid responsive, `Intl.NumberFormat` es-AR, Base UI `Select`).

- [ ] **Step 1: Crear `src/app/saldos/saldos-tabla.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRightIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const money = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);

type Detalle = { fecha: string; obra: string | null; horas: number; tipo: string; comentario: string | null };
type SaldoRow = {
  obreroId: number; nombre: string; aliasCbu: string | null;
  dias: number; horas: number; devengado: number; adelantos: number; saldo: number;
  sinTarifa: boolean; detalle: Detalle[];
};
type Costo = { obra: string; costo: number };
type Totales = { devengado: number; adelantos: number; saldo: number; costo: number };
type Quincena = { id: number; etiqueta: string };

const GRID = "sm:grid-cols-[2rem_minmax(0,1.4fr)_3.5rem_3.5rem_repeat(3,minmax(6rem,1fr))]";

export function SaldosTabla({ quincenas, quincenaId, empresaNombre, saldos, costos, totales }: {
  quincenas: Quincena[]; quincenaId: number; empresaNombre: string;
  saldos: SaldoRow[]; costos: Costo[]; totales: Totales;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState<number | null>(null);
  const items = Object.fromEntries(quincenas.map((q) => [String(q.id), q.etiqueta]));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{empresaNombre}</p>
        <Select items={items} value={String(quincenaId)} onValueChange={(v) => { if (v) router.push(`/saldos?q=${v}`); }}>
          <SelectTrigger className="w-full sm:w-80"><SelectValue /></SelectTrigger>
          <SelectContent>
            {quincenas.map((q) => <SelectItem key={q.id} value={String(q.id)}>{q.etiqueta}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Saldo por obrero</h2>

        <div className={`hidden gap-3 px-3 text-xs font-medium text-muted-foreground sm:grid ${GRID}`}>
          <span /><span>Obrero</span>
          <span className="text-right">Días</span><span className="text-right">Horas</span>
          <span className="text-right">Devengado</span><span className="text-right">Adelantos</span><span className="text-right">A pagar</span>
        </div>

        {saldos.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">No hay horas cargadas en esta quincena.</p>}

        {saldos.map((s) => {
          const open = abierto === s.obreroId;
          return (
            <div key={s.obreroId} className="rounded-lg border sm:rounded-none sm:border-0 sm:border-b">
              <button
                onClick={() => setAbierto(open ? null : s.obreroId)}
                className={`grid w-full grid-cols-1 items-center gap-1.5 p-3 text-left sm:gap-3 ${GRID}`}
              >
                <ChevronRightIcon className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
                <span className="font-medium">
                  {s.nombre}
                  {s.sinTarifa && <Badge variant="destructive" className="ml-2 align-middle text-[10px]">sin tarifa</Badge>}
                </span>
                <span className="text-sm tabular-nums sm:text-right"><span className="text-muted-foreground sm:hidden">Días: </span>{s.dias}</span>
                <span className="text-sm tabular-nums sm:text-right"><span className="text-muted-foreground sm:hidden">Horas: </span>{s.horas}</span>
                <span className="text-sm tabular-nums sm:text-right"><span className="text-muted-foreground sm:hidden">Devengado: </span>{money(s.devengado)}</span>
                <span className="text-sm tabular-nums sm:text-right"><span className="text-muted-foreground sm:hidden">Adelantos: </span>{money(s.adelantos)}</span>
                <span className={`text-sm font-semibold tabular-nums sm:text-right ${s.saldo < 0 ? "text-destructive" : ""}`}>
                  <span className="font-normal text-muted-foreground sm:hidden">A pagar: </span>{money(s.saldo)}
                </span>
              </button>

              {open && (
                <div className="border-t bg-muted/30 px-3 py-2 text-sm sm:pl-11">
                  {s.aliasCbu && <p className="mb-2 text-xs text-muted-foreground">Alias/CBU: <span className="font-mono">{s.aliasCbu}</span></p>}
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
            <span className="tabular-nums sm:text-right"><span className="text-muted-foreground sm:hidden">Devengado: </span>{money(totales.devengado)}</span>
            <span className="tabular-nums sm:text-right"><span className="text-muted-foreground sm:hidden">Adelantos: </span>{money(totales.adelantos)}</span>
            <span className="tabular-nums sm:text-right"><span className="text-muted-foreground sm:hidden">A pagar: </span>{money(totales.saldo)}</span>
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

- [ ] **Step 2: Verificar que compila**

Run: `pnpm build`
Expected: build OK. (La ruta `/saldos` aún no resuelve hasta crear `page.tsx` en Task 4; este paso valida tipos del componente. Si `pnpm build` exige la page, hacé Task 4 y corré el build una vez.)

- [ ] **Step 3: Commit**

```bash
git add src/app/saldos/saldos-tabla.tsx
git commit -m "feat(saldos): vista tabla obreros expandible + costos por obra"
```

---

## Task 4: Página `saldos/page.tsx` (Server Component)

**Files:**
- Create: `src/app/saldos/page.tsx`

Lista quincenas, elige la del `?q=<id>` (o la más reciente), arma el reporte y lo pasa a la vista. Empty state si no hay quincenas.

- [ ] **Step 1: Crear `src/app/saldos/page.tsx`**

```tsx
import { ReceiptTextIcon } from "lucide-react";
import { listarQuincenas, construirSaldos } from "@/actions/saldos";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { SaldosTabla } from "./saldos-tabla";

export const dynamic = "force-dynamic"; // lee datos vivos (DB + Odoo) en cada request

export default async function SaldosPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const lista = await listarQuincenas();

  if (lista.length === 0) {
    return (
      <main className="mx-auto max-w-5xl p-4 sm:p-6">
        <h1 className="mb-4 text-xl font-semibold tracking-tight">Saldos</h1>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><ReceiptTextIcon /></EmptyMedia>
            <EmptyTitle>No hay quincenas cargadas</EmptyTitle>
            <EmptyDescription>Cargá horas en <a className="underline" href="/carga">/carga</a> y volvé acá.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </main>
    );
  }

  const elegida = sp.q && lista.some((q) => String(q.id) === sp.q) ? Number(sp.q) : lista[0].id;
  const data = await construirSaldos(elegida);
  if (!data) return <main className="mx-auto max-w-5xl p-4 sm:p-6">Quincena no encontrada.</main>;

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <h1 className="text-xl font-semibold tracking-tight">Saldos · {data.quincena.etiqueta}</h1>
      <SaldosTabla
        quincenas={lista}
        quincenaId={elegida}
        empresaNombre={data.quincena.empresaNombre}
        saldos={data.saldos}
        costos={data.costos}
        totales={data.totales}
      />
    </main>
  );
}
```

- [ ] **Step 2: Verificar que compila y la ruta resuelve**

Run: `pnpm build`
Expected: build OK, `/saldos` aparece como `ƒ` (dynamic) en el output.

- [ ] **Step 3: Commit**

```bash
git add src/app/saldos/page.tsx
git commit -m "feat(saldos): page loader + selector de quincena por ?q"
```

---

## Task 5: Link en la nav + smoke E2E manual

**Files:**
- Modify: `src/components/nav.tsx:7-11`

- [ ] **Step 1: Agregar el link "Saldos"**

En `src/components/nav.tsx`, reemplazá el array `LINKS`:

```tsx
// Carga primero: pantalla de uso diario. Saldos para revisar/pagar. Obreros/Categorías son setup.
const LINKS = [
  { href: "/carga", label: "Carga" },
  { href: "/saldos", label: "Saldos" },
  { href: "/obreros", label: "Obreros" },
  { href: "/categorias", label: "Categorías" },
];
```

- [ ] **Step 2: Build final**

Run: `pnpm build`
Expected: build OK, `/saldos` = `ƒ` dynamic, sin errores de TS/lint.

- [ ] **Step 3: Commit**

```bash
git add src/components/nav.tsx
git commit -m "feat(nav): link a Saldos"
```

- [ ] **Step 4: Smoke manual (🧑 con datos reales)**

```bash
pnpm dev   # http://localhost:3000/saldos
```

Verificar:
- El selector lista las quincenas existentes con etiqueta "Empresa · 1ª/2ª quincena Mes Año".
- Cambiar de quincena en el selector recarga los datos (cambia el `?q`).
- Una fila de obrero muestra Días/Horas/Devengado/Adelantos/A pagar; al hacer click se despliega el desglose día×obra y el alias/CBU.
- Las ausencias aparecen en el desglose (con motivo) y **no** suman al importe.
- Un obrero sin categoría ni override aparece con chip "sin tarifa" y devengado $0.
- La tabla de costos por obra suma lo esperado; el total cuadra.
- Si un adelanto cargado en Odoo (pago saliente al contacto, dentro del período) no aparece, revisar el cruce contacto↔obrero (ver nota en queries `obtenerAdelantos`).

---

## Self-Review (cobertura vs diseño)

- ✅ Selector de quincena (cualquiera, ambas empresas, etiqueta legible) → Task 2 (`listarQuincenas`) + Task 4 + Task 3 (Select).
- ✅ Saldo por obrero (días, horas, devengado, adelantos, saldo) → Task 2 + Task 3.
- ✅ Desglose día×obra expandible + ausencias con motivo + alias/CBU → Task 3.
- ✅ Adelantos de Odoo restados → Task 2 (`obtenerAdelantos`).
- ✅ Costo de mano de obra por obra → Task 2 (`costoPorObra`) + Task 3.
- ✅ Solo `trabajado` entra al importe → Task 2 (filtro `trabajadas`).
- ✅ Bordes: sin tarifa (chip), saldo negativo (rojo), obra borrada (`#id`), empty states → Tasks 2–4.
- ✅ Lógica pura testeada (etiqueta, días) → Task 1.
- ⏸️ Fuera de alcance (confirmado): cierre de quincena, auth, escritura a Odoo.

## Pendiente posterior (no es de este plan)
- Cierre de quincena: congelar `valor_jornal` + adelantos en `liquidaciones` y bloquear `guardarHoras` sobre quincenas cerradas (la columna `estado` ya existe).
