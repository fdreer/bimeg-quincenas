import { unstable_cache } from "next/cache";
import { ejecutar } from "./client";
import { etiquetaObra } from "@/lib/calc";

export type Empresa = { id: number; nombre: string };
export type Obra = { id: number; nombre: string; cliente: string | null };
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
      { fields: ["id", "name", "partner_id"] });
    // Orden alfabético por la etiqueta visible ("CLIENTE - OBRA"), no por el nombre de la obra.
    return (filas as any[])
      .map((r) => ({ id: r.id, nombre: r.name, cliente: r.partner_id ? r.partner_id[1] : null }))
      .sort((a, b) => etiquetaObra(a).localeCompare(etiquetaObra(b), "es"));
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

export async function obtenerAdelantos(contactoIds: number[], empresaId: number, inicio: string, fin: string): Promise<Adelanto[]> {
  if (contactoIds.length === 0) return [];
  // company_id: el contacto es compartido entre las 2 empresas de Odoo; sin este filtro un pago
  // de BIMEG CONSTRUCTORA al mismo obrero se restaría del saldo de BIMEG B.
  const filas = await ejecutar("account.payment", "search_read",
    [[["partner_id", "in", contactoIds], ["company_id", "=", empresaId], ["payment_type", "=", "outbound"], ["date", ">=", inicio], ["date", "<=", fin]]],
    { fields: ["partner_id", "amount", "date"] });
  return (filas as any[]).map((r) => ({ contactoId: r.partner_id[0], monto: r.amount, fecha: r.date }));
}

export type LineaFactura = { productId: number; nombre: string; cantidad: number; precioUnit: number; obraId: number };

// Crea una factura de proveedor en BORRADOR. Una línea por obra, sin IVA, con distribución analítica.
// Devuelve el id de la account.move creada.
// `fecha` = último día de la quincena: se usa como fecha de comprobante (invoice_date) y contable (date).
// `narracion` se guarda en el campo "Términos y condiciones" (narration) de la factura.
export async function crearFacturaProveedor(args: {
  partnerId: number; companyId: number; journalId: number; fecha: string; vencimiento: string; referencia: string; narracion: string; lineas: LineaFactura[];
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
    invoice_payment_term_id: false, // sin término de pago: deja fijar el vencimiento a mano
    invoice_date_due: args.vencimiento, // 4 días hábiles tras el cierre de quincena
    ref: args.referencia,
    narration: args.narracion,     // Términos y condiciones — desglose de la liquidación
    invoice_line_ids,
  }]);
  return id as number;
}

// Reescribe líneas + narración de una factura de proveedor en BORRADOR.
// El caller garantiza state == "draft" (Odoo no deja editar líneas de una factura posteada).
// [5,0,0] borra todas las líneas actuales; los [0,0,{…}] crean las nuevas. Odoo recalcula totales.
export async function actualizarFacturaBorrador(args: {
  facturaId: number; vencimiento: string; referencia: string; narracion: string; lineas: LineaFactura[];
}): Promise<void> {
  const invoice_line_ids: unknown[] = [[5, 0, 0]];
  for (const l of args.lineas) invoice_line_ids.push([0, 0, {
    product_id: l.productId,
    name: l.nombre,
    quantity: l.cantidad,
    price_unit: l.precioUnit,
    analytic_distribution: { [String(l.obraId)]: 100 },
    tax_ids: [[6, 0, []]], // sin IVA
  }]);
  await ejecutar("account.move", "write", [[args.facturaId], {
    invoice_payment_term_id: false,
    invoice_date_due: args.vencimiento,
    ref: args.referencia,
    narration: args.narracion,
    invoice_line_ids,
  }]);
}

// Borra una factura en BORRADOR (cuando el obrero se queda sin líneas). unlink solo permitido en draft.
export async function eliminarFactura(facturaId: number): Promise<void> {
  await ejecutar("account.move", "unlink", [[facturaId]]);
}

// Busca un borrador de factura de proveedor con este ref+partner (idempotencia/recuperación):
// una corrida previa pudo crear la account.move en Odoo y morir antes de guardar el id en la DB.
// Devuelve el id del borrador (state="draft") o null. limit 1: en el flujo normal hay a lo sumo uno.
export async function buscarBorradorPorRef(partnerId: number, ref: string, companyId: number): Promise<number | null> {
  const filas = await ejecutar("account.move", "search_read",
    [[["ref", "=", ref], ["partner_id", "=", partnerId], ["company_id", "=", companyId],
      ["move_type", "=", "in_invoice"], ["state", "=", "draft"]]],
    { fields: ["id"], limit: 1 });
  return (filas as any[])[0]?.id ?? null;
}

// Lee número (name) y estado de facturas por id. Usa search_read en vez de read para que un id
// borrado en Odoo simplemente no vuelva (read tiraría MissingError). El caller compara contra
// los ids pedidos para detectar facturas huérfanas y limpiarlas.
export async function leerFacturas(ids: number[]): Promise<{ id: number; name: string; state: string }[]> {
  if (ids.length === 0) return [];
  const filas = await ejecutar("account.move", "search_read",
    [[["id", "in", ids]]],
    { fields: ["id", "name", "state"] });
  return (filas as any[]).map((r) => ({ id: r.id, name: r.name, state: r.state }));
}
