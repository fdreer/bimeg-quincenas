"use server";
import { db } from "@/db";
import { quincenas, horas } from "@/db/schema";
import { rangoQuincena } from "@/lib/calc";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

// Crea la quincena (empresa + período) si no existe, o devuelve la existente.
export async function asegurarQuincena(empresaId: number, anio: number, mes: number, mitad: 1 | 2) {
  const { inicio, fin } = rangoQuincena(anio, mes, mitad);
  const existente = await db.select().from(quincenas)
    .where(and(eq(quincenas.odooEmpresaId, empresaId), eq(quincenas.fechaInicio, inicio), eq(quincenas.fechaFin, fin)));
  if (existente[0]) return existente[0];
  const [creada] = await db.insert(quincenas)
    .values({ odooEmpresaId: empresaId, fechaInicio: inicio, fechaFin: fin }).returning();
  return creada;
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
  const datos = GuardarHoras.parse(input);
  // Reemplaza las filas de ese obrero en esa quincena (idempotente para re-carga).
  await db.delete(horas).where(and(eq(horas.quincenaId, datos.quincenaId), eq(horas.obreroId, datos.obreroId)));
  if (datos.filas.length === 0) return { guardadas: 0 };
  await db.insert(horas).values(datos.filas.map((f) => ({
    quincenaId: datos.quincenaId, obreroId: datos.obreroId,
    tipo: f.tipo, odooObraId: f.obraId, fecha: f.fecha,
    desde: f.desde, hasta: f.hasta, horas: String(f.horas), comentario: f.comentario,
  })));
  return { guardadas: datos.filas.length };
}
