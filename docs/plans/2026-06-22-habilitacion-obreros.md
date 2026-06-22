# Habilitación de obreros + ajustes carga/saldos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada obrero tiene estado habilitado/deshabilitado (solo admin); solo se cargan horas a habilitados; /carga abre sin obrero; /saldos muestra todos los obreros con datos, oculta quincenas vacías y no muestra el nombre de la base.

**Architecture:** Una columna nueva en `obreros` (`habilitado`, default true). El admin la edita reusando el diálogo y la action que ya existen. La restricción de carga se aplica en dos capas: la UI oculta deshabilitados y `guardarHoras` los rechaza en el servidor. Los ajustes de /saldos y /carga son cambios puntuales en componentes existentes.

**Tech Stack:** Next 16 (App Router, server actions), Drizzle ORM + Postgres, React 19, base-ui/shadcn, vitest.

**Verificación:** este repo testea solo funciones puras (`calc.test.ts`); las server actions se verifican con `pnpm build` (types) + smoke manual, igual que el resto. Cada task cierra con `pnpm build` y commit. La diseño: [docs/2026-06-22-habilitacion-obreros-design.md](../2026-06-22-habilitacion-obreros-design.md).

---

## Task 1: Columna `habilitado` en `obreros` + migración

**Files:**
- Modify: `src/db/schema.ts` (tabla `obreros`)
- Create: `drizzle/0004_*.sql` (generado)

- [ ] **Step 1: Agregar la columna al schema**

En `src/db/schema.ts`, dentro de `export const obreros = pgTable("obreros", { ... })`, agregar la columna justo después de `dni`:

```ts
  dni: text("dni"), // identificación; se trae de Odoo (vat) al sincronizar, no editable
  habilitado: boolean("habilitado").notNull().default(true), // solo admin lo cambia; deshabilitado = no se le cargan horas
  actualizadoEn: timestamp("actualizado_en").defaultNow().notNull(),
```

(`boolean` ya está importado en la línea 1.)

- [ ] **Step 2: Generar la migración**

Run: `pnpm db:generate`
Expected: crea `drizzle/0004_<nombre>.sql` con `ALTER TABLE "obreros" ADD COLUMN "habilitado" boolean DEFAULT true NOT NULL;`

- [ ] **Step 3: Aplicar a la base**

Run: `pnpm db:push`
Expected: aplica la columna. Es aditiva (NOT NULL con DEFAULT true) → los obreros existentes quedan `habilitado = true`, sin prompt de rename.
> Nota: `db:push` habla con la base real. Si lo corre un agente sin TTY y queda esperando confirmación, que lo corra el usuario.

- [ ] **Step 4: Verificar tipos**

Run: `pnpm build`
Expected: compila sin errores (la columna nueva ya viaja en los `db.select()` estrella).

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat(obreros): columna habilitado (default true) + migracion"
```

---

## Task 2: Actions — `guardarObrero` acepta `habilitado`, `guardarHoras` rechaza deshabilitado

**Files:**
- Modify: `src/actions/obreros.ts:33-47`
- Modify: `src/actions/quincenas.ts` (imports + `guardarHoras`)

- [ ] **Step 1: `guardarObrero` acepta y persiste `habilitado`**

En `src/actions/obreros.ts`, reemplazar la función `guardarObrero` completa por:

```ts
export async function guardarObrero(
  id: number,
  datos: { categoriaId: number | null; valorJornal: number | null; aliasCbu: string | null; habilitado: boolean },
) {
  await requireAdmin();
  await db.update(obreros)
    .set({
      categoriaId: datos.categoriaId,
      valorJornal: datos.valorJornal != null ? String(datos.valorJornal) : null,
      aliasCbu: datos.aliasCbu,
      habilitado: datos.habilitado,
      actualizadoEn: sql`now()`,
    })
    .where(eq(obreros.id, id));
  revalidatePath("/obreros");
  revalidatePath("/carga"); // un obrero recién deshabilitado debe desaparecer del buscador de carga
}
```

- [ ] **Step 2: Importar `obreros` en quincenas.ts**

En `src/actions/quincenas.ts:3`, reemplazar:

```ts
import { quincenas, horas } from "@/db/schema";
```

por:

```ts
import { quincenas, horas, obreros } from "@/db/schema";
```

- [ ] **Step 3: `guardarHoras` rechaza obrero deshabilitado (borde de confianza)**

En `src/actions/quincenas.ts`, dentro de `guardarHoras`, después del chequeo de quincena cerrada y antes del `db.delete(...)`, insertar:

```ts
  if (q.estado === "cerrada") throw new Error("Quincena cerrada: no se pueden modificar las horas");
  const [obrero] = await db.select({ habilitado: obreros.habilitado }).from(obreros).where(eq(obreros.id, datos.obreroId));
  if (!obrero) throw new Error("Obrero no encontrado");
  if (!obrero.habilitado) throw new Error("Obrero deshabilitado: no se le pueden cargar horas");
  // Reemplaza las filas de ese obrero en esa quincena (idempotente para re-carga).
  await db.delete(horas).where(and(eq(horas.quincenaId, datos.quincenaId), eq(horas.obreroId, datos.obreroId)));
```

(`and` y `eq` ya están importados en ese archivo.)

- [ ] **Step 4: Verificar tipos**

Run: `pnpm build`
Expected: falla la compilación en `src/app/obreros/obreros-tabla.tsx` (la llamada a `guardarObrero` todavía no pasa `habilitado`). **Eso es esperado** — se arregla en Task 3. Confirmá que el único error es ese.

> Si preferís un build verde por task, hacé Task 2 y Task 3 juntos en un solo commit. El orden de acá deja un build roto entre medio a propósito (cambio de firma antes que el caller).

- [ ] **Step 5: Commit**

```bash
git add src/actions/obreros.ts src/actions/quincenas.ts
git commit -m "feat(obreros): guardarObrero persiste habilitado; guardarHoras rechaza deshabilitado"
```

---

## Task 3: Diálogo "Editar obrero" — control de estado + badge en la fila

**Files:**
- Modify: `src/app/obreros/obreros-tabla.tsx` (tipo `ObreroRow`, fila, `EditarObrero`)
- Modify: `src/app/obreros/page.tsx:43` (mapeo)

- [ ] **Step 1: Agregar `habilitado` al tipo `ObreroRow`**

En `src/app/obreros/obreros-tabla.tsx:13`, reemplazar:

```ts
type ObreroRow = { id: number; nombre: string; categoriaId: number | null; valorJornal: string | null; aliasCbu: string | null };
```

por:

```ts
type ObreroRow = { id: number; nombre: string; categoriaId: number | null; valorJornal: string | null; aliasCbu: string | null; habilitado: boolean };
```

- [ ] **Step 2: Badge "deshabilitado" en la fila (para verlo de un vistazo)**

En `src/app/obreros/obreros-tabla.tsx`, en la celda del nombre, reemplazar:

```tsx
              <span className="pr-9 font-medium sm:pr-0">{o.nombre}</span>
```

por:

```tsx
              <span className="pr-9 font-medium sm:pr-0">
                {o.nombre}
                {!o.habilitado && <Badge variant="secondary" className="ml-2 align-middle text-[10px]">deshabilitado</Badge>}
              </span>
```

(`Badge` ya está importado.)

- [ ] **Step 3: Select de estado en el diálogo + payload**

En `src/app/obreros/obreros-tabla.tsx`, en la función `EditarObrero`:

3a. Agregar el estado local, después de `const [aliasCbu, setAliasCbu] = useState(obrero.aliasCbu ?? "");`:

```tsx
  const [habilitado, setHabilitado] = useState(obrero.habilitado);
```

3b. Pasar `habilitado` en la llamada a `guardarObrero` dentro de `onGuardar`:

```tsx
      await guardarObrero(obrero.id, {
        categoriaId: categoriaId ? Number(categoriaId) : null,
        valorJornal: valorJornal.trim() ? Number(valorJornal) : null,
        aliasCbu: aliasCbu.trim() ? aliasCbu.trim() : null,
        habilitado,
      });
```

3c. Agregar el control "Estado" como **primer** campo del formulario, justo después de `<div className="flex flex-col gap-4">` y antes del `div` de "Categoría":

```tsx
      <div className="flex flex-col gap-4">
        <div className="grid gap-1.5">
          <Label>Estado</Label>
          <Select
            items={{ habilitado: "Habilitado", deshabilitado: "Deshabilitado" }}
            value={habilitado ? "habilitado" : "deshabilitado"}
            onValueChange={(v) => setHabilitado(v === "habilitado")}
          >
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="habilitado">Habilitado</SelectItem>
              <SelectItem value="deshabilitado">Deshabilitado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Categoría</Label>
```

(`Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue`, `Label` ya están importados.)

- [ ] **Step 4: Pasar `habilitado` desde la página**

En `src/app/obreros/page.tsx:43`, reemplazar:

```tsx
          obreros={obreros.map((o) => ({ id: o.id, nombre: o.nombre, categoriaId: o.categoriaId, valorJornal: o.valorJornal, aliasCbu: o.aliasCbu }))}
```

por:

```tsx
          obreros={obreros.map((o) => ({ id: o.id, nombre: o.nombre, categoriaId: o.categoriaId, valorJornal: o.valorJornal, aliasCbu: o.aliasCbu, habilitado: o.habilitado }))}
```

- [ ] **Step 5: Verificar tipos (ahora sí build verde)**

Run: `pnpm build`
Expected: compila sin errores. El error de firma de Task 2 quedó resuelto.

- [ ] **Step 6: Commit**

```bash
git add src/app/obreros/obreros-tabla.tsx src/app/obreros/page.tsx
git commit -m "feat(obreros): editar estado habilitado en el dialogo + badge en la fila"
```

---

## Task 4: /carga oculta deshabilitados y abre sin obrero

**Files:**
- Modify: `src/app/carga/page.tsx:13-14`
- Modify: `src/app/carga/carga-form.tsx` (estado inicial, effect de horas, render)

- [ ] **Step 1: Filtrar habilitados en la página**

En `src/app/carga/page.tsx`, reemplazar:

```tsx
  const { obreros } = await listarObreros();
  const obrerosLite = obreros.map((o) => ({ id: o.id, nombre: o.nombre, dni: o.dni }));
```

por:

```tsx
  const { obreros } = await listarObreros();
  const obrerosLite = obreros.filter((o) => o.habilitado).map((o) => ({ id: o.id, nombre: o.nombre, dni: o.dni }));
```

- [ ] **Step 2: Arrancar sin obrero seleccionado**

En `src/app/carga/carga-form.tsx:70`, reemplazar:

```tsx
  const [obreroId, setObreroId] = useState<number>(obreros[0]?.id ?? 0);
```

por:

```tsx
  const [obreroId, setObreroId] = useState<number>(0); // 0 = ninguno; el usuario elige
```

- [ ] **Step 3: El effect de horas no consulta sin obrero**

En `src/app/carga/carga-form.tsx`, en el primer `useEffect` (el de `obtenerHorasGuardadas`), insertar el guard al principio del cuerpo:

```tsx
  useEffect(() => {
    let cancel = false;
    if (!obreroId) { cargarDias([]); setCerrada(false); setCargando(false); return () => { cancel = true; }; }
    setCargando(true);
    const { inicio, fin } = rangoQuincena(anio, mes, mitad);
    obtenerHorasGuardadas(empresaId, anio, mes, mitad, obreroId)
```

(El resto del effect y su array de dependencias quedan igual.)

- [ ] **Step 4: Texto contextual condicional**

En `src/app/carga/carga-form.tsx`, reemplazar el `<p>` que arranca con "Cargando":

```tsx
      <p className="px-1 text-sm text-muted-foreground">
        Cargando <span className="font-medium text-foreground">{obreroNombre}</span> · {mitad}ª quincena de {MESES[mes - 1]} (días {rango.inicio.slice(8)}–{rango.fin.slice(8)}). Cada día arranca como <span className="font-medium text-foreground">Ausente</span>; marcá los que estuvo Presente.
      </p>
```

por:

```tsx
      {obreroId ? (
        <p className="px-1 text-sm text-muted-foreground">
          Cargando <span className="font-medium text-foreground">{obreroNombre}</span> · {mitad}ª quincena de {MESES[mes - 1]} (días {rango.inicio.slice(8)}–{rango.fin.slice(8)}). Cada día arranca como <span className="font-medium text-foreground">Ausente</span>; marcá los que estuvo Presente.
        </p>
      ) : (
        <p className="px-1 text-sm text-muted-foreground">Elegí un obrero para cargar sus horas.</p>
      )}
```

- [ ] **Step 5: La grilla de días solo se renderiza con obrero**

En `src/app/carga/carga-form.tsx`, envolver el bloque `{cargando ? (...) : (...)}` (loader / grilla de días) con `{obreroId && (...)}`.

Reemplazar la línea de apertura:

```tsx
      {cargando ? (
```

por:

```tsx
      {obreroId && (cargando ? (
```

Y reemplazar la línea de cierre de ese bloque (el `)}` que está justo antes del comentario `{/* Barra fija: totales + guardar siempre a mano. ... */}`):

```tsx
        </div>
      )}

      {/* Barra fija: totales + guardar siempre a mano.
```

por:

```tsx
        </div>
      ))}

      {/* Barra fija: totales + guardar siempre a mano.
```

(La barra fija de totales/guardar queda siempre visible; sus botones ya están `disabled={!obreroId}`.)

- [ ] **Step 6: Verificar tipos**

Run: `pnpm build`
Expected: compila sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/app/carga/page.tsx src/app/carga/carga-form.tsx
git commit -m "feat(carga): ocultar obreros deshabilitados y abrir sin obrero seleccionado"
```

---

## Task 5: /saldos — quincenas con datos, badge deshabilitado, sin nombre de base

**Files:**
- Modify: `src/actions/saldos.ts` (imports, `listarQuincenas`, `construirSaldos`, tipo `SaldoRow`)
- Modify: `src/app/saldos/page.tsx:39-49`
- Modify: `src/app/saldos/saldos-tabla.tsx` (tipos, props, header, celda nombre)

- [ ] **Step 1: Imports de drizzle e Odoo en saldos.ts**

En `src/actions/saldos.ts:11`, reemplazar:

```ts
import { desc, eq } from "drizzle-orm";
```

por:

```ts
import { and, desc, eq, inArray } from "drizzle-orm";
```

En `src/actions/saldos.ts:4`, reemplazar:

```ts
import { obtenerEmpresas, obtenerObras, obtenerAdelantos, type Adelanto } from "@/lib/odoo/queries";
```

por:

```ts
import { obtenerObras, obtenerAdelantos, type Adelanto } from "@/lib/odoo/queries";
```

- [ ] **Step 2: `listarQuincenas` solo devuelve quincenas con datos**

En `src/actions/saldos.ts`, reemplazar la función `listarQuincenas` por:

```ts
/** Quincenas de BIMEG B con horas cargadas (vacías no aparecen), recientes primero, con etiqueta legible. */
export async function listarQuincenas() {
  await requireAdmin();
  const qs = await db.select().from(quincenas)
    .where(and(
      eq(quincenas.odooEmpresaId, EMPRESA_BIMEG),
      inArray(quincenas.id, db.select({ id: horas.quincenaId }).from(horas)),
    ))
    .orderBy(desc(quincenas.fechaInicio));
  return qs.map((q) => ({ id: q.id, etiqueta: etiquetaQuincena(q.fechaInicio) }));
}
```

- [ ] **Step 3: Sacar `obtenerEmpresas` del `Promise.all` de `construirSaldos`**

En `src/actions/saldos.ts`, reemplazar:

```ts
  const [filas, obrerosDb, cats, empresas, liqs] = await Promise.all([
    db.select().from(horas).where(eq(horas.quincenaId, quincenaId)),
    db.select().from(obreros),
    db.select().from(categorias),
    obtenerEmpresas(),
    db.select().from(liquidaciones).where(eq(liquidaciones.quincenaId, quincenaId)),
  ]);
```

por:

```ts
  const [filas, obrerosDb, cats, liqs] = await Promise.all([
    db.select().from(horas).where(eq(horas.quincenaId, quincenaId)),
    db.select().from(obreros),
    db.select().from(categorias),
    db.select().from(liquidaciones).where(eq(liquidaciones.quincenaId, quincenaId)),
  ]);
```

- [ ] **Step 4: Agregar `habilitado` a cada fila de saldo**

En `src/actions/saldos.ts`, dentro del `.map((o) => { ... return { ... } })` que arma `saldos`, agregar `habilitado` después de `dni`:

```ts
      obreroId: o.id,
      nombre: o.nombre,
      aliasCbu: o.aliasCbu,
      dni: o.dni,
      habilitado: o.habilitado,
      dias: diasTrabajados(suyas),
```

- [ ] **Step 5: Quitar `empresaNombre` del cálculo y del retorno**

En `src/actions/saldos.ts`, borrar la línea:

```ts
  const empresaNombre = empresas.find((e) => e.id === q.odooEmpresaId)?.nombre ?? `Empresa #${q.odooEmpresaId}`;
```

y en el `return`, reemplazar la línea de `quincena`:

```ts
    quincena: { id: q.id, etiqueta: etiquetaQuincena(q.fechaInicio), empresaNombre, estado: q.estado, fechaInicio: q.fechaInicio, fechaFin: q.fechaFin },
```

por:

```ts
    quincena: { id: q.id, etiqueta: etiquetaQuincena(q.fechaInicio), estado: q.estado, fechaInicio: q.fechaInicio, fechaFin: q.fechaFin },
```

- [ ] **Step 6: Agregar `habilitado` al tipo `SaldoRow` de la action**

En `src/actions/saldos.ts`, en la definición de `type SaldoRow` (al final del archivo), reemplazar:

```ts
type SaldoRow = {
  obreroId: number; nombre: string; aliasCbu: string | null; dni: string | null;
  dias: number; horas: number; devengado: number; adelantos: number; saldo: number;
  sinTarifa: boolean; detalle: Detalle[];
};
```

por:

```ts
type SaldoRow = {
  obreroId: number; nombre: string; aliasCbu: string | null; dni: string | null;
  habilitado: boolean;
  dias: number; horas: number; devengado: number; adelantos: number; saldo: number;
  sinTarifa: boolean; detalle: Detalle[];
};
```

- [ ] **Step 7: La página deja de pasar `empresaNombre`**

En `src/app/saldos/page.tsx`, borrar la línea dentro de `<SaldosTabla ...>`:

```tsx
        empresaNombre={data.quincena.empresaNombre}
```

- [ ] **Step 8: `saldos-tabla.tsx` — tipo, props, header sin nombre de base, badge deshabilitado**

8a. En `src/app/saldos/saldos-tabla.tsx`, en el `type SaldoRow` local, agregar `habilitado`:

```ts
type SaldoRow = {
  obreroId: number; nombre: string; aliasCbu: string | null; dni: string | null;
  habilitado: boolean;
  dias: number; horas: number; devengado: number; adelantos: number; saldo: number;
  sinTarifa: boolean; detalle: Detalle[];
};
```

8b. En la firma del componente, quitar `empresaNombre`. Reemplazar:

```tsx
export function SaldosTabla({ quincenas, quincenaId, empresaNombre, estado, saldos, costos, totales, registros }: {
  quincenas: Quincena[]; quincenaId: number; empresaNombre: string; estado: string;
  saldos: SaldoRow[]; costos: Costo[]; totales: Totales; registros: Record<number, Registro>;
}) {
```

por:

```tsx
export function SaldosTabla({ quincenas, quincenaId, estado, saldos, costos, totales, registros }: {
  quincenas: Quincena[]; quincenaId: number; estado: string;
  saldos: SaldoRow[]; costos: Costo[]; totales: Totales; registros: Record<number, Registro>;
}) {
```

8c. Quitar el nombre de la base del header. Reemplazar:

```tsx
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">{empresaNombre}</p>
          <Badge variant={cerrada ? "default" : "secondary"}>{cerrada ? "Cerrada" : "Borrador"}</Badge>
        </div>
```

por:

```tsx
        <div className="flex items-center gap-2">
          <Badge variant={cerrada ? "default" : "secondary"}>{cerrada ? "Cerrada" : "Borrador"}</Badge>
        </div>
```

8d. Badge "deshabilitado" en la celda del nombre. Reemplazar:

```tsx
                <span className="font-medium">
                  {s.nombre}
                  {s.sinTarifa && <Badge variant="destructive" className="ml-2 align-middle text-[10px]">sin tarifa</Badge>}
                </span>
```

por:

```tsx
                <span className="font-medium">
                  {s.nombre}
                  {!s.habilitado && <Badge variant="secondary" className="ml-2 align-middle text-[10px]">deshabilitado</Badge>}
                  {s.sinTarifa && <Badge variant="destructive" className="ml-2 align-middle text-[10px]">sin tarifa</Badge>}
                </span>
```

- [ ] **Step 9: Verificar tipos**

Run: `pnpm build`
Expected: compila sin errores. No quedan referencias a `empresaNombre` ni a `obtenerEmpresas`.

- [ ] **Step 10: Commit**

```bash
git add src/actions/saldos.ts src/app/saldos/page.tsx src/app/saldos/saldos-tabla.tsx
git commit -m "feat(saldos): quincenas con datos descendente, badge deshabilitado y sin nombre de base"
```

---

## Verificación final

- [ ] **Build + tests**

Run: `pnpm build && pnpm test`
Expected: build OK; vitest verde (los tests puros de `calc` no cambian).

- [ ] **Smoke manual** (cubre el camino de seguridad sin harness de DB)

1. `pnpm dev`, login como **admin**.
2. /obreros → editar un obrero → **Deshabilitado** → guardar. La fila muestra el badge "deshabilitado".
3. /carga → abre **sin obrero** y con el texto "Elegí un obrero…". El buscador **no** lista al deshabilitado. Elegí un habilitado → se carga la grilla.
4. (Borde de confianza) El deshabilitado no es seleccionable desde la UI; el rechazo en `guardarHoras` es la red de seguridad si llegara una request igual.
5. /saldos → el select de quincenas muestra solo las que tienen datos, más reciente arriba; **no** aparece "BIMEG B". Un obrero deshabilitado con horas en la quincena sigue apareciendo con su badge.
6. Login como **user** (no admin): /obreros no muestra el lápiz de edición (ya era así); /carga funciona normal.
```
