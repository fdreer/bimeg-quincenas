import { unstable_cache } from "next/cache";
import { ejecutar } from "./client";

export type Empresa = { id: number; nombre: string };
export type Obra = { id: number; nombre: string };
export type ContactoObrero = { odooContactoId: number; nombre: string; dni: string | null };
export type Adelanto = { contactoId: number; monto: number; fecha: string };

// Etiqueta (contact tag = res.partner.category) que marca a los obreros en Contactos.
export const ETIQUETA_OBRERO = "Obrero";

// Empresas y obras son setup que cambia poco: cacheadas 10 min para sacar el JSON-RPC
// a Odoo del camino caliente de /carga. Una obra nueva aparece en <=10 min sin tocar nada.
// ponytail: TTL fijo; si hace falta refresco inmediato, agregar tag + revalidateTag.
export const obtenerEmpresas = unstable_cache(
  async (): Promise<Empresa[]> => {
    const filas = await ejecutar("res.company", "search_read", [[]], { fields: ["id", "name"], order: "name" });
    return (filas as any[]).map((r) => ({ id: r.id, nombre: r.name }));
  },
  ["odoo-empresas"],
  { revalidate: 600 },
);

export const obtenerObras = unstable_cache(
  async (empresaId: number): Promise<Obra[]> => {
    const filas = await ejecutar("account.analytic.account", "search_read",
      [[["company_id", "in", [empresaId, false]]]],
      { fields: ["id", "name"], order: "name" });
    return (filas as any[]).map((r) => ({ id: r.id, nombre: r.name }));
  },
  ["odoo-obras"],
  { revalidate: 600 },
);

// Contactos etiquetados como obreros. Es la fuente de verdad de los obreros.
export async function obtenerContactosObreros(): Promise<ContactoObrero[]> {
  const filas = await ejecutar("res.partner", "search_read",
    [[["category_id.name", "=", ETIQUETA_OBRERO]]],
    { fields: ["id", "name", "vat"], order: "name" });
  return (filas as any[]).map((r) => ({ odooContactoId: r.id, nombre: r.name, dni: r.vat || null }));
}

export async function obtenerAdelantos(contactoIds: number[], inicio: string, fin: string): Promise<Adelanto[]> {
  if (contactoIds.length === 0) return [];
  const filas = await ejecutar("account.payment", "search_read",
    [[["partner_id", "in", contactoIds], ["payment_type", "=", "outbound"], ["date", ">=", inicio], ["date", "<=", fin]]],
    { fields: ["partner_id", "amount", "date"] });
  return (filas as any[]).map((r) => ({ contactoId: r.partner_id[0], monto: r.amount, fecha: r.date }));
}

// Producto "Mano de Obra" (servicio). Cambia poco → cacheado 10 min. null si no existe.
export const obtenerProductoManoObra = unstable_cache(
  async (): Promise<number | null> => {
    const filas = await ejecutar("product.product", "search_read",
      [[["name", "=", "Mano de Obra"]]],
      { fields: ["id"], limit: 1 });
    const f = (filas as any[])[0];
    return f ? f.id : null;
  },
  ["odoo-producto-mano-obra"],
  { revalidate: 600 },
);

export type LineaFactura = { productId: number; nombre: string; cantidad: number; precioUnit: number; obraId: number };

// Crea una factura de proveedor en BORRADOR. Una línea por obra, sin IVA, con distribución analítica.
// Devuelve el id de la account.move creada.
// `fecha` = último día de la quincena: se usa como fecha de comprobante (invoice_date) y contable (date).
export async function crearFacturaProveedor(args: {
  partnerId: number; companyId: number; journalId: number; fecha: string; referencia: string; lineas: LineaFactura[];
}): Promise<number> {
  const invoice_line_ids = args.lineas.map((l) => [0, 0, {
    product_id: l.productId,
    name: l.nombre,
    quantity: l.cantidad,
    price_unit: l.precioUnit,
    analytic_distribution: { [String(l.obraId)]: 100 },
    tax_ids: [[6, 0, []]], // sin IVA
  }]);
  const id = await ejecutar("account.move", "create", [{
    move_type: "in_invoice",
    partner_id: args.partnerId,
    company_id: args.companyId,
    journal_id: args.journalId,    // diario "Compras"
    invoice_date: args.fecha,      // fecha de comprobante
    date: args.fecha,              // fecha contable
    ref: args.referencia,
    invoice_line_ids,
  }]);
  return id as number;
}

// Lee número (name) y estado de facturas por id, para mostrar en /saldos.
export async function leerFacturas(ids: number[]): Promise<{ id: number; name: string; state: string }[]> {
  if (ids.length === 0) return [];
  const filas = await ejecutar("account.move", "read", [ids, ["name", "state"]]);
  return (filas as any[]).map((r) => ({ id: r.id, name: r.name, state: r.state }));
}
