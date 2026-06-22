# Pre-llenado de carga por obra habitual

**Fecha:** 2026-06-22
**Estado:** aprobado (diseño)
**Alcance:** solo "A" (obra habitual + pre-llenado). "B" (copiar período anterior) queda diferido.

## Problema

La página `/carga` está orientada **obrero → días** y cada día arranca en **Ausente**.
En una constructora la norma es que el obrero trabajó, así que el jefe pelea contra el
caso común: por cada día presente abre el select Ausente→Presente y elige la obra
(~4 interacciones × ~13 días hábiles ≈ 50 clicks por obrero, × ~20 obreros ≈ 1000 por
quincena). La señal real —ausencias y cambios de obra— es chica; el form la cobra igual
que el caso normal.

## Solución

Cada obrero tiene una **obra habitual**. Al abrir un obrero **sin datos guardados** en la
quincena, su grilla viene **pre-llenada Lun–Vie como Presente · 8 hs · su obra habitual**
(Sáb y Dom Ausentes). El jefe corrige solo las excepciones y guarda. Obrero normal = 0
ediciones.

El pre-llenado es una **sugerencia**: vive en el borrador en memoria (marcado *limpio*),
se ve con sus totales en pantalla y recién se persiste al apretar Guardar / Guardar y
siguiente. No se escribe nada que el usuario no haya confirmado.

## Comportamiento (reglas)

| Situación del obrero al abrirlo | Resultado |
|---|---|
| Sin filas guardadas **y** con obra habitual | Pre-llenado Lun–Vie Presente@8h@habitual; Sáb/Dom Ausente |
| Sin filas guardadas **y** sin obra habitual | Todo Ausente (comportamiento actual) |
| Con filas guardadas (ya "cargado") | Se reabre exactamente lo guardado, sin pre-llenar |

Reglas adicionales:

- **Días hábiles del pre-llenado:** Lun a Vie (`getDay()` 1–5). Sáb (6) y Dom (0) Ausentes.
  El sábado trabajado se marca a mano. Se deja como constante para poder cambiarlo en una línea.
- **"Limpiar"** sigue dejando todo Ausente (no pre-llena), para poder vaciar a mano.
- El pre-llenado se marca **limpio** (`dirty: false`): es un default, igual que cargar del
  server. El combobox sigue mostrando "sin cargar" hasta que se guarda; reabrir reproduce el
  mismo pre-llenado, así que no hay pérdida de datos ni falso "guardado".
- Día presente pre-llenado = asignación `{ obraId: habitual, desde: "", hasta: "", horas: 8 }`,
  misma forma que el default actual de `cambiarTipo`. Se persiste como cualquier día trabajado
  (el server confía en `horas` porque no hay desde/hasta).

## Cambios por archivo

### Dato

- **`src/db/schema.ts`** — agregar a `obreros` la columna
  `odooObraHabitualId: integer("odoo_obra_habitual_id")` (nullable). Es un id de obra de Odoo
  (`account.analytic.account`), igual que `horas.odooObraId`.
- **Migración drizzle** — generar como la de `habilitado`.

### Setear la obra habitual (admin)

- **`src/actions/obreros.ts`** — `guardarObrero` acepta `obraHabitualId: number | null` y lo
  persiste (`odooObraHabitualId`). `listarObreros` ya devuelve la fila completa: la nueva
  columna viaja sola.
- **`src/app/obreros/page.tsx`** — traer `obtenerObras(EMPRESA_BIMEG)` y pasarlas a
  `ObrerosTabla`; incluir `obraHabitualId` en el `obreros.map(...)`.
- **`src/app/obreros/obreros-tabla.tsx`** — `ObreroRow` suma `obraHabitualId: number | null`;
  el componente recibe `obras`; el diálogo `EditarObrero` suma un `Select` **"Obra habitual"**
  (con opción "— sin obra habitual —") alimentado por `obras`, y lo manda en `onGuardar`.
  Admin-only, igual que el resto del diálogo. No hace falta mostrarla en la fila de la tabla.

### Pre-llenado (carga)

- **`src/app/carga/page.tsx`** — `obrerosLite` suma `obraHabitualId: o.odooObraHabitualId`.
- **`src/app/carga/carga-form.tsx`**:
  - `ObreroLite` suma `obraHabitualId: number | null`.
  - Nueva función pura `construirDiasPrefill(inicio, fin, obraHabitualId)` que arma la grilla
    Lun–Vie Presente@8h@habitual, Sáb/Dom Ausente. (`construirDias` actual queda intacto para
    el caso con datos guardados y para "Limpiar".)
  - En el efecto que reabre la quincena: si `r.filas.length === 0` **y** el obrero abierto
    tiene `obraHabitualId` → `construirDiasPrefill(...)`; si no, `construirDias(inicio, fin, r.filas)`.
  - Texto de ayuda actualizado: con obra habitual, *"Viene pre-cargado Lun–Vie en su obra
    habitual; corregí las excepciones"*; sin obra habitual, el texto actual.

No se toca el guardado ni el modelo de `horas`: los días pre-llenados son días *trabajado*
normales.

## Decisiones / costos asumidos

- **Mantenimiento de la obra habitual:** si un obrero rota de obra seguido, hay que actualizar
  el dato. Es config esporádica, no por quincena. Aceptado.
- **B diferido:** con la obra habitual pre-llenando el patrón semanal, "copiar período anterior"
  solo aportaría en casos con obra no-habitual / splits / ausencias recurrentes. Se evalúa más
  adelante si en la práctica hace falta.

## Verificación

- La lógica de "qué días pre-llenar" (`construirDiasPrefill` / regla de día hábil) es pura y
  lleva un check chico: un rango conocido (ej. quincena con un sábado y un domingo) devuelve
  Presente en los hábiles y Ausente en finde, con la obra habitual en los presentes.
- Manual: obrero con obra habitual sin cargar → abre pre-llenado; mismo obrero ya guardado →
  abre como guardó; obrero sin obra habitual → abre todo Ausente; "Limpiar" → todo Ausente.
