import { ejecutar } from "./client";

export type Empresa = { id: number; nombre: string };
export type Obra = { id: number; nombre: string };
export type Puesto = { id: number; nombre: string };
export type Obrero = {
  id: number;
  nombre: string;
  puestoId: number | null;
  puestoNombre: string | null;
  contactoId: number | null;
};
export type Adelanto = { contactoId: number; monto: number; fecha: string };

// Odoo devuelve campos relacionales como [id, "nombre"] o false si están vacíos.
type Tupla = [number, string] | false;
const tuplaId = (t: Tupla) => (t ? t[0] : null);
const tuplaNombre = (t: Tupla) => (t ? t[1] : null);

export function normalizarObrero(r: any): Obrero {
  return {
    id: r.id,
    nombre: r.name,
    puestoId: tuplaId(r.job_id),
    puestoNombre: tuplaNombre(r.job_id),
    contactoId: tuplaId(r.work_contact_id),
  };
}

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

export async function obtenerPuestos(): Promise<Puesto[]> {
  const filas = await ejecutar("hr.job", "search_read", [[]], { fields: ["id", "name"], order: "name" });
  return (filas as any[]).map((r) => ({ id: r.id, nombre: r.name }));
}

export async function obtenerObreros(empresaId: number): Promise<Obrero[]> {
  const filas = await ejecutar("hr.employee", "search_read",
    [[["company_id", "=", empresaId]]],
    { fields: ["id", "name", "job_id", "work_contact_id"], order: "name" });
  return (filas as any[]).map(normalizarObrero);
}

export async function obtenerAdelantos(contactoIds: number[], inicio: string, fin: string): Promise<Adelanto[]> {
  if (contactoIds.length === 0) return [];
  const filas = await ejecutar("account.payment", "search_read",
    [[["partner_id", "in", contactoIds], ["payment_type", "=", "outbound"], ["date", ">=", inicio], ["date", "<=", fin]]],
    { fields: ["partner_id", "amount", "date"] });
  return (filas as any[]).map((r) => ({ contactoId: r.partner_id[0], monto: r.amount, fecha: r.date }));
}
