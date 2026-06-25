# Sincronización con Odoo — Cómo funciona

## El borrador en Odoo

Por cada obrero que tiene horas cargadas en una quincena, la app mantiene una **factura de proveedor en borrador** en Odoo. Esa factura refleja lo que se le va a pagar al obrero: una línea por obra, con las horas trabajadas y su tarifa.

El borrador se crea y actualiza automáticamente. No hace falta intervención manual para que aparezca en Odoo.

---

## Cron diario (automático)

Todos los días a las 2am corre un proceso automático que recorre todas las quincenas **en borrador** con horas cargadas y actualiza los comprobantes en Odoo.

Qué hace por cada obrero:

- **Sin borrador todavía** → lo crea en Odoo
- **Ya tiene borrador** → lo actualiza con las horas actuales (no lo duplica)
- **Se borraron todas sus horas** → elimina el borrador de Odoo
- **Sin tarifa asignada** → lo omite (no se puede calcular el importe)
- **Sin contacto de Odoo vinculado** → lo omite

La tarifa que usa es la **tarifa viva** del obrero al momento de correr el cron (override propio del obrero, o la de su categoría).

---

## "Sincronizar ahora" (manual)

El botón en `/saldos` hace exactamente lo mismo que el cron, pero al instante y solo para la quincena que estás viendo.

Cuándo usarlo:
- Cargaste horas y no querés esperar al cron de la noche
- Cambiaste la tarifa de un obrero y querés ver el nuevo importe en Odoo
- Revisás el borrador en Odoo y algo no coincide con lo que muestra la app

El botón por obrero (columna Odoo) aparece cuando ese obrero no tiene borrador todavía. Una vez creado, muestra el número de factura en vez del botón.

---

## Cerrar quincena

Al cerrar:

1. **Se congela la tarifa** de cada obrero (se guarda en la base de datos el valor exacto del jornal en ese momento). A partir de acá, esa tarifa no cambia aunque se modifique la categoría o el override del obrero.
2. **Se congela el monto de adelantos** (lo que ya se le pagó al obrero durante esa quincena, según Odoo).
3. **Se hace una sync final** contra Odoo con la tarifa congelada. Los borradores quedan con los importes definitivos.

El resultado es que cada borrador en Odoo queda con el importe exacto que se va a pagar. Desde ese momento se puede contabilizar (postear) la factura en Odoo.

---

## Reabrir quincena

Se puede reabrir mientras ninguna factura haya sido **contabilizada** en Odoo.

- Borradores activos → no bloquean reabrir. Al reabrir la quincena vuelve a estado borrador y el cron la sigue sincronizando.
- Facturas contabilizadas (posted) → **bloquean**. Hay que anularlas primero en Odoo antes de poder reabrir.

---

## Resumen del ciclo

```
Horas cargadas
    ↓
Cron diario / "Sincronizar ahora"
    → crea/actualiza borradores en Odoo (tarifa viva)
    ↓
Cerrar quincena
    → congela tarifa y adelantos
    → sync final con tarifa congelada
    ↓
Contabilizar en Odoo (acción manual en Odoo)
    ↓
Pago al obrero
```
