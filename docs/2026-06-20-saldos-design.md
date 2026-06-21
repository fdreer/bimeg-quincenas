# Pantalla Saldos — Diseño

> Fase 4 del [plan de implementación](plans/2026-06-19-implementation-plan.md). Visualizador read-only de cuánto pagarle a cada obrero y cuánto costó cada obra, por quincena.
> Estado del proyecto: [PROGRESS.md](PROGRESS.md). Decisiones tomadas en brainstorming 2026-06-20.

## Objetivo

El admin elige una quincena y ve, en una sola pantalla:
1. **Saldo a pagar por obrero** — devengado − adelantos, con desglose día × obra al expandir.
2. **Costo de mano de obra por obra** — cuánto sumó cada obra en el período.

Es **solo visualización** (no edita, no cierra, no postea a Odoo).

## Decisiones (brainstorming 2026-06-20)

- **Detalle por obrero:** una fila resumen por obrero; al hacer click se despliega el desglose día por día. Información simple arriba, detalle bajo demanda.
- **Adelantos:** salen de Odoo (`obtenerAdelantos`, ya codeado): pagos salientes (`account.payment`, `payment_type=outbound`) al contacto del obrero dentro del período. Cero trabajo extra; depende de que los adelantos se carguen como pagos en Odoo.
- **Alcance:** solo visualizar. El cierre de quincena (snapshot a `liquidaciones`, bloquear la carga) queda fuera, para un paso posterior.

## Archivos

```
src/
├─ actions/saldos.ts              # listarQuincenas() + construirSaldos(quincenaId)
├─ app/saldos/
│  ├─ page.tsx                    # server: selector de quincena (?q=id) + arma el reporte
│  └─ saldos-tabla.tsx            # client: tabla obreros (fila expandible) + tabla costos por obra
├─ components/nav.tsx             # + link "Saldos"
└─ lib/calc.ts (+ calc.test.ts)   # helpers puros de agregación nuevos
```

## Selector de quincena

`listarQuincenas()` devuelve todas las quincenas existentes (ambas empresas), ordenadas por `fechaInicio` desc, con una etiqueta legible:

> **"BIMEG Constructora · 1ª quincena · Jun 2026"**

- El nombre de empresa sale de `obtenerEmpresas()` (Odoo, cacheado).
- `1ª` vs `2ª` y el mes se derivan de `fechaInicio` (día 1 → 1ª; día 16 → 2ª). Helper puro `etiquetaQuincena(fechaInicio)`.
- La UI es un `Select` que navega a `/saldos?q=<id>` (re-render server-side). Default: la quincena más reciente. Sin `q` y sin quincenas → empty state.

## Cálculo — `construirSaldos(quincenaId)`

1. Lee la quincena (empresa + fechas) y todas sus filas de `horas`.
2. Lee `obreros` (DB) con su categoría; resuelve **valor/hora por obrero**: `valorHora(jornalEfectivo(override, valorCategoría))` (ambas ya en `calc.ts`).
3. **Solo filas `tipo = "trabajado"`** entran al importe. Las `ausente` aportan 0 y no tienen obra; aparecen únicamente en el desglose con su `comentario`.
4. `devengadoPorObrero(filasTrabajado, tarifaHora)` y `costoPorObra(filasTrabajado, tarifaHora)` (ya testeadas).
5. Adelantos: `obtenerAdelantos(contactoIds, inicio, fin)` → agrupa por `contactoId` → mapea a obrero por `odooContactoId`. `saldo(devengado, adelantos)`.
6. Nombres de obra vía `obtenerObras(empresa)` → `Map<id, nombre>`.

Devuelve algo como:

```ts
{
  quincena: { id, empresaNombre, etiqueta, fechaInicio, fechaFin },
  saldos: Array<{
    obreroId, nombre, aliasCbu,
    dias, horas, devengado, adelantos, saldo,
    sinTarifa: boolean,            // valor/hora resuelto = 0
    detalle: Array<{ fecha, obra, horas, tipo, comentario }>,
  }>,
  costos: Array<{ obra, costo }>,
  totales: { devengado, adelantos, saldo, costo },
}
```

## Vista — `saldos-tabla.tsx`

- **Encabezado:** "Saldos · {empresa} · {1ª quincena Jun 2026}" + `Select` de quincena.
- **Tabla de obreros:** `Obrero | Días | Horas | Devengado | Adelantos | Saldo a pagar | Alias/CBU`.
  - Fila clickeable → despliega el **desglose día × obra × horas** (y ausencias con su motivo).
  - Fila de **totales** al pie.
- **Tabla de costos por obra:** `Obra | Costo mano de obra` + total.
- Moneda en ARS (`toLocaleString("es-AR", { style: "currency", currency: "ARS" })`).
- Responsive con el patrón ya usado (wrapper `overflow-x-auto`, padding `p-4 sm:p-6`).

## Bordes a cubrir

- **Obrero sin tarifa** (categoría 0 y sin override) → devengado 0; se marca visualmente (`sinTarifa` → chip "sin tarifa") para que no pase desapercibido.
- **Adelanto > devengado** → saldo negativo (a favor de la empresa); se muestra en rojo.
- **Quincena sin horas** / **sin quincenas** → empty states.
- **Obra borrada en Odoo** → fallback `#<id>`.

## Tests

- `calc.ts`: agregar helpers puros de agregación y testearlos:
  - `diasTrabajados(filas)` — días distintos con `tipo = "trabajado"` por obrero.
  - suma de horas trabajadas por obrero.
  - `etiquetaQuincena(fechaInicio)` — "1ª"/"2ª" + mes.
  - `devengadoPorObrero` / `costoPorObra` / `saldo` ya están testeadas.
- `construirSaldos` / `listarQuincenas`: sin unit test (dependen de DB + Odoo), igual que las otras actions. Verificación: `pnpm build` + smoke manual contra datos reales.

## Fuera de alcance (confirmado)

- Cierre de quincena (snapshot a `liquidaciones`, bloquear `guardarHoras`).
- Autenticación.
- Escritura del costo a Odoo (factura vs asiento).
