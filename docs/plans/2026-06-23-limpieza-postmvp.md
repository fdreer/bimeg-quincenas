# Handoff — Limpieza post-MVP (BIMEG Quincenas)

> Pasale este archivo a una sesión nueva. Es autocontenido: tiene contexto, los cambios
> exactos con archivos/líneas, código de referencia y cómo verificar. Hacé los bloques en
> orden. **A** es seguro y sin riesgo; **B** cambia implementación pero no comportamiento;
> **C** son decisiones; **D** NO se toca ahora.

## Contexto del proyecto

App interna de BIMEG para cargar horas de obreros por quincena, liquidar saldos y registrar
comprobantes en Odoo. Stack: **Next.js 16 (App Router) + React 19 + Drizzle/Postgres (Supabase)
+ better-auth + Odoo vía JSON-RPC**. Zustand para el estado del form de carga. Tailwind v4 +
componentes shadcn sobre `@base-ui/react`. Tests con Vitest.

- Lógica de negocio pura y testeada: [src/lib/calc.ts](../../src/lib/calc.ts) (40 tests pasan).
- Server actions en `src/actions/*` — todas con `requireUser`/`requireAdmin`.
- Integración Odoo en `src/lib/odoo/*`.

**Antes de empezar**, dejá una baseline verde:
```bash
npx vitest run        # 40 tests pasan
npx tsc --noEmit      # sin errores
npm run lint
```

---

## Bloque A — Limpieza segura (sin cambio de comportamiento)

### A1. Quitar dependencias sin usar

Evidencia (verificá vos mismo antes de borrar):
```bash
grep -rn "react-table"  src/   # → 0 resultados
grep -rn "date-picker\|components/ui/calendar" src/   # → solo la def de date-picker.tsx
```

En [package.json](../../package.json) `dependencies`, **eliminar**:
- `@tanstack/react-table` — 0 imports en todo `src/`.
- `react-day-picker` — único consumidor es `ui/calendar.tsx`, que solo lo usa `date-picker.tsx`, que **no importa nadie** (cadena muerta, ver A2).
- `shadcn` — es el CLI de scaffolding, se corre con `npx`. No va en `dependencies` (ni en `devDependencies`).

### A2. Borrar código muerto

- Borrar `src/components/date-picker.tsx` (no lo importa ningún archivo).
- Borrar `src/components/ui/calendar.tsx` (solo lo usaba date-picker).

> Si pensás usar un selector de fecha suelto pronto, dejá A2 sin tocar y en A1 conservá
> `react-day-picker`. Por ahora es peso muerto.

### A3. Reinstalar y verificar
```bash
pnpm install          # el repo usa pnpm (hay pnpm-lock.yaml)
npx tsc --noEmit && npx vitest run && npm run lint
```
**Criterio de aceptación:** todo verde, sin imports rotos. El diff es ~5 líneas de
package.json + 2 archivos borrados.

---

## Bloque B — Backend: colapsar N+1 a 2 queries (comportamiento idéntico)

### B1. `aplicarHorasEnLote` — 1 SELECT + 1 INSERT

Archivo: [src/actions/quincenas.ts](../../src/actions/quincenas.ts), función `aplicarHorasEnLote`
(~línea 98). Hoy hace, dentro de un loop por obrero: 1 `SELECT` de fechas existentes + 1
`INSERT`. Con N obreros son `2N` round-trips. Reemplazar el bloque del loop por:

```ts
const ids = habil.map((o) => o.id);

// Una sola query: fechas ya cargadas de TODOS los obreros del lote.
const existentes = ids.length
  ? await db.select({ obreroId: horas.obreroId, fecha: horas.fecha }).from(horas)
      .where(and(eq(horas.quincenaId, q.id), inArray(horas.obreroId, ids)))
  : [];
const fechasPorObrero = new Map<number, string[]>();
for (const e of existentes)
  (fechasPorObrero.get(e.obreroId) ?? fechasPorObrero.set(e.obreroId, []).get(e.obreroId)!).push(e.fecha);

let aplicados = 0, saltados = 0;
const aInsertar: typeof horas.$inferInsert[] = [];
for (const obreroId of ids) {
  const aRellenar = fechasARellenar(d.fechas, fechasPorObrero.get(obreroId) ?? []);
  saltados += d.fechas.length - aRellenar.length;
  for (const fecha of aRellenar)
    aInsertar.push({
      quincenaId: q.id, obreroId, tipo: "trabajado",
      odooObraId: d.obraId, fecha, desde: null, hasta: null,
      horas: String(d.horas), comentario: null,
    });
  aplicados += aRellenar.length;
}
if (aInsertar.length) await db.insert(horas).values(aInsertar);

revalidatePath("/carga");
return { obreros: ids.length, aplicados, saltados };
```

`inArray` ya está importado en el archivo. El anti-pisado (`fechasARellenar`, solo rellena días
vacíos) se mantiene intacto.

### B2. `cerrarQuincena` — un INSERT multi-fila

Archivo: [src/actions/cierre.ts](../../src/actions/cierre.ts), función `cerrarQuincena` (~línea 39).
Hoy hace `tx.insert(...).onConflictDoUpdate(...)` por obrero dentro de la transacción.
Reemplazar el `for` dentro de `db.transaction` por un único insert:

```ts
await db.transaction(async (tx) => {
  const rows = obreroIds
    .map((obreroId) => {
      const o = obreroById.get(obreroId);
      if (!o) return null;
      return {
        quincenaId, obreroId,
        valorJornal: String(jornalDe(obreroId)),
        adelantos: String(adelantoPorContacto.get(o.odooContactoId) ?? 0),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length)
    await tx.insert(liquidaciones).values(rows).onConflictDoUpdate({
      target: [liquidaciones.quincenaId, liquidaciones.obreroId],
      set: { valorJornal: sql`excluded.valor_jornal`, adelantos: sql`excluded.adelantos` },
    });

  await tx.update(quincenas).set({ estado: "cerrada", cerradaEn: sql`now()` }).where(eq(quincenas.id, quincenaId));
});
```

`sql` ya está importado. Verificá los nombres de columna en `excluded` contra el esquema
([src/db/schema.ts](../../src/db/schema.ts) → tabla `liquidaciones`): `valor_jornal`, `adelantos`.

### B3. Verificación de B

No hay tests de integración con DB en el repo, así que la garantía es:
1. `npx tsc --noEmit` limpio.
2. **Prueba manual con DB de dev**: cargar una cuadrilla de 2-3 obreros con días mezclados
   (algunos ya cargados) → confirmar que `aplicados`/`saltados` dan igual que antes y que NO
   se pisó carga existente. Cerrar una quincena con varios obreros → confirmar que se crean
   las liquidaciones con jornal y adelantos correctos, y que reabrir/recerrar es idempotente.

> Si querés red de seguridad real, antes de B agregá un test de `fechasARellenar` y de
> `jornalEfectivo` (son puras) — pero el cálculo no cambia en este bloque, solo el número de
> queries. YAGNI salvo que quieras el seguro.

---

## Bloque C — Decisiones (no obvias; elegí vos)

### C1. `next-themes` / dark mode — está a medias
Las clases `dark:` están por toda la UI pero **nada las activa**: no hay `ThemeProvider` y el
`Toaster` en [layout.tsx](../../src/app/layout.tsx) está hardcodeado `theme="light"` (ese prop
pisa al `useTheme()` de [ui/sonner.tsx](../../src/components/ui/sonner.tsx) vía `{...props}`).
Dos caminos:
- **Quitar** `next-themes` de `dependencies` y sacar `useTheme` de `sonner.tsx` (dejar
  `theme="light"` fijo). Las clases `dark:` quedan inertes pero inocuas. Diff chico.
- **Cablear** dark mode: `ThemeProvider` en layout + toggle en el Nav. Más trabajo; solo si
  lo querés como feature.

Recomendación lazy: la primera. No hay dark mode hoy, no lo finjas.

### C2. Util de formato de moneda (marginal)
`new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })`
se reconstruye en [saldos-tabla.tsx](../../src/app/saldos/saldos-tabla.tsx) y
[comprobantes.ts](../../src/actions/comprobantes.ts). Un `src/lib/money.ts` de 1 línea lo
unifica. Hacelo solo si vas a tocar esos archivos igual.

### C3. `smoke.test.ts` (trivial)
[src/lib/smoke.test.ts](../../src/lib/smoke.test.ts) es `expect(1+1).toBe(2)`. Borralo si
molesta; es inocuo.

---

## Bloque D — NO hacer ahora (anotado para el futuro)

`guardarHoras` ([quincenas.ts](../../src/actions/quincenas.ts)) valida con zod y re-deriva las
horas en el server (bien), pero **no verifica que `obraId` exista ni que `fecha` caiga dentro de
la quincena**. Un usuario autenticado podría insertar horas con fecha/obra arbitrarias.
**Riesgo real hoy ≈ nulo**: herramienta interna, usuarios por whitelist de email, 2-3 admins.
Si algún día abrís el acceso a más gente, ahí agregás la validación. No antes.

---

## Resumen de qué tocar

| Bloque | Archivos | Riesgo |
|--------|----------|--------|
| A1 | `package.json` | nulo |
| A2 | borrar `date-picker.tsx`, `ui/calendar.tsx` | nulo |
| B1 | `src/actions/quincenas.ts` | bajo (verificar manual) |
| B2 | `src/actions/cierre.ts` | bajo (verificar manual) |
| C1 | `package.json`, `ui/sonner.tsx` | decisión |
| C2 | `lib/money.ts` (nuevo) + 2 archivos | opcional |
| C3 | borrar `smoke.test.ts` | nulo |

**Gate final:** `npx tsc --noEmit && npx vitest run && npm run lint` verde + prueba manual de B.
