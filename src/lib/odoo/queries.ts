import { ejecutar } from "./client";

export type Empresa = { id: number; nombre: string };
export type Obra = { id: number; nombre: string };
export type ContactoObrero = { odooContactoId: number; nombre: string };
export type Adelanto = { contactoId: number; monto: number; fecha: string };

// Etiqueta (contact tag = res.partner.category) que marca a los obreros en Contactos.
export const ETIQUETA_OBRERO = "Obrero";

export async function obtenerEmpresas(): Promise<Empresa[]> {
  const filas = await ejecutar("res.company", "search_read", [[]], { fields: ["id", "name"], order: "name" });
  return (filas as any[]).map((r) => ({ id: r.id, nombre: r.name }));
}

export async function obtenerObras(empresaId: number): Promise<Obra[]> {
  const filas = await ejecutar("account.analytic.account", "search_read",
    [[["company_id", "in", [empresaId, false]]]],
    { fields: ["id", "name"], order: "name" });
  return (filas as any[]).map((r) => ({ id: r.id, nombre: r.name }));
}

// Contactos etiquetados como obreros. Es la fuente de verdad de los obreros.
export async function obtenerContactosObreros(): Promise<ContactoObrero[]> {
  const filas = await ejecutar("res.partner", "search_read",
    [[["category_id.name", "=", ETIQUETA_OBRERO]]],
    { fields: ["id", "name"], order: "name" });
  return (filas as any[]).map((r) => ({ odooContactoId: r.id, nombre: r.name }));
}

export async function obtenerAdelantos(contactoIds: number[], inicio: string, fin: string): Promise<Adelanto[]> {
  if (contactoIds.length === 0) return [];
  const filas = await ejecutar("account.payment", "search_read",
    [[["partner_id", "in", contactoIds], ["payment_type", "=", "outbound"], ["date", ">=", inicio], ["date", "<=", fin]]],
    { fields: ["partner_id", "amount", "date"] });
  return (filas as any[]).map((r) => ({ contactoId: r.partner_id[0], monto: r.amount, fecha: r.date }));
}
