# Carga rápida: barra de bulk-apply + aplicar a cuadrilla — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Acelerar la carga de una quincena con (a) una barra que aplica "obra + horas" a un set de días del obrero abierto (borrador), y (b) "Aplicar a más obreros" que repite ese mismo patrón sobre una cuadrilla, rellenando solo días vacíos y persistiendo directo.

**Architecture:** Dos funciones puras nuevas en `calc.ts` (`semanasDeQuincena` para los presets de días, `fechasARellenar` para el anti-pisado). Una acción de store (`aplicarABloque`) escribe el bulk en el borrador del obrero abierto. Una server action (`aplicarHorasEnLote`) persiste el patrón para la cuadrilla, insertando solo en fechas sin fila previa. La UI nueva (barra + diálogo de cuadrilla) vive en `carga-form.tsx`.

**Tech Stack:** Next.js 16 (App Router, server actions), Drizzle ORM + Postgres, Zustand, date-fns, Vitest (entorno node, solo funciones puras), Base UI / shadcn, Zod.

**Spec:** `docs/superpowers/specs/2026-06-23-carga-barra-rapida-design.md`

---

## Mapa de archivos

| Archivo | Qué hace | Cambio |
|---|---|---|
| `src/lib/calc.ts` | Cálculos puros | + `semanasDeQuincena(inicio, fin)` y `fechasARellenar(objetivo, yaGuardadas)` |
| `src/lib/calc.test.ts` | Tests puros | + tests de ambas funciones |
| `src/store/carga-store.ts` | Store de carga (Zustand) | + acción `aplicarABloque(fechas, asignacion)` |
| `src/actions/quincenas.ts` | Server actions de quincenas | + `aplicarHorasEnLote(...)` |
| `src/app/carga/carga-form.tsx` | Form de carga | + barra de carga rápida (Task 5) + diálogo "Aplicar a más obreros" (Task 6) |

Orden de tareas: 1 (`semanasDeQuincena`, TDD) → 2 (`fechasARellenar`, TDD) → 3 (store) → 4 (server action) → 5 (barra UI) → 6 (diálogo cuadrilla) → 7 (verificación final).

**Cada tarea cierra con typecheck/build verde** (la cuadrilla entera vive en la Task 6 para no dejar imports/estado sin usar en la Task 5).

---

## Task 1: Función pura `semanasDeQuincena` (TDD)

**Files:**
- Modify: `src/lib/calc.ts`
- Test: `src/lib/calc.test.ts`

- [ ] **Step 1: Escribir el test que falla**

En `src/lib/calc.test.ts`, agregar `semanasDeQuincena` al import existente de `./calc` (la línea 2, `import { ... } from "./calc";`) y agregar al final del archivo:

```ts
test("semanasDeQuincena: 2ª quincena junio 2026 → 3 semanas Lun–Vie", () => {
  expect(semanasDeQuincena("2026-06-16", "2026-06-30")).toEqual([
    ["2026-06-16", "2026-06-17", "2026-06-18", "2026-06-19"], // Mar–Vie (semana parcial)
    ["2026-06-22", "2026-06-23", "2026-06-24", "2026-06-25", "2026-06-26"], // Lun–Vie
    ["2026-06-29", "2026-06-30"], // Lun–Mar (semana parcial)
  ]);
});
test("semanasDeQuincena: 1ª quincena (1–15) arranca en Lunes y excluye el finde", () => {
  const s = semanasDeQuincena("2026-06-01", "2026-06-15"); // 2026-06-01 es Lunes
  expect(s[0][0]).toBe("2026-06-01");
  expect(s.flat()).not.toContain("2026-06-06"); // sábado
  expect(s.flat()).not.toContain("2026-06-07"); // domingo
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- calc`
Expected: FAIL — `semanasDeQuincena is not a function` (o error de import).

- [ ] **Step 3: Implementar la función**

En `src/lib/calc.ts`, agregar justo después de `diasHabilesDeRango` (después de su `}` de cierre):

```ts
/**
 * Divide la quincena en semanas calendario, cada una con sus días Lun–Vie ("yyyy-MM-dd").
 * Una semana nueva arranca cada Lunes. Alimenta los presets "por semana" del bulk de /carga.
 */
export function semanasDeQuincena(inicio: string, fin: string): string[][] {
  const out: string[][] = [];
  for (const fecha of diasHabilesDeRango(inicio, fin)) {
    if (out.length === 0 || parseISO(fecha).getDay() === 1) out.push([fecha]);
    else out[out.length - 1].push(fecha);
  }
  return out;
}
```

(`parseISO` ya está importado de date-fns; `diasHabilesDeRango` ya existe en este archivo.)

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm test -- calc`
Expected: PASS (los nuevos tests + los existentes de calc en verde).

- [ ] **Step 5: Commit**

```bash
git add src/lib/calc.ts src/lib/calc.test.ts
git commit -m "feat(calc): semanasDeQuincena (Lun-Vie por semana de una quincena)"
```

---

## Task 2: Función pura `fechasARellenar` (TDD)

**Files:**
- Modify: `src/lib/calc.ts`
- Test: `src/lib/calc.test.ts`

- [ ] **Step 1: Escribir el test que falla**

En `src/lib/calc.test.ts`, agregar `fechasARellenar` al import de `./calc` y agregar al final del archivo:

```ts
test("fechasARellenar: solo las fechas objetivo que no están ya guardadas", () => {
  expect(fechasARellenar(["2026-06-16", "2026-06-17", "2026-06-18"], ["2026-06-17"]))
    .toEqual(["2026-06-16", "2026-06-18"]);
});
test("fechasARellenar: si todas están guardadas, devuelve vacío", () => {
  expect(fechasARellenar(["2026-06-16"], ["2026-06-16", "2026-06-22"])).toEqual([]);
});
test("fechasARellenar: sin guardadas, devuelve el objetivo entero", () => {
  expect(fechasARellenar(["2026-06-16", "2026-06-17"], [])).toEqual(["2026-06-16", "2026-06-17"]);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- calc`
Expected: FAIL — `fechasARellenar is not a function`.

- [ ] **Step 3: Implementar la función**

En `src/lib/calc.ts`, agregar justo después de `semanasDeQuincena`:

```ts
/**
 * Anti-pisado del bulk de cuadrilla: de las fechas objetivo, devuelve solo las que NO
 * están en yaGuardadas. Garantiza que aplicar a una cuadrilla nunca borre carga existente.
 */
export function fechasARellenar(objetivo: string[], yaGuardadas: string[]): string[] {
  const ocupadas = new Set(yaGuardadas);
  return objetivo.filter((f) => !ocupadas.has(f));
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm test -- calc`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/calc.ts src/lib/calc.test.ts
git commit -m "feat(calc): fechasARellenar (anti-pisado del bulk de cuadrilla)"
```

---

## Task 3: Acción de store `aplicarABloque`

**Files:**
- Modify: `src/store/carga-store.ts`

- [ ] **Step 1: Agregar la acción al tipo `CargaState`**

En `src/store/carga-store.ts`, dentro de `type CargaState = { ... }`, agregar la firma después de `quitarObra: (diaId: string, i: number) => void;`:

```ts
  quitarObra: (diaId: string, i: number) => void;
  aplicarABloque: (fechas: string[], asignacion: Asignacion) => void; // bulk: setea esos días como Presente con una sola obra
```

- [ ] **Step 2: Implementar la acción**

En el `create<CargaState>(...)`, agregar la implementación después de la de `quitarObra` (después de su `}))),`):

```ts
  aplicarABloque: (fechas, asignacion) => set((s) => {
    const set_ = new Set(fechas);
    return {
      dias: s.dias.map((d) => set_.has(d.fecha)
        ? { ...d, tipo: "trabajado", asignaciones: [{ ...asignacion }], comentario: "" }
        : d),
      dirty: true, // es una edición explícita (a diferencia del prefill, que carga limpio)
    };
  }),
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos (la acción es self-contained; todavía nadie la usa).

- [ ] **Step 4: Commit**

```bash
git add src/store/carga-store.ts
git commit -m "feat(carga): store aplicarABloque (bulk a un set de dias)"
```

---

## Task 4: Server action `aplicarHorasEnLote`

**Files:**
- Modify: `src/actions/quincenas.ts`

- [ ] **Step 1: Ajustar imports**

En `src/actions/quincenas.ts`:

Cambiar la línea de drizzle (línea 6) para sumar `inArray`:

```ts
import { and, eq, inArray } from "drizzle-orm";
```

Cambiar el import de `@/lib/calc` (línea 4) para sumar `fechasARellenar`:

```ts
import { rangoQuincena, horasEntre, estadoCargaPorObrero, fechasARellenar, type EstadoCargaObrero } from "@/lib/calc";
```

Agregar el import de `revalidatePath` (debajo del import de `zod`, línea 7):

```ts
import { revalidatePath } from "next/cache";
```

- [ ] **Step 2: Agregar la server action**

En `src/actions/quincenas.ts`, al final del archivo, agregar:

```ts
const AplicarLote = z.object({
  empresaId: z.number().int(),
  anio: z.number().int(),
  mes: z.number().int(),
  mitad: z.union([z.literal(1), z.literal(2)]),
  obreroIds: z.array(z.number().int()).min(1),
  obraId: z.number().int(),
  horas: z.number().min(0).max(24),
  fechas: z.array(z.string()).min(1),
});

// Cuadrilla: aplica "obra + horas" a varios obreros en las fechas dadas, RELLENANDO SOLO
// días vacíos (nunca pisa carga existente). Persiste directo. Devuelve cuántos se aplicó/saltó.
export async function aplicarHorasEnLote(input: z.infer<typeof AplicarLote>) {
  await requireUser();
  const d = AplicarLote.parse(input);
  const q = await asegurarQuincena(d.empresaId, d.anio, d.mes, d.mitad);
  if (q.estado === "cerrada") throw new Error("Quincena cerrada: no se pueden modificar las horas");
  // Solo obreros habilitados de los seleccionados.
  const habil = await db.select({ id: obreros.id }).from(obreros)
    .where(and(inArray(obreros.id, d.obreroIds), eq(obreros.habilitado, true)));
  const ids = habil.map((o) => o.id);
  let aplicados = 0, saltados = 0;
  for (const obreroId of ids) {
    const existentes = await db.select({ fecha: horas.fecha }).from(horas)
      .where(and(eq(horas.quincenaId, q.id), eq(horas.obreroId, obreroId)));
    const aRellenar = fechasARellenar(d.fechas, existentes.map((e) => e.fecha));
    saltados += d.fechas.length - aRellenar.length;
    if (aRellenar.length) {
      await db.insert(horas).values(aRellenar.map((fecha) => ({
        quincenaId: q.id, obreroId, tipo: "trabajado",
        odooObraId: d.obraId, fecha, desde: null, hasta: null,
        // Sin desde/hasta: se confía en `horas` (mismo borde que guardarHoras).
        horas: String(d.horas), comentario: null,
      })));
      aplicados += aRellenar.length;
    }
  }
  revalidatePath("/carga");
  return { obreros: ids.length, aplicados, saltados };
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores (la action es self-contained; usa `fechasARellenar` de la Task 2).

- [ ] **Step 4: Commit**

```bash
git add src/actions/quincenas.ts
git commit -m "feat(carga): aplicarHorasEnLote (cuadrilla, solo rellena dias vacios)"
```

---

## Task 5: Barra de carga rápida (obrero abierto)

**Files:**
- Modify: `src/app/carga/carga-form.tsx`

> Esta tarea agrega SOLO la barra (sin cuadrilla). La cuadrilla entera va en la Task 6.

- [ ] **Step 1: Imports y destructure del store**

En `src/app/carga/carga-form.tsx`:

Sumar `semanasDeQuincena` al import de `@/lib/calc` (línea 7):

```ts
import { horasEntre, rangoQuincena, HORAS_JORNAL, estadoCargaPorObrero, diasHabilesDeRango, semanasDeQuincena, type EstadoCargaObrero } from "@/lib/calc";
```

Sumar `aplicarABloque` al destructure de `useCargaStore` (línea 90):

```ts
  const { dias, dirty, cargarDias, marcarLimpio, marcarSucio, editarDia, editarAsignacion, agregarObra, quitarObra, aplicarABloque } = useCargaStore();
```

- [ ] **Step 2: Estado de la barra + default de obra**

Agregar, junto a los otros `useState` (después de `const [estado, setEstado] = ...`, línea 89):

```ts
  // Barra de carga rápida (bulk).
  const [barObraId, setBarObraId] = useState<string>("");
  const [barHoras, setBarHoras] = useState("8");
  const [barDiaSet, setBarDiaSet] = useState("lunvie");
```

Agregar este efecto justo después del segundo `useEffect` (el de `obtenerEstadoCarga`, el que termina en `}, [empresaId, anio, mes, mitad]);`):

```ts
  // Al abrir un obrero, la barra arranca con su obra habitual (si tiene).
  useEffect(() => {
    const h = obreros.find((o) => o.id === obreroId)?.obraHabitualId ?? null;
    setBarObraId(h != null ? String(h) : "");
  }, [obreroId, obreros]);
```

- [ ] **Step 3: Derivados de la barra (sets de días)**

Agregar después de `const obraHabitual = obreros.find((o) => o.id === obreroId)?.obraHabitualId ?? null;` (la línea que agregó el prefill, cerca de `const obreroNombre = ...`):

```ts
  // Presets de "Días" de esta quincena: Lun–Vie, cada semana suelta, y toda la quincena.
  const diaSets: { key: string; label: string; fechas: string[] }[] = [
    { key: "lunvie", label: "Lun–Vie (toda la quincena)", fechas: diasHabilesDeRango(rango.inicio, rango.fin) },
    ...semanasDeQuincena(rango.inicio, rango.fin).map((dias, i) => ({
      key: `sem-${i}`,
      label: `Sem ${dias[0].slice(8)}–${dias[dias.length - 1].slice(8)}`,
      fechas: dias,
    })),
    { key: "toda", label: "Toda la quincena (incl. sáb/dom)", fechas: diasDeRango(rango.inicio, rango.fin) },
  ];
  const fechasDelSet = diaSets.find((s) => s.key === barDiaSet)?.fechas ?? [];
  const barHorasNum = Number(barHoras) || 0;
  const barListo = !!barObraId && fechasDelSet.length > 0 && barHorasNum > 0;

  function aplicarBarra() {
    if (!barListo) return;
    aplicarABloque(fechasDelSet, { obraId: Number(barObraId), desde: "", hasta: "", horas: barHorasNum });
  }
```

- [ ] **Step 4: La barra en el JSX**

Agregar el bloque de la barra justo **después** del bloque del aviso de quincena cerrada (el `{cerrada && (<p>…</p>)}`) y **antes** del bloque `{!!obreroId && (cargando ? ( … ) : ( … ))}` que renderiza la grilla de días:

```tsx
      {!!obreroId && !cerrada && !cargando && (
        <Card size="sm">
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5 flex-1 min-w-[10rem]">
              <Label>Carga rápida · Obra</Label>
              <Select items={obraItems} value={barObraId || null} onValueChange={(v) => setBarObraId(v ?? "")}>
                <SelectTrigger className="w-full"><SelectValue placeholder="— elegir obra —" /></SelectTrigger>
                <SelectContent>{obras.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5 w-20">
              <Label>Horas</Label>
              <Input type="number" inputMode="decimal" step="0.5" value={barHoras} onChange={(e) => setBarHoras(e.target.value)} />
            </div>
            <div className="grid gap-1.5 flex-1 min-w-[9rem]">
              <Label>Días</Label>
              <Select items={Object.fromEntries(diaSets.map((s) => [s.key, s.label]))} value={barDiaSet} onValueChange={(v) => setBarDiaSet(v ?? "lunvie")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{diaSets.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={aplicarBarra} disabled={!barListo}>Aplicar</Button>
          </CardContent>
        </Card>
      )}
```

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores (todo lo declarado se usa dentro de esta tarea).

- [ ] **Step 6: Verificación manual**

Con `npm run dev`, en `/carga`:
1. Abrí un obrero sin datos en un período. La barra muestra Obra (default = su obra habitual si tiene), Horas (8) y Días.
2. Elegí "Lun–Vie" → Aplicar → todos los Lun–Vie quedan Presente con esa obra y 8 hs; aparece "sin guardar". Guardar persiste.
3. Probá rotación: "Sem 16–19" → obra A → Aplicar; "Sem 22–26" → obra B → Aplicar. Quedan dos tramos en obras distintas.
4. Con la quincena cerrada, la barra no aparece.

- [ ] **Step 7: Commit**

```bash
git add src/app/carga/carga-form.tsx
git commit -m "feat(carga): barra de carga rapida (bulk por obrero)"
```

---

## Task 6: Diálogo "Aplicar a más obreros" (cuadrilla)

**Files:**
- Modify: `src/app/carga/carga-form.tsx`

- [ ] **Step 1: Imports de la cuadrilla**

En `src/app/carga/carga-form.tsx`:

Sumar `aplicarHorasEnLote` al import de `@/actions/quincenas` (línea 6):

```ts
import { asegurarQuincena, guardarHoras, obtenerHorasGuardadas, obtenerEstadoCarga, aplicarHorasEnLote } from "@/actions/quincenas";
```

Agregar el import de los componentes de Dialog (debajo del import de Select, línea 14):

```ts
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
```

- [ ] **Step 2: Estado de la cuadrilla**

Agregar junto al estado de la barra (después de `const [barDiaSet, setBarDiaSet] = useState("lunvie");`):

```ts
  // Diálogo de cuadrilla.
  const [crewOpen, setCrewOpen] = useState(false);
  const [crewIds, setCrewIds] = useState<number[]>([]);
  const [aplicandoLote, setAplicandoLote] = useState(false);
```

- [ ] **Step 3: Derivado + función de aplicar a la cuadrilla**

Agregar después de `function aplicarBarra() { ... }` (la que agregó la Task 5):

```ts
  const barObraNombre = obras.find((o) => String(o.id) === barObraId)?.nombre ?? "—";

  async function aplicarACuadrilla() {
    if (!barListo || crewIds.length === 0) return;
    setAplicandoLote(true);
    try {
      const r = await aplicarHorasEnLote({
        empresaId, anio, mes, mitad,
        obreroIds: crewIds, obraId: Number(barObraId), horas: barHorasNum, fechas: fechasDelSet,
      });
      toast.success(`Aplicado a ${r.obreros} obrero${r.obreros === 1 ? "" : "s"}${r.saltados ? ` · ${r.saltados} día(s) saltado(s) por ya tener carga` : ""}`);
      const e = await obtenerEstadoCarga(empresaId, anio, mes, mitad); // refresca el roster "sin cargar"
      setEstado(e);
      setCrewOpen(false);
      setCrewIds([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo aplicar a la cuadrilla.");
    } finally {
      setAplicandoLote(false);
    }
  }
```

- [ ] **Step 4: El botón "Aplicar a más obreros…" en la barra**

En el JSX de la barra (Task 5, Step 4), agregar el botón justo **después** del `<Button … onClick={aplicarBarra}>Aplicar</Button>`:

```tsx
            <Button variant="outline" onClick={aplicarBarra} disabled={!barListo}>Aplicar</Button>
            <Button variant="ghost" onClick={() => setCrewOpen(true)} disabled={!barListo}>Aplicar a más obreros…</Button>
```

- [ ] **Step 5: El diálogo en el JSX**

Agregar el `<Dialog>` justo **antes** del `</div>` final que cierra el árbol devuelto por el componente (después del `</div>` de la barra fija/sticky footer):

```tsx
      <Dialog open={crewOpen} onOpenChange={setCrewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aplicar a más obreros</DialogTitle>
            <DialogDescription>{barObraNombre} · {barHorasNum} hs · {fechasDelSet.length} día(s). Solo se rellenan días vacíos.</DialogDescription>
          </DialogHeader>
          <div className="flex max-h-72 flex-col gap-2 overflow-auto">
            {obreros.filter((o) => o.id !== obreroId).map((o) => (
              <label key={o.id} className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 cursor-pointer accent-primary"
                  checked={crewIds.includes(o.id)}
                  onChange={(e) => setCrewIds((prev) => e.target.checked ? [...prev, o.id] : prev.filter((id) => id !== o.id))}
                />
                {o.nombre}
              </label>
            ))}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost">Cancelar</Button>} />
            <Button onClick={() => void aplicarACuadrilla()} disabled={aplicandoLote || crewIds.length === 0}>
              {aplicandoLote && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
              Aplicar a {crewIds.length}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
```

- [ ] **Step 6: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores.

- [ ] **Step 7: Verificación manual**

Con `npm run dev`, en `/carga`:
1. Abrí un obrero, configurá la barra (obra, 8 hs, Lun–Vie). Tocá "Aplicar a más obreros…".
2. El diálogo lista los otros obreros habilitados (no al abierto). Tildá 2-3 → "Aplicar a N".
3. Toast: "Aplicado a N obreros · M día(s) saltado(s)…" si alguno ya tenía carga esos días. El contador "sin cargar" baja.
4. Abrí uno de los obreros de la cuadrilla → tiene esos días cargados con esa obra. Un obrero que YA tenía un día cargado conserva ese día (no lo pisó).

- [ ] **Step 8: Commit**

```bash
git add src/app/carga/carga-form.tsx
git commit -m "feat(carga): aplicar a mas obreros (cuadrilla)"
```

---

## Task 7: Verificación final

**Files:** ninguno (solo corridas)

- [ ] **Step 1: Suite de tests**

Run: `npm test`
Expected: verde, incluye los nuevos de `semanasDeQuincena` y `fechasARellenar`.

- [ ] **Step 2: Lint + build**

Run: `npm run lint && npm run build`
Expected: sin errores ni warnings nuevos (los `no-explicit-any` de `queries.ts` y el `set-state-in-effect` del `if (!obreroId)` son pre-existentes).

- [ ] **Step 3: Repaso end-to-end**

1. Un obrero: Lun–Vie en una obra con la barra → Guardar.
2. Rotación: dos semanas en dos obras → Guardar.
3. Cuadrilla: aplicar a 3 obreros, confirmar que solo rellenó vacíos y reportó saltados.
4. `/saldos`: las horas aplicadas (barra y cuadrilla) se reflejan en días/horas de los obreros.

---

## Notas de implementación

- **Barra = borrador; cuadrilla = directo.** La barra escribe en el store (`dirty:true`) y se persiste con Guardar (revisable). La cuadrilla persiste en el acto pero **solo rellena días vacíos** (`fechasARellenar`), así que nunca borra carga existente.
- **Borde de confianza intacto.** Las filas de cuadrilla son `trabajado` con `horas` y sin `desde/hasta`; `aplicarHorasEnLote` guarda `String(horas)` igual que `guardarHoras` para un jornal sin rango horario.
- **Días partidos / multi-obra:** se siguen editando por día (la barra solo hace el caso común "1 obra, día completo").
- **Reusos:** `obraItems` y `diasDeRango` ya existen en `carga-form.tsx`; `diasHabilesDeRango` ya está importado. La barra reusa todo eso.
