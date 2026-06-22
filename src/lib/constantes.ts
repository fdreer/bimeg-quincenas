// Única empresa operada: BIMEG B (company id 2 en Odoo). Toda la app — carga, saldos y
// comprobantes — usa esta empresa; nunca BIMEG CONSTRUCTORA. Decisión 2026-06-21.
export const EMPRESA_BIMEG = 2;

// Diario donde se registran las facturas: account.journal id 18 de BIMEG B
// (en Odoo figura como "Purchases" / code COMP; es el único diario de compras de BIMEG B).
// Se referencia por id porque el nombre no es estable.
export const DIARIO_COMPRAS = 18;

// Producto product.product id 12533 ("Mano de Obra", servicio). Por id y no por nombre:
// el nombre no es único ni estable; el id sí.
export const PRODUCTO_MANO_OBRA = 12533;
