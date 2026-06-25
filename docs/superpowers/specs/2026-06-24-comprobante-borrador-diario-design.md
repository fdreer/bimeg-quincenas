# Comprobante borrador diario en Odoo — Diseño

- **Fecha:** 2026-06-24
- **Estado:** Aprobado (brainstorming)
- **Empresa afectada:** BIMEG B (`EMPRESA_BIMEG = 2`)

## Problema

Hoy el importe a pagar por obrero recién aparece en Odoo cuando el admin **cierra la
quincena** y después aprieta "Registrar en Odoo". Durante toda la quincena, Odoo no refleja
el pasivo que se va devengando. Se quiere que, a medida que se cargan horas, exista y se
actualice **a diario** un comprobante en **borrador** por obrero en Odoo, para tener el
importe a pagar al día.

## Decisiones (cerradas en brainstorming)

1. **Disparador: cron diario.** Una corrida por día reescribe el borrador de cada obrero con
   las horas cargadas hasta ese momento. No mete a Odoo en el camino de guardado de `/carga`.
2. **Se mantiene el cierre.** Durante la quincena el borrador usa la tarifa **viva**. Al
   cerrar: se congela `jornal`+`adelantos` en `liquidaciones`, se hace una **última
   sincronización** del borrador con la tarifa congelada, y se bloquea la edición de horas.
   La factura queda **en borrador** en Odoo (se valida/contabiliza a mano allá, como hoy).
3. **La factura es devengado bruto** (horas × tarifa, sin IVA, una línea por obra). Los
   adelantos NO se restan en la factura: son `account.payment` (pagos a cuenta) al mismo
   proveedor. El "a pagar" neto es el saldo del proveedor en Odoo (facturas − pagos).
4. **Se reusa `liquidaciones`** como fila de vida del comprobante (no se crea tabla nueva).

## No-objetivos (YAGNI)

- No auto-postear la factura al cerrar (queda en borrador; validación manual en Odoo).
- No sincronización en tiempo real / on-save.
- No tabla nueva para trackear el id del borrador.
- No tocar las líneas de la factura con adelantos.
- No crear quincenas desde el cron (si nadie cargó horas, no hay nada que facturar).

## Modelo de datos

Sin cambios estructurales. Cambia **cuándo** y con qué semántica se escribe `liquidaciones`:

- Hoy: la fila se escribe **al cerrar** (snapshot congelado).
- Ahora: la fila la crea **el cron** (temprano), con `valorJornal` = tarifa viva,
  `adelantos` = `"0"` (placeholder), `odooFacturaId` = id del borrador.
- Mientras la quincena está en `borrador`, `construirSaldos` ignora `liquidaciones` y usa
  tarifas vivas → estas filas tempranas **no afectan** la pantalla de saldos.
- Al cerrar, el upsert que ya existe en `cerrarQuincena` (`onConflictDoUpdate`) sobrescribe
  `valorJornal`+`adelantos` con los valores **congelados** y **preserva** `odooFacturaId`.
- Se actualiza el comentario de la tabla `liquidaciones` en `schema.ts`: de "Snapshot escrito
  AL CERRAR" a "Fila de vida del comprobante por (quincena, obrero); se congela al cerrar".

## Componentes

### 1. Odoo — `actualizarFacturaBorrador` (`src/lib/odoo/queries.ts`)

Nueva función: dado el id de un `account.move` en `draft`, reemplaza sus líneas y narración.

- `write` sobre `account.move` con `invoice_line_ids: [[5, 0, 0], ...nuevas (0,0,{...})]`
  (mismas vals que `crearFacturaProveedor`: producto, distribución analítica, sin IVA).
- También reescribe `ref` y `narration`.
- Precondición: el caller solo la llama si el estado en Odoo es `draft`.
- **A validar en implementación** (con el MCP de Odoo): que el reemplazo con `[5,0,0]` deje el
  move consistente (Odoo recalcula totales/impuestos). Si no, usar unlink+recreate de líneas.

### 2. Core — `sincronizarObrero` (`src/actions/comprobantes.ts`)

Extrae el núcleo de armado de comprobante (líneas + narración + referencia) que hoy vive en
`registrarComprobantes`, y lo unifica con la decisión crear/actualizar. Recibe el obrero, sus
filas de horas, la quincena, y `precioHora` (tarifa viva en el cron, congelada en el cierre).

Lógica de decisión (sobre `decidirAccionSync`, ver §6):

| Estado | Acción |
|--------|--------|
| `precioHora <= 0` (sin tarifa) | saltar (igual que hoy) |
| sin `odooFacturaId` + hay líneas | **crear** borrador (`crearFacturaProveedor`) y guardar id |
| `odooFacturaId` + factura `draft` en Odoo + hay líneas | **actualizar** (`actualizarFacturaBorrador`) |
| `odooFacturaId` + factura `posted` en Odoo | **saltar** (no se puede editar) |
| sin líneas + existe borrador `draft` | **desvincular** (unlink del move + limpiar `odooFacturaId`) para no dejar facturas en $0 |
| sin líneas + sin borrador | saltar |

Conserva el **claim atómico** (`EN_PROCESO = -1`) para el create y la limpieza de huérfanos
(id guardado que ya no existe en Odoo) que ya están en `comprobantes.ts`.

### 3. Cron entry — `sincronizarBorradores` (`src/actions/comprobantes.ts`)

- Busca **todas las quincenas en estado `borrador` de BIMEG B que ya tengan horas**.
  (Cubre el solapamiento de fin de mes sin calcular "hoy cae en qué quincena").
- Por cada quincena, por cada obrero con horas, calcula `precioHora` con la **tarifa viva**
  (override del obrero → categoría) y llama `sincronizarObrero`.
- Devuelve un resumen (creados/actualizados/saltados/errores) para loguear en la ruta.

### 4. Ruta de cron (`src/app/api/cron/sincronizar-borradores/route.ts`)

- `GET`/`POST` que valida `Authorization: Bearer ${CRON_SECRET}` y, si pasa, llama
  `sincronizarBorradores()`. Devuelve 401 si el secreto no coincide.
- Compatible con Vercel Cron (manda el header automáticamente) o cron externo.
- `vercel.json`: schedule diario, default `0 2 * * *` UTC (~23:00 ART). Ajustable en una línea.
  En plan Hobby de Vercel el límite es 1/día, que es justo lo requerido.
- `.env.example`: agregar `CRON_SECRET`.

### 5. Cierre (`src/actions/cierre.ts`)

- `cerrarQuincena`: igual que hoy hasta congelar `liquidaciones`. Luego, **antes** de marcar
  `cerrada`, corre `sincronizarObrero` por cada obrero con la **tarifa congelada** (deja el
  borrador con los números finales). Después marca `estado = cerrada`.
- `reabrirQuincena`: el guard cambia de "hay algún `odooFacturaId`" a "hay alguna factura
  **`posted`** en Odoo". Con borradores diarios, tener un draft es lo normal y reabrir debe
  poder hacerse mientras nada esté contabilizado. (Reusa `leerFacturas` para leer el estado.)

### 6. Lógica pura de decisión + test

`decidirAccionSync({ estadoOdoo, tieneLineas, tieneId }) → "crear" | "actualizar" | "saltar" | "desvincular"`

Función pura (sin I/O) en `src/lib/calc.ts` (o un módulo nuevo chico). Test en
`src/lib/calc.test.ts` cubriendo la tabla de §2 — es la lógica con ramas que vale verificar.

### 7. UI (`src/app/saldos/saldos-tabla.tsx`)

- La columna "Odoo" muestra el número de borrador desde el día 1 (ya no hay que tocar
  "Registrar" por obrero).
- El botón "Registrar todo en Odoo" se reconvierte en **"Sincronizar ahora"** (mismo core,
  para no esperar al cron). Resto de la pantalla igual.

## Flujo de datos

**Diario (cron):**
```
cron → /api/cron/sincronizar-borradores (valida secreto)
     → sincronizarBorradores()
        → por quincena borrador con horas:
           → por obrero con horas:
              precioHora = tarifa viva
              upsert liquidaciones (valorJornal viva, adelantos "0", odooFacturaId)
              sincronizarObrero → crear | actualizar | saltar | desvincular en Odoo
```

**Cierre:**
```
cerrarQuincena
  → congela liquidaciones (jornal + adelantos reales)  [ya existe]
  → por obrero: sincronizarObrero con tarifa CONGELADA  [nuevo]
  → estado = cerrada (bloquea edición de horas)         [ya existe]
```

## Seguridad

- La ruta de cron es el único endpoint nuevo expuesto: protegida por `CRON_SECRET`
  (comparación constante; 401 si no coincide). No corre bajo sesión de usuario.

## Archivos afectados

- **Nuevos:** `src/app/api/cron/sincronizar-borradores/route.ts`, `vercel.json`
- **Modificados:** `src/lib/odoo/queries.ts` (+`actualizarFacturaBorrador`),
  `src/actions/comprobantes.ts` (extraer `sincronizarObrero` + `sincronizarBorradores`,
  reusar core de `registrarComprobantes`), `src/actions/cierre.ts` (sync final + guard
  reabrir), `src/app/saldos/saldos-tabla.tsx` (relabel), `src/lib/calc.ts`
  (+`decidirAccionSync`), `src/lib/calc.test.ts` (+test), `.env.example` (+`CRON_SECRET`),
  `src/db/schema.ts` (comentario de `liquidaciones`).
