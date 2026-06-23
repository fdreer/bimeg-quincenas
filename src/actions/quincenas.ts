"use server";
import { db } from "@/db";
import { quincenas, horas, obreros } from "@/db/schema";
import { rangoQuincena, horasEntre, estadoCargaPorObrero, fechasARellenar, type EstadoCargaObrero } from "@/lib/calc";
import { requireUser } from "@/lib/auth-server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";

// Crea la quincena (empresa + período) si no existe, o devuelve la existente.
export async function asegurarQuincena(empresaId: number, anio: number, mes: number, mitad: 1 | 2) {
  await requireUser();
  const { inicio, fin } = rangoQuincena(anio, mes, mitad);
  const existente = await db.select().from(quincenas)
    .where(and(eq(quincenas.odooEmpresaId, empresaId), eq(quincenas.fechaInicio, inicio), eq(quincenas.fechaFin, fin)));
  if (existente[0]) return existente[0];
  const [creada] = await db.insert(quincenas)
    .values({ odooEmpresaId: empresaId, fechaInicio: inicio, fechaFin: fin }).returning();
  return creada;
}

// Trae lo ya guardado de un obrero en esa quincena + el estado (para reabrir/editar y bloquear si está cerrada).
export async function obtenerHorasGuardadas(empresaId: number, anio: number, mes: number, mitad: 1 | 2, obreroId: number) {
  await requireUser();
  const { inicio, fin } = rangoQuincena(anio, mes, mitad);
  const [q] = await db.select().from(quincenas)
    .where(and(eq(quincenas.odooEmpresaId, empresaId), eq(quincenas.fechaInicio, inicio), eq(quincenas.fechaFin, fin)));
  if (!q) return { estado: null as string | null, filas: [] };
  const filas = await db.select().from(horas).where(and(eq(horas.quincenaId, q.id), eq(horas.obreroId, obreroId)));
  return { estado: q.estado as string | null, filas };
}

// Estado de carga de TODOS los obreros en una quincena (para el roster: quién falta cargar).
// Si la quincena todavía no existe, nadie tiene movimientos → todos "sin cargar".
export async function obtenerEstadoCarga(empresaId: number, anio: number, mes: number, mitad: 1 | 2) {
  await requireUser();
  const { inicio, fin } = rangoQuincena(anio, mes, mitad);
  const [q] = await db.select().from(quincenas)
    .where(and(eq(quincenas.odooEmpresaId, empresaId), eq(quincenas.fechaInicio, inicio), eq(quincenas.fechaFin, fin)));
  if (!q) return { cerrada: false, porObrero: {} as Record<number, EstadoCargaObrero> };
  const filas = await db
    .select({ obreroId: horas.obreroId, tipo: horas.tipo, fecha: horas.fecha })
    .from(horas)
    .where(eq(horas.quincenaId, q.id));
  return { cerrada: q.estado === "cerrada", porObrero: estadoCargaPorObrero(filas) };
}

const GuardarHoras = z.object({
  quincenaId: z.number().int(),
  obreroId: z.number().int(),
  filas: z.array(z.object({
    fecha: z.string(),
    tipo: z.enum(["trabajado", "ausente"]),
    obraId: z.number().int().nullable(),
    desde: z.string().nullable(),
    hasta: z.string().nullable(),
    horas: z.number().min(0).max(24),
    comentario: z.string().nullable(),
  })),
});

export async function guardarHoras(input: z.infer<typeof GuardarHoras>) {
  await requireUser();
  const datos = GuardarHoras.parse(input);
  const [q] = await db.select().from(quincenas).where(eq(quincenas.id, datos.quincenaId));
  if (!q) throw new Error("Quincena no encontrada");
  if (q.estado === "cerrada") throw new Error("Quincena cerrada: no se pueden modificar las horas");
  const [obrero] = await db.select({ habilitado: obreros.habilitado }).from(obreros).where(eq(obreros.id, datos.obreroId));
  if (!obrero) throw new Error("Obrero no encontrado");
  if (!obrero.habilitado) throw new Error("Obrero deshabilitado: no se le pueden cargar horas");
  // Reemplaza las filas de ese obrero en esa quincena (idempotente para re-carga).
  await db.delete(horas).where(and(eq(horas.quincenaId, datos.quincenaId), eq(horas.obreroId, datos.obreroId)));
  if (datos.filas.length === 0) return { guardadas: 0 };
  await db.insert(horas).values(datos.filas.map((f) => ({
    quincenaId: datos.quincenaId, obreroId: datos.obreroId,
    // Borde de confianza: si vienen desde+hasta, las horas las manda el servidor (no se confía en el cliente).
    tipo: f.tipo, odooObraId: f.obraId, fecha: f.fecha,
    desde: f.desde, hasta: f.hasta,
    horas: String(f.desde && f.hasta ? horasEntre(f.desde, f.hasta) : f.horas),
    comentario: f.comentario,
  })));
  return { guardadas: datos.filas.length };
}

const AplicarLote = z.object({
  empresaId: z.number().int(),
  anio: z.number().int(),
  mes: z.number().int(),
  mitad: z.union([z.literal(1), z.literal(2)]),
  obreroIds: z.array(z.number().int()).min(1),
  obraId: z.number().int(),
  horas: z.number().min(0).max(24),
  fechas: z.array(z.string()).min(1),
});

// Cuadrilla: aplica "obra + horas" a varios obreros en las fechas dadas, RELLENANDO SOLO
// días vacíos (nunca pisa carga existente). Persiste directo. Devuelve cuántos se aplicó/saltó.
export async function aplicarHorasEnLote(input: z.infer<typeof AplicarLote>) {
  await requireUser();
  const d = AplicarLote.parse(input);
  const q = await asegurarQuincena(d.empresaId, d.anio, d.mes, d.mitad);
  if (q.estado === "cerrada") throw new Error("Quincena cerrada: no se pueden modificar las horas");
  // Solo obreros habilitados de los seleccionados.
  const habil = await db.select({ id: obreros.id }).from(obreros)
    .where(and(inArray(obreros.id, d.obreroIds), eq(obreros.habilitado, true)));
  const ids = habil.map((o) => o.id);
  let aplicados = 0, saltados = 0;
  for (const obreroId of ids) {
    const existentes = await db.select({ fecha: horas.fecha }).from(horas)
      .where(and(eq(horas.quincenaId, q.id), eq(horas.obreroId, obreroId)));
    const aRellenar = fechasARellenar(d.fechas, existentes.map((e) => e.fecha));
    saltados += d.fechas.length - aRellenar.length;
    if (aRellenar.length) {
      await db.insert(horas).values(aRellenar.map((fecha) => ({
        quincenaId: q.id, obreroId, tipo: "trabajado",
        odooObraId: d.obraId, fecha, desde: null, hasta: null,
        horas: String(d.horas), comentario: null,
      })));
      aplicados += aRellenar.length;
    }
  }
  revalidatePath("/carga");
  return { obreros: ids.length, aplicados, saltados };
}
