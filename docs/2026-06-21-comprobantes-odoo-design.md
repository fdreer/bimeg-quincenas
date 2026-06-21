# Registración de comprobantes a Odoo — Diseño

> Crear una factura de proveedor en Odoo por cada obrero de una quincena cerrada, con el artículo "Mano de Obra", una línea por obra y distribución analítica. Estado del proyecto: [PROGRESS.md](PROGRESS.md). Decisiones tomadas en brainstorming 2026-06-21.

## Objetivo

Desde `/saldos`, una vez la quincena está **cerrada**, registrar en Odoo una **factura de proveedor** (`account.move`, `in_invoice`) por cada obrero, y poder identificar después qué comprobante se creó para cada uno.

## Alcance: 3 piezas

La registración depende de un cierre que **todavía no existe**. El schema ya lo previó (`quincenas.estado`, `cerradaEn`, tabla `liquidaciones`) pero nada lo escribe aún. Entonces el feature incluye:

1. **Cierre de quincena** — congelar tarifas en `liquidaciones` y bloquear la edición.
2. **Registración de facturas** a Odoo (lo pedido).
3. **Identificación del comprobante** por obrero.

## Decisiones (brainstorming 2026-06-21)

- **Comprobante:** factura de proveedor (`move_type = "in_invoice"`). El obrero es el proveedor.
- **Estado en Odoo:** se crea en **borrador** (`draft`). El contador la revisa y publica a mano.
- **Monto:** **bruto** (devengado completo). Los adelantos ya están en Odoo como pagos y se concilian aparte.
- **Sin IVA:** las líneas van sin impuestos (`tax_ids = [(6, 0, [])]`).
- **Empresa de facturación:** por defecto **BIMEG B (id 2)** — constante `EMPRESA_FACTURACION`. Ver "Bordes".
- **Gate de edición:** al cerrar, `/carga` queda solo-lectura. La reapertura queda **abierta** por ahora (el rol "Administrador" llega con la autenticación ya planificada).

## Mapeo a Odoo

Una factura por obrero:

```
account.move.create({
  move_type:    "in_invoice",
  partner_id:   <obrero.odooContactoId>,
  company_id:   EMPRESA_FACTURACION,          // 2 = BIMEG B
  invoice_date: <quincena.fechaFin>,
  ref:          "<etiqueta quincena> · <obrero>",   // identificador legible
  invoice_line_ids: [                          // UNA línea por obra
    (0, 0, {
      product_id:            <id "Mano de Obra">,
      name:                  "Mano de obra — <nombre obra>",
      quantity:              <horas trabajadas en esa obra>,
      price_unit:            <valorJornal congelado / 8>,
      analytic_distribution: { "<obraId>": 100 },
      tax_ids:               (6, 0, []),       // sin IVA
    }),
    ...
  ],
})
```

- Un obrero con 4 h en obra X y 4 h en obra Y → **2 líneas**, 4 unidades cada una, con el precio/hora del obrero.
- Solo entran filas `tipo = "trabajado"` con obra (igual criterio que `construirSaldos`).
- `quantity` = suma de horas por obra; `price_unit` = `valorJornal` **congelado** en `liquidaciones` ÷ 8 (`HORAS_JORNAL`). Así el total de la factura coincide con el devengado del cierre.

## Archivos

```
src/
├─ db/schema.ts                   # liquidaciones: + odooFacturaId, + odooFacturaNumero
├─ lib/calc.ts (+ calc.test.ts)   # construirLineasComprobante(filas, tarifa) — puro, testeado
├─ lib/odoo/queries.ts            # + obtenerProductoManoObra(), + crearFacturaProveedor()
├─ actions/quincenas.ts           # guardarHoras: rechazar si cerrada
├─ actions/cierre.ts              # cerrarQuincena(), reabrirQuincena()  [NUEVO]
├─ actions/comprobantes.ts        # registrarComprobantes(quincenaId, obreroIds?) [NUEVO]
├─ app/carga/carga-form.tsx       # banner "cerrada", Guardar deshabilitado
└─ app/saldos/saldos-tabla.tsx    # botón Cerrar / Registrar + estado por obrero
```

## 1. Cierre de quincena — `actions/cierre.ts`

- `cerrarQuincena(quincenaId)`: por cada obrero con horas, hace upsert en `liquidaciones` (`valorJornal` efectivo congelado + `adelantos` del momento). Setea `estado = "cerrada"`, `cerradaEn = now()`.
- `guardarHoras` (en `quincenas.ts`) pasa a **lanzar error** si la quincena está cerrada — hoy no valida nada (pendiente anotado en PROGRESS).
- `reabrirQuincena(quincenaId)`: vuelve a `borrador` **solo si ningún obrero tiene `odooFacturaId`** (si ya hay facturas, primero hay que anularlas en Odoo).

## 2. Registración — `actions/comprobantes.ts`

`registrarComprobantes(quincenaId, obreroIds?)`:

1. Verifica que la quincena esté **cerrada** (si no, error). Sin `obreroIds` → todos los pendientes.
2. Resuelve `obtenerProductoManoObra()` una vez (lookup por nombre exacto "Mano de Obra", cacheado como obras/empresas).
3. Por cada obrero:
   - Si ya tiene `odooFacturaId` → **se saltea** (idempotente).
   - Arma las líneas con `construirLineasComprobante`. Si no hay líneas (sin tarifa o sin horas con obra) → se reporta, no se crea factura.
   - `crearFacturaProveedor(...)` → guarda `odooFacturaId` en `liquidaciones`.
4. Devuelve resultado **por obrero**: `creado` / `ya_registrado` / `sin_tarifa` / `error`. Las fallas parciales no abortan el lote.

## 3. Identificación del comprobante

- `liquidaciones` gana `odooFacturaId` (siempre disponible) y `odooFacturaNumero` (texto).
- **Borrador no tiene número fiscal**: Odoo asigna el número al publicar. Guardamos el `id` + `ref` para identificarla ya; el `odooFacturaNumero` se rellena releyéndolo cuando el contador la publique (función de refresco simple, o se lee al construir saldos).
- En `/saldos`, cada fila muestra "Registrada #<id>" / número, o "Pendiente".

## Vista — `saldos-tabla.tsx`

- Badge de estado de la quincena: **Borrador** / **Cerrada**.
- **Borrador:** botón **"Cerrar quincena"** (confirma; congela y bloquea). Botones "Registrar" deshabilitados.
- **Cerrada:** botón global **"Registrar en Odoo"** (todos los pendientes) + botón por fila (registra/reintenta uno). Reemplaza el placeholder `registrarPronto` de [saldos-tabla.tsx:13](../src/app/saldos/saldos-tabla.tsx).
- Por obrero: estado "Registrada #<id>" o "Pendiente"; `toast` con el resumen del lote.
- `/carga`: si la quincena está cerrada → banner "Quincena cerrada — solo lectura" y Guardar deshabilitado.

## Lógica testeable

`construirLineasComprobante(filas, tarifa)` (puro, en `calc.ts`):
- Agrupa horas `trabajado` por `obraId`, devuelve `[{ obraId, horas, precioUnit }]`.
- Test: multi-obra (4 h X + 4 h Y → 2 líneas con su precio); ignora ausencias y filas sin obra; sin tarifa → 0 líneas.

`crearFacturaProveedor` / acciones: integración (DB + Odoo). Verificación: crear una factura **draft real** en Odoo y revisarla; `pnpm build` + `pnpm test`.

## Bordes a cubrir

- **Empresa de la factura vs empresa de la quincena:** la quincena ya tiene `odooEmpresaId`, pero por decisión la factura va a **BIMEG B (id 2)**. ⚠️ Si la quincena es de BIMEG CONSTRUCTORA, las obras (cuentas analíticas) pueden no pertenecer a BIMEG B. A confirmar al primer registro real; `EMPRESA_FACTURACION` es una constante de una línea si hay que cambiar el criterio.
- **Obrero sin tarifa** (0) → no se factura; se reporta.
- **Producto "Mano de Obra" inexistente / nombre distinto** → error claro al registrar (no romper en silencio).
- **Doble registración** → idempotente vía `odooFacturaId`.
- **Falla parcial del lote** → por-obrero, no aborta el resto.
- **Reapertura con facturas ya creadas** → bloqueada.

## Prerrequisitos en Odoo (🧑 a confirmar)

- Existe el producto **"Mano de Obra"** (servicio, comprable, con cuenta de gasto). Id desconocido → se busca por nombre.
- Diario de compras por defecto en BIMEG B.
- Sin IVA: confirmado.

## Fuera de alcance (confirmado)

- Rol "Administrador" real → con better-auth (ya planificado). Reapertura abierta por ahora.
- Publicar (posted) automático → queda manual en Odoo.
- Conciliación de adelantos contra la factura → manual / contador.
