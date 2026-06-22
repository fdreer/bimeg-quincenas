"use server";
import { db } from "@/db";
import { quincenas, horas } from "@/db/schema";
import { rangoQuincena, horasEntre } from "@/lib/calc";
import { requireUser } from "@/lib/auth-server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

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
