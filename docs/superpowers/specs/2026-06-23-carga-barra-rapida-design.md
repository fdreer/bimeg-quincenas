# Carga rápida: barra de bulk-apply + aplicar a cuadrilla — Design

**Fecha:** 2026-06-23
**Estado:** aprobado (pendiente review del usuario antes del plan)

## Goal

Acelerar la carga de una quincena cubriendo tres necesidades con **un solo mecanismo**:

1. **Un obrero, muchos días** — "obra X, 8 hs, estos días" sin tocar día por día.
2. **Una cuadrilla** — varios obreros en la misma obra, los mismos días, de un saque.
3. **Rotación** — un obrero que cambia de obra dentro de la quincena (sem A → obra 1, sem B → obra 2).

La primitiva común: **aplicar `(obra, horas)` a un set de `días` × un set de `obreros`**.

## Contexto (cómo es hoy)

`/carga` carga **por obrero y por quincena**. Grilla día-por-día (`carga-form.tsx`); cada día es `trabajado` (con N `asignaciones` = `{obraId, desde, hasta, horas}`) o `ausente` (con comentario opcional). Estado en Zustand (`useCargaStore`: `dias`, `dirty`, `cargarDias`, `editarDia`, `editarAsignacion`, …). Se guarda un obrero a la vez (`guardarHoras`); guard `dirty` al cambiar de obrero/período. Ya existe pre-llenado Lun–Vie por obra habitual (es, conceptualmente, un bulk-apply automático en la primera carga).

Días partidos / multi-obra **siguen resolviéndose con el editor por día actual** — el bulk es solo el camino rápido del caso común (día completo, 1 obra).

## Feature 1 — Barra de carga rápida (obrero abierto)

Barra compacta arriba de la grilla, visible solo cuando hay un obrero abierto y la quincena **no** está cerrada:

```
Obra [▾]   Horas [8]   Días [▾]   [Aplicar]   ↳ Aplicar a más obreros…
```

- **Obra:** select de obras (mismo listado que el editor por día). Default = la obra habitual del obrero si tiene; si no, vacío.
- **Horas:** number, default `HORAS_JORNAL` (8).
- **Días:** dropdown de presets autogenerados de **esa** quincena:
  - *Toda la quincena* (todos los días del rango)
  - *Lun–Vie* (todos los hábiles del rango — reusa `diasHabilesDeRango`)
  - *cada semana suelta* (Lun–Vie de cada semana calendario contenida en la quincena; ej. para 16–30 jun 2026: "Sem 16–19", "Sem 22–26", "Sem 29–30") → habilita la rotación (#3)
- **Aplicar:** cada fecha del set elegido pasa a `trabajado` con una única asignación `{obraId, desde:"", hasta:"", horas}`, **reemplazando** lo que ese día tuviera. Opera sobre el **borrador** (marca `dirty`); se ve al instante y se persiste recién con **Guardar** (flujo actual). Reemplazar es seguro porque está a la vista y sin guardar.
- **Rotación (#3):** se hace con dos Aplicar — "Sem 16–19 → obra A", luego "Sem 22–26 → obra B".

### Por qué reemplaza (y no rellena) en el obrero abierto
Es una acción explícita "estos días = esta obra", el resultado es visible inmediatamente y revertible editando antes de Guardar. Rellenar-solo-vacíos sería sorprendente (no podrías corregir un día ya mal cargado con el bulk).

## Feature 2 — Aplicar a más obreros (cuadrilla, #2)

Link/botón **"Aplicar a más obreros…"** al lado de la barra. Abre un diálogo con **multiselect de obreros habilitados** (excluye al obrero abierto, que se maneja con la barra + Guardar). Reusa la **obra / horas / set de días** ya elegidos en la barra.

Semántica (decidida):

- **Solo rellena días vacíos:** para cada obrero seleccionado y cada fecha del set, inserta `trabajado {obra, horas}` **solo si ese obrero no tiene ninguna fila guardada en esa fecha** (de esa quincena). Si ya tiene algo (trabajado o ausente), ese día se **salta** — nunca pisa carga existente.
- **Persiste directo:** al confirmar, se guarda ya para todos los seleccionados (no hay borrador multi-obrero). El obrero abierto sigue con su borrador normal.
- **Feedback:** toast tipo "Aplicado a N obreros · M días saltados (ya tenían carga)".
- Tras aplicar, se refresca el roster (`obtenerEstadoCarga`) para actualizar el contador "sin cargar".

## Arquitectura / dónde toca

| Archivo | Cambio |
|---|---|
| `src/lib/calc.ts` | + `semanasDeQuincena(inicio, fin)` (pura): divide el rango en semanas calendario, cada una con sus días Lun–Vie. Alimenta los presets de "Días". |
| `src/lib/calc.test.ts` | + tests de `semanasDeQuincena` (y de la resolución de presets si se extrae). |
| `src/store/carga-store.ts` | (si hace falta) acción para aplicar una asignación a un set de fechas del borrador; o se reusa `editarDia` en loop. Marca `dirty`. |
| `src/app/carga/carga-form.tsx` | + la barra (estado: obra/horas/díaSet) y su `Aplicar`; + botón y diálogo "Aplicar a más obreros" (multiselect). |
| `src/actions/quincenas.ts` | + `aplicarHorasEnLote({ empresaId, anio, mes, mitad, obreroIds, obraId, horas, fechas })`: `asegurarQuincena`, y por obrero inserta solo en fechas sin fila previa; devuelve `{aplicados, diasSaltados}`. `revalidatePath`. Misma auth que `guardarHoras`. |

### Helper puro para "solo días vacíos"
La lógica "dado el set de fechas guardadas de un obrero y el set objetivo → qué fechas insertar" se extrae como función pura testeable (ej. `fechasARellenar(objetivo, yaGuardadas)`), para no esconder la regla anti-pisado dentro de la server action.

## Trust boundary / no pérdida de datos

- Barra (obrero abierto): escribe solo en el borrador; nada se persiste sin **Guardar**; el guard `dirty` sigue protegiendo el cambio de obrero/período.
- Cuadrilla (persiste directo): el modo "solo rellenar días vacíos" garantiza que **nunca** borra carga existente; los días ya cargados se saltan y se informan.
- Las filas insertadas son días `trabajado` con `horas` y sin `desde/hasta` → `guardarHoras`/inserción los trata igual que un jornal de 8 hs cargado a mano.

## Fuera de alcance (YAGNI)

- Checkboxes por día / selección libre de días arbitrarios (los presets + semanas cubren los casos; lo raro se edita por día).
- Toggle "pisar existentes" en cuadrilla (default seguro: solo vacíos; se agrega si molesta).
- Distribuir horas parciales entre varias obras vía bulk (eso es el editor por día).
- Vista matriz obreros × días (descartada: floja en celu y es el caso "mezcla").
- Incluir al obrero abierto dentro del lote de cuadrilla (se maneja con la barra + Guardar).

## Testing

- `semanasDeQuincena` y `fechasARellenar`: tests puros (Vitest, entorno node) — bordes de quincena, semanas parciales, set vacío, todo-ya-cargado.
- Verificación manual del flujo: barra en 1 obrero (toda / Lun–Vie / semana), rotación con 2 aplicar, cuadrilla rellenando solo vacíos y reportando saltados, quincena cerrada deshabilita ambos.
