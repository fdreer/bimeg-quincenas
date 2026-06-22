# Habilitación de obreros + ajustes de carga/saldos — Diseño

> Estado del proyecto: [PROGRESS.md](PROGRESS.md). Decisiones tomadas en brainstorming 2026-06-22.
> Cuatro cambios chicos sobre archivos existentes. Sin dependencias ni abstracciones nuevas.

## Objetivo

1. Cada obrero tiene un estado **habilitado / deshabilitado**. Solo el admin lo cambia.
2. Solo se pueden **cargar horas a obreros habilitados**.
3. La **liquidación de saldos** muestra obreros habilitados *y* deshabilitados (los que tengan datos en la quincena).
4. **/carga abre sin obrero seleccionado** (hoy abre con el primero y ya carga sus horas).
5. El **select de quincenas en /saldos** muestra solo quincenas con datos, más reciente primero.
6. **/saldos no muestra el nombre de la base** (BIMEG B).

## Decisiones (brainstorming 2026-06-22)

- **Toggle habilitado:** un switch dentro del diálogo "Editar obrero" que ya existe en /obreros. Reusa `guardarObrero` (ya `requireAdmin`) y el modal. Sin toggle inline.
- **Deshabilitados en /carga:** se ocultan del buscador. No se muestran atenuados.
- **Quincenas en /saldos:** solo las que tienen horas cargadas; las quincenas vacías (creadas sin movimientos) no aparecen. El orden descendente ya existe.

## 1. Estado habilitado/deshabilitado

**Schema** ([db/schema.ts](../src/db/schema.ts)) — columna nueva en `obreros`:

```ts
habilitado: boolean("habilitado").notNull().default(true)
```

Migración drizzle `0004`. Los obreros existentes quedan `habilitado = true`.

**Admin lo edita en el diálogo "Editar obrero"** ([obreros-tabla.tsx](../src/app/obreros/obreros-tabla.tsx)):
- Un control "Estado" arriba de "Categoría" en `EditarObrero`. **Reusa el `Select` que el diálogo ya importa** con dos items (`Habilitado` / `Deshabilitado`) — no hay `switch` ni `checkbox` en `components/ui` y no se agrega ninguno. `habilitado` se deriva del valor elegido.
- `guardarObrero(id, { categoriaId, valorJornal, aliasCbu, habilitado })` — se suma `habilitado` al payload. La acción ya es `requireAdmin`; cero superficie nueva de permisos.
- `listarObreros` usa `db.select()` (estrella) → la columna nueva viaja sola; se agrega `habilitado` a los tipos `ObreroRow` que la vista pasa.

## 2. Solo se cargan horas a habilitados (dos capas)

- **UI** ([carga/page.tsx](../src/app/carga/page.tsx)): filtra `obreros.filter((o) => o.habilitado)` antes de mapear a `obrerosLite`. Los deshabilitados no llegan al buscador ni al roster.
- **Servidor — borde de confianza** ([actions/quincenas.ts](../src/actions/quincenas.ts), `guardarHoras`): además de validar la quincena, trae el obrero y `throw new Error("Obrero deshabilitado")` si `!habilitado`. No se confía en que la UI los ocultó.

## 3. /carga abre sin obrero seleccionado

Cambios en [carga-form.tsx](../src/app/carga/carga-form.tsx):

- `const [obreroId, setObreroId] = useState<number>(0)` — `0` = ninguno (antes `obreros[0]?.id ?? 0`).
- `useEffect` de horas: `if (!obreroId) { cargarDias([]); setCargando(false); return; }` → no consulta nada hasta elegir obrero.
- Grilla de días y texto "Cargando {obrero}…" se renderizan solo con obrero elegido. Sin obrero: un prompt *"Elegí un obrero para cargar sus horas."*
- El badge pendientes/cargados y el roster siguen visibles (no dependen del obrero abierto).
- Botones Guardar / Guardar y siguiente ya están `disabled={!obreroId}`; sin cambios.
- El combobox con `value={0}` ya resuelve a `null` (`obreros.find(o => o.id === 0) ?? null`) → muestra el placeholder. Sin cambios en `obrero-combobox.tsx`.

## 4. Saldos muestra habilitados y deshabilitados

`construirSaldos` ([actions/saldos.ts](../src/actions/saldos.ts)) ya arma la tabla por *quién tiene horas en la quincena*, sin mirar `habilitado`; un deshabilitado con datos ya aparece. Único agregado:

- `SaldoRow` lleva `habilitado: boolean` (sale de `obreroById`).
- En [saldos-tabla.tsx](../src/app/saldos/saldos-tabla.tsx), un badge gris **"deshabilitado"** al lado del nombre cuando `!habilitado`, para que se note por qué está en la lista. (Junto al badge "sin tarifa" que ya existe.)

## 5. Select de quincenas: solo con datos, descendente

[listarQuincenas](../src/actions/saldos.ts) ya ordena `desc(quincenas.fechaInicio)`. Se suma el filtro "solo con datos":

```ts
.where(and(
  eq(quincenas.odooEmpresaId, EMPRESA_BIMEG),
  inArray(quincenas.id, db.select({ id: horas.quincenaId }).from(horas)),
))
```

Esconde las quincenas creadas sin movimientos. El orden descendente se mantiene.

Borde: si la quincena de `?q=` ya no tiene datos, `page.tsx` ya cae al default `lista[0].id` (la más reciente con datos) porque valida `lista.some(q => String(q.id) === sp.q)`. Si `lista` queda vacía → empty state existente.

## 6. Sacar el nombre de la base (BIMEG B)

- [saldos-tabla.tsx](../src/app/saldos/saldos-tabla.tsx): borrar `<p>{empresaNombre}</p>` (queda solo el badge Borrador/Cerrada). Quitar la prop `empresaNombre`.
- [actions/saldos.ts](../src/actions/saldos.ts) `construirSaldos`: quitar `empresaNombre` del retorno y la llamada `obtenerEmpresas()` — solo servía para ese texto. Ahorra un viaje a Odoo.
- [saldos/page.tsx](../src/app/saldos/page.tsx): dejar de pasar `empresaNombre`.

## Archivos

```
src/
├─ db/schema.ts                   # + columna habilitado
├─ actions/obreros.ts             # guardarObrero acepta habilitado
├─ actions/quincenas.ts           # guardarHoras rechaza obrero deshabilitado
├─ actions/saldos.ts              # listarQuincenas filtra con datos; construirSaldos sin empresaNombre, + habilitado en fila
├─ app/obreros/obreros-tabla.tsx  # switch habilitado en el diálogo Editar
├─ app/carga/page.tsx             # filtra obreros habilitados
├─ app/carga/carga-form.tsx       # arranca sin obrero
├─ app/saldos/page.tsx            # no pasa empresaNombre
└─ app/saldos/saldos-tabla.tsx    # badge "deshabilitado"; saca nombre de base
drizzle/0004_*.sql                # migración de la columna
```

## Tests

- `guardarHoras` rechaza un obrero deshabilitado — único camino con lógica de seguridad. Sigue el patrón de los tests existentes (`smoke.test.ts` / `calc.test.ts`); si depende de DB, se cubre con un assert mínimo o verificación en `pnpm build` + smoke manual como las otras actions.
- Resto: `pnpm build` + smoke manual contra datos reales.

## Fuera de alcance

- Bulk enable/disable (toggle inline en la fila) — descartado, el diálogo alcanza.
- Mostrar deshabilitados atenuados en /carga — descartado, se ocultan.
- Cualquier refactor no relacionado.
