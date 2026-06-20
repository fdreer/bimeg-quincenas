import { unstable_cache } from "next/cache";
import { ejecutar } from "./client";

export type Empresa = { id: number; nombre: string };
export type Obra = { id: number; nombre: string };
export type ContactoObrero = { odooContactoId: number; nombre: string };
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
