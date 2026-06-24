"use server";
import { db } from "@/db";
import { quincenas, horas, obreros, categorias, liquidaciones } from "@/db/schema";
import { obtenerAdelantos } from "@/lib/odoo/queries";
import { jornalEfectivo } from "@/lib/calc";
import { requireAdmin } from "@/lib/auth-server";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

// Congela la tarifa efectiva + adelantos de cada obrero con horas y marca la quincena cerrada.
export async function cerrarQuincena(quincenaId: number) {
  await requireAdmin();
  const [q] = await db.select().from(quincenas).where(eq(quincenas.id, quincenaId));
  if (!q) throw new Error("Quincena no encontrada");
  if (q.estado === "cerrada") return; // idempotente

  const [filas, obrerosDb, cats] = await Promise.all([
    db.select().from(horas).where(eq(horas.quincenaId, quincenaId)),
    db.select().from(obreros),
    db.select().from(categorias),
  ]);
  const valorCategoria = new Map(cats.map((c) => [c.id, Number(c.valorJornal)]));
  const obreroById = new Map(obrerosDb.map((o) => [o.id, o]));

  const jornalDe = (obreroId: number): number => {
    const o = obreroById.get(obreroId);
    if (!o) return 0;
    const cat = o.categoriaId != null ? valorCategoria.get(o.categoriaId) ?? null : null;
    return jornalEfectivo(o.valorJornal != null ? Number(o.valorJornal) : null, cat);
  };

  const obreroIds = [...new Set(filas.map((f) => f.obreroId))];
  const contactoIds = obreroIds.map((id) => obreroById.get(id)?.odooContactoId).filter((x): x is number => x != null);
  const pagos = await obtenerAdelantos(contactoIds, q.odooEmpresaId, q.fechaInicio, q.fechaFin);
  const adelantoPorContacto = new Map<number, number>();
  for (const p of pagos) adelantoPorContacto.set(p.contactoId, (adelantoPorContacto.get(p.contactoId) ?? 0) + p.monto);

  // Una transacción: o se congelan todas las liquidaciones y queda cerrada, o nada.
  await db.transaction(async (tx) => {
    const rows = obreroIds
      .map((obreroId) => {
        const o = obreroById.get(obreroId);
        if (!o) return null;
        return {
          quincenaId, obreroId,
          valorJornal: String(jornalDe(obreroId)),
          adelantos: String(adelantoPorContacto.get(o.odooContactoId) ?? 0),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (rows.length)
      await tx.insert(liquidaciones).values(rows).onConflictDoUpdate({
        target: [liquidaciones.quincenaId, liquidaciones.obreroId],
        set: { valorJornal: sql`excluded.valor_jornal`, adelantos: sql`excluded.adelantos` },
      });

    await tx.update(quincenas).set({ estado: "cerrada", cerradaEn: sql`now()` }).where(eq(quincenas.id, quincenaId));
  });
  revalidatePath("/saldos");
  revalidatePath("/carga");
}

// Reabre solo si no hay comprobantes ya creados (si los hay, anularlos en Odoo primero).
export async function reabrirQuincena(quincenaId: number) {
  await requireAdmin();
  const liqs = await db.select().from(liquidaciones).where(eq(liquidaciones.quincenaId, quincenaId));
  if (liqs.some((l) => l.odooFacturaId != null))
    throw new Error("No se puede reabrir: hay comprobantes registrados en Odoo. Anulalos primero.");
  await db.update(quincenas).set({ estado: "borrador", cerradaEn: null }).where(eq(quincenas.id, quincenaId));
  revalidatePath("/saldos");
  revalidatePath("/carga");
}
