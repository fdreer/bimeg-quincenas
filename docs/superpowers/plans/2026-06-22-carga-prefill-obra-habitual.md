# Pre-llenado de carga por obra habitual — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que al abrir un obrero *sin cargar* que tiene "obra habitual", su quincena venga pre-llenada Lun–Vie como Presente · 8 hs · esa obra (Sáb/Dom Ausentes), para que el jefe solo corrija excepciones.

**Architecture:** Una columna nullable `odoo_obra_habitual_id` en `obreros`, seteada desde el diálogo de Obreros (admin). El form de `/carga` lee ese id y, cuando el obrero no tiene filas guardadas en el período, arma el borrador pre-llenado en memoria (sugerencia; se persiste recién al Guardar). La regla "qué días son hábiles" vive como función pura en `calc.ts` con test.

**Tech Stack:** Next.js 16 (App Router, server actions), Drizzle ORM + Postgres, Zustand (store de carga), date-fns, Vitest (entorno node, solo funciones puras), Base UI / shadcn.

**Spec:** `docs/superpowers/specs/2026-06-22-carga-prefill-obra-habitual-design.md`

---

## Mapa de archivos

| Archivo | Qué hace | Cambio |
|---|---|---|
| `src/lib/calc.ts` | Cálculos puros | + `diasHabilesDeRango(inicio, fin)` |
| `src/lib/calc.test.ts` | Tests puros | + tests de `diasHabilesDeRango` |
| `src/db/schema.ts` | Tablas drizzle | + columna `odooObraHabitualId` en `obreros` |
| `drizzle/0005_*.sql` | Migración generada | nuevo (lo genera drizzle-kit) |
| `src/actions/obreros.ts` | Server actions de obreros | `guardarObrero` acepta/persiste `obraHabitualId` |
| `src/app/obreros/page.tsx` | Page de obreros | trae obras; pasa `obras` + `obraHabitualId` |
| `src/app/obreros/obreros-tabla.tsx` | Tabla + diálogo editar | select "Obra habitual" en el diálogo |
| `src/app/carga/page.tsx` | Page de carga | `obrerosLite` suma `obraHabitualId` |
| `src/app/carga/carga-form.tsx` | Form de carga | `construirDiasPrefill` + gating en el efecto + texto |

Orden de tareas: 1 (función pura, TDD) → 2 (schema/migración) → 3 (server action) → 4 (UI obreros) → 5 (carga: page + prefill) → 6 (verificación final).

---

## Task 1: Función pura `diasHabilesDeRango` (TDD)

**Files:**
- Modify: `src/lib/calc.ts` (import de date-fns + nueva función)
- Test: `src/lib/calc.test.ts`

- [ ] **Step 1: Escribir el test que falla**

En `src/lib/calc.test.ts`, agregar `diasHabilesDeRango` al import existente de `./calc` (es el `import { ... } from "./calc";` de la línea 2) y agregar al final del archivo:

```ts
test("diasHabilesDeRango: 2ª quincena junio 2026 → solo Lun–Vie", () => {
  expect(diasHabilesDeRango("2026-06-16", "2026-06-30")).toEqual([
    "2026-06-16", "2026-06-17", "2026-06-18", "2026-06-19", // Mar–Vie
    "2026-06-22", "2026-06-23", "2026-06-24", "2026-06-25", "2026-06-26", // Lun–Vie
    "2026-06-29", "2026-06-30", // Lun–Mar
  ]);
});
test("diasHabilesDeRango: excluye el finde (20=Sáb, 21=Dom)", () => {
  const h = diasHabilesDeRango("2026-06-16", "2026-06-30");
  expect(h).not.toContain("2026-06-20");
  expect(h).not.toContain("2026-06-21");
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- calc`
Expected: FAIL — `diasHabilesDeRango is not a function` (o error de import).

- [ ] **Step 3: Implementar la función**

En `src/lib/calc.ts`, cambiar el import de date-fns de la línea 1:

```ts
import { endOfMonth, format, parseISO, addDays } from "date-fns";
```

Y agregar la función justo después de `rangoQuincena` (después de su `}` de cierre, ~línea 13):

```ts
/**
 * Días Lun–Vie del rango [inicio, fin] inclusive, en "yyyy-MM-dd". Sáb y Dom quedan afuera.
 * Son los días que el pre-llenado de /carga marca como Presente.
 */
export function diasHabilesDeRango(inicio: string, fin: string): string[] {
  const out: string[] = [];
  for (let d = parseISO(inicio), end = parseISO(fin); d <= end; d = addDays(d, 1)) {
    const dow = d.getDay(); // 0=Dom … 6=Sáb
    if (dow >= 1 && dow <= 5) out.push(format(d, "yyyy-MM-dd"));
  }
  return out;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm test -- calc`
Expected: PASS (los nuevos tests + los existentes de calc en verde).

- [ ] **Step 5: Commit**

```bash
git add src/lib/calc.ts src/lib/calc.test.ts
git commit -m "feat(calc): diasHabilesDeRango (Lun-Vie de una quincena)"
```

---

## Task 2: Columna `odooObraHabitualId` en `obreros` + migración

**Files:**
- Modify: `src/db/schema.ts:71`
- Create: `drizzle/0005_*.sql` (lo genera drizzle-kit)

- [ ] **Step 1: Agregar la columna al schema**

En `src/db/schema.ts`, dentro de `export const obreros = pgTable("obreros", { ... })`, agregar la columna después de `habilitado` (línea 71):

```ts
  habilitado: boolean("habilitado").notNull().default(true), // solo admin lo cambia; deshabilitado = no se le cargan horas
  odooObraHabitualId: integer("odoo_obra_habitual_id"), // obra por defecto (account.analytic.account); pre-llena Lun–Vie en /carga
  actualizadoEn: timestamp("actualizado_en").defaultNow().notNull(),
```

(`integer` ya está importado en la línea 1 de `schema.ts`.)

- [ ] **Step 2: Generar la migración**

Run: `npm run db:generate`
Expected: se crea `drizzle/0005_<nombre-random>.sql` con `ALTER TABLE "obreros" ADD COLUMN "odoo_obra_habitual_id" integer;`

- [ ] **Step 3: Aplicar la migración a la DB de desarrollo**

Run: `npm run db:push`
Expected: drizzle-kit aplica el cambio sin prompts (columna nullable, no destructiva). Si pregunta, confirmar el `ADD COLUMN`.

- [ ] **Step 4: Verificar que el proyecto compila con la nueva columna**

Run: `npm run build`
Expected: build OK. `listarObreros` (que hace `db.select().from(obreros)`) ahora incluye `odooObraHabitualId` en su tipo automáticamente.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat(db): columna odoo_obra_habitual_id en obreros"
```

---

## Task 3: `guardarObrero` acepta y persiste `obraHabitualId`

**Files:**
- Modify: `src/actions/obreros.ts:33-49`

- [ ] **Step 1: Editar la firma y el update**

En `src/actions/obreros.ts`, reemplazar la función `guardarObrero` entera por:

```ts
export async function guardarObrero(
  id: number,
  datos: { categoriaId: number | null; valorJornal: number | null; aliasCbu: string | null; habilitado: boolean; obraHabitualId: number | null },
) {
  await requireAdmin();
  await db.update(obreros)
    .set({
      categoriaId: datos.categoriaId,
      valorJornal: datos.valorJornal != null ? String(datos.valorJornal) : null,
      aliasCbu: datos.aliasCbu,
      habilitado: datos.habilitado,
      odooObraHabitualId: datos.obraHabitualId,
      actualizadoEn: sql`now()`,
    })
    .where(eq(obreros.id, id));
  revalidatePath("/obreros");
  revalidatePath("/carga");
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: el único error nuevo es en `obreros-tabla.tsx` (el caller de `guardarObrero` todavía no manda `obraHabitualId`). Se arregla en la Task 4. Si no querés ruido, seguí directo a la Task 4 y tipá todo junto.

- [ ] **Step 3: Commit**

```bash
git add src/actions/obreros.ts
git commit -m "feat(obreros): guardarObrero persiste obraHabitualId"
```

---

## Task 4: Diálogo de Obreros — select "Obra habitual" (admin)

**Files:**
- Modify: `src/app/obreros/page.tsx`
- Modify: `src/app/obreros/obreros-tabla.tsx`

- [ ] **Step 1: La page trae las obras y las baja con `obraHabitualId`**

En `src/app/obreros/page.tsx`:

Agregar imports arriba (junto a los existentes):

```ts
import { obtenerObras } from "@/lib/odoo/queries";
import { EMPRESA_BIMEG } from "@/lib/constantes";
```

Reemplazar la línea `const { obreros, categorias } = await listarObreros();` por:

```ts
  const [{ obreros, categorias }, obras] = await Promise.all([listarObreros(), obtenerObras(EMPRESA_BIMEG)]);
```

Reemplazar el `<ObrerosTabla ... />` por (suma `obras` y el campo `obraHabitualId` en el map):

```tsx
        <ObrerosTabla
          puedeEditar={esAdmin}
          obreros={obreros.map((o) => ({ id: o.id, nombre: o.nombre, categoriaId: o.categoriaId, valorJornal: o.valorJornal, aliasCbu: o.aliasCbu, habilitado: o.habilitado, obraHabitualId: o.odooObraHabitualId }))}
          categorias={categorias.map((c) => ({ id: c.id, nombre: c.nombre, valorJornal: c.valorJornal }))}
          obras={obras.map((o) => ({ id: o.id, nombre: o.nombre }))}
        />
```

- [ ] **Step 2: `ObreroRow` + props de la tabla**

En `src/app/obreros/obreros-tabla.tsx`:

Cambiar el tipo `ObreroRow` (línea 13) para sumar `obraHabitualId`:

```ts
type ObreroRow = { id: number; nombre: string; categoriaId: number | null; valorJornal: string | null; aliasCbu: string | null; habilitado: boolean; obraHabitualId: number | null };
type ObraLite = { id: number; nombre: string };
```

Cambiar la firma de `ObrerosTabla` (línea 22) para recibir `obras`:

```tsx
export function ObrerosTabla({ obreros, categorias, obras, puedeEditar = true }: { obreros: ObreroRow[]; categorias: CategoriaLite[]; obras: ObraLite[]; puedeEditar?: boolean }) {
```

- [ ] **Step 3: Pasar `obras` al diálogo**

En el mismo archivo, en el `<Dialog>` cerca del final, reemplazar el render de `EditarObrero` (línea 105):

```tsx
          {editObrero && <EditarObrero key={editObrero.id} obrero={editObrero} categorias={categorias} obras={obras} onListo={() => setEditId(null)} />}
```

- [ ] **Step 4: El select en `EditarObrero`**

En el mismo archivo, en `function EditarObrero(...)`:

Cambiar la firma (línea 137) para recibir `obras`:

```tsx
function EditarObrero({ obrero, categorias, obras, onListo }: { obrero: ObreroRow; categorias: CategoriaLite[]; obras: ObraLite[]; onListo: () => void }) {
```

Agregar el estado del select, junto a los otros `useState` (después de `const [habilitado, setHabilitado] = useState(obrero.habilitado);`):

```tsx
  const obraItems: Record<string, string> = { "": "— sin obra habitual —", ...Object.fromEntries(obras.map((o) => [String(o.id), o.nombre])) };
  const [obraHabitualId, setObraHabitualId] = useState(obrero.obraHabitualId != null ? String(obrero.obraHabitualId) : "");
```

En `onGuardar`, agregar el campo al objeto que se manda a `guardarObrero`:

```tsx
      await guardarObrero(obrero.id, {
        categoriaId: categoriaId ? Number(categoriaId) : null,
        valorJornal: valorJornal.trim() ? Number(valorJornal) : null,
        aliasCbu: aliasCbu.trim() ? aliasCbu.trim() : null,
        habilitado,
        obraHabitualId: obraHabitualId ? Number(obraHabitualId) : null,
      });
```

En el JSX, agregar el bloque del select justo después del `</div>` del bloque "Categoría" (antes del bloque "Jornal propio"):

```tsx
        <div className="grid gap-1.5">
          <Label>Obra habitual</Label>
          <Select items={obraItems} value={obraHabitualId} onValueChange={(v) => setObraHabitualId(v ?? "")}>
            <SelectTrigger className="w-full"><SelectValue placeholder="— sin obra habitual —" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">— sin obra habitual —</SelectItem>
              {obras.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Pre-carga Lun–Vie en /carga. Vacío = cada día arranca Ausente.</p>
        </div>
```

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores (el caller de `guardarObrero` ya manda `obraHabitualId`).

- [ ] **Step 6: Verificación manual**

1. `npm run dev`, entrar a `/obreros` como admin, abrir el lápiz de un obrero.
2. El diálogo muestra "Obra habitual" con la lista de obras. Elegir una y Guardar → toast "actualizado".
3. Reabrir el mismo obrero → el select conserva la obra elegida.
4. Elegir "— sin obra habitual —" y Guardar → vuelve a vacío al reabrir.

- [ ] **Step 7: Commit**

```bash
git add src/app/obreros/page.tsx src/app/obreros/obreros-tabla.tsx
git commit -m "feat(obreros): editar obra habitual en el dialogo"
```

---

## Task 5: Carga — pre-llenado por obra habitual

**Files:**
- Modify: `src/app/carga/page.tsx:14`
- Modify: `src/app/carga/carga-form.tsx`

- [ ] **Step 1: La page de carga baja `obraHabitualId`**

En `src/app/carga/page.tsx`, reemplazar la línea 14 (el `.map` de `obrerosLite`):

```tsx
  const obrerosLite = obreros.filter((o) => o.habilitado).map((o) => ({ id: o.id, nombre: o.nombre, dni: o.dni, obraHabitualId: o.odooObraHabitualId }));
```

- [ ] **Step 2: Tipo `ObreroLite` + import de `diasHabilesDeRango`**

En `src/app/carga/carga-form.tsx`:

Cambiar el tipo `ObreroLite` (línea 27):

```ts
type ObreroLite = { id: number; nombre: string; dni: string | null; obraHabitualId: number | null };
```

Agregar `diasHabilesDeRango` al import de `@/lib/calc` (línea 7), que queda:

```ts
import { horasEntre, rangoQuincena, HORAS_JORNAL, estadoCargaPorObrero, diasHabilesDeRango, type EstadoCargaObrero } from "@/lib/calc";
```

- [ ] **Step 3: Función `construirDiasPrefill`**

En el mismo archivo, agregar justo después de `construirDias` (después de su `}` de cierre, ~línea 62):

```ts
// Pre-llenado por obra habitual: Lun–Vie Presente@8h en esa obra; Sáb/Dom Ausente.
// Solo se usa cuando el obrero no tiene nada guardado en el período (primera carga).
function construirDiasPrefill(inicio: string, fin: string, obraHabitualId: number): DiaBorrador[] {
  const habiles = new Set(diasHabilesDeRango(inicio, fin));
  return diasDeRango(inicio, fin).map((fecha) =>
    habiles.has(fecha)
      ? { id: fecha, fecha, tipo: "trabajado", asignaciones: [{ obraId: obraHabitualId, desde: "", hasta: "", horas: HORAS_JORNAL }], comentario: "" }
      : { id: fecha, fecha, tipo: "ausente", asignaciones: [], comentario: "" },
  );
}
```

- [ ] **Step 4: Gating en el efecto de reapertura**

En el mismo archivo, en el primer `useEffect` (el que llama a `obtenerHorasGuardadas`, ~líneas 87-97), reemplazar el callback `.then(...)` por:

```ts
      .then((r) => { if (!cancel) {
        const habitual = obreros.find((o) => o.id === obreroId)?.obraHabitualId ?? null;
        cargarDias(r.filas.length === 0 && habitual != null
          ? construirDiasPrefill(inicio, fin, habitual)
          : construirDias(inicio, fin, r.filas));
        setCerrada(r.estado === "cerrada");
      } })
```

Y agregar `obreros` al array de dependencias de ese `useEffect`:

```ts
  }, [empresaId, obreroId, anio, mes, mitad, cargarDias, obreros]);
```

- [ ] **Step 5: Texto de ayuda según tenga o no obra habitual**

En el mismo archivo, agregar cerca de `const obreroNombre = ...` (línea 191) la obra habitual del obrero abierto:

```ts
  const obraHabitual = obreros.find((o) => o.id === obreroId)?.obraHabitualId ?? null;
```

Reemplazar el bloque del párrafo de ayuda (el `{obreroId ? (<p>…</p>) : (<p>…</p>)}`, ~líneas 235-241) por:

```tsx
      {obreroId ? (
        <p className="px-1 text-sm text-muted-foreground">
          Cargando <span className="font-medium text-foreground">{obreroNombre}</span> · {mitad}ª quincena de {MESES[mes - 1]} (días {rango.inicio.slice(8)}–{rango.fin.slice(8)}).{" "}
          {obraHabitual != null
            ? <>Viene pre-cargado <span className="font-medium text-foreground">Lun–Vie</span> en su obra habitual; corregí las excepciones (faltas, sábados, cambios de obra).</>
            : <>Cada día arranca como <span className="font-medium text-foreground">Ausente</span>; marcá los que estuvo Presente.</>}
        </p>
      ) : (
        <p className="px-1 text-sm text-muted-foreground">Elegí un obrero para cargar sus horas.</p>
      )}
```

- [ ] **Step 6: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores.

- [ ] **Step 7: Verificación manual**

Con `npm run dev`, en `/carga`:

1. **Obrero con obra habitual, sin cargar** → al abrirlo, Lun–Vie aparecen Presente con la obra habitual y 8 hs; Sáb/Dom Ausente. El footer muestra los días/hs pre-cargados y NO dice "sin guardar" (es sugerencia). Texto de ayuda: "Viene pre-cargado Lun–Vie…".
2. Apretar **Guardar** → toast con los movimientos. Reabrir el obrero → vuelve igual (ahora desde lo guardado).
3. **Obrero sin obra habitual** → al abrirlo, todos los días Ausente; texto "Cada día arranca como Ausente…".
4. **Obrero ya cargado a mano** (datos previos) → al abrirlo se reabre exactamente lo guardado, sin pisar con el pre-llenado.
5. **Limpiar** (con un obrero con obra habitual abierto) → deja todo Ausente y marca "sin guardar".
6. **Guardar y siguiente** → guarda el actual y salta al próximo sin cargar, que aparece pre-llenado si tiene obra habitual.

- [ ] **Step 8: Commit**

```bash
git add src/app/carga/page.tsx src/app/carga/carga-form.tsx
git commit -m "feat(carga): pre-llenado Lun-Vie por obra habitual"
```

---

## Task 6: Verificación final

**Files:** ninguno (solo corridas)

- [ ] **Step 1: Suite completa de tests**

Run: `npm test`
Expected: todo en verde (incluye los nuevos de `diasHabilesDeRango`).

- [ ] **Step 2: Lint + build**

Run: `npm run lint && npm run build`
Expected: sin errores ni warnings nuevos.

- [ ] **Step 3: Repaso del flujo completo end-to-end**

1. `/obreros` (admin): asignar obra habitual a 2-3 obreros, dejar 1 sin obra habitual.
2. `/carga`: recorrer con "Guardar y siguiente" — los que tienen obra habitual vienen pre-cargados, el sin obra habitual arranca Ausente.
3. Confirmar en `/saldos` que las horas guardadas del pre-llenado se reflejan (días/horas del obrero).

---

## Notas de implementación

- **Por qué el pre-llenado se marca limpio:** `cargarDias` setea `dirty: false`. El pre-llenado es un default (como cargar del server), no una edición. El combobox sigue mostrando "sin cargar" hasta que se guarda, y reabrir reproduce el mismo pre-llenado → no hay pérdida de datos ni falso "guardado".
- **`Limpiar` no pre-llena:** sigue llamando a `construirDias(rango.inicio, rango.fin, [])` (todo Ausente); no se toca esa función.
- **Sábado:** queda Ausente en el pre-llenado (`getDay()===6`); se marca a mano cuando se trabajó. Para cambiar la regla de días hábiles, es una línea en `diasHabilesDeRango`.
- **Trust boundary intacto:** los días pre-llenados son días `trabajado` con `horas: 8` y sin desde/hasta; `guardarHoras` los persiste igual que un día de 8 hs cargado a mano (confía en `horas` porque no hay rango horario).
