"use server";
import { db } from "@/db";
import { liquidaciones } from "@/db/schema";
import { leerFacturas } from "@/lib/odoo/queries";
import { sincronizarQuincena, type ResultadoObrero } from "@/lib/comprobantes-core";
import { requireAdmin } from "@/lib/auth-server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

// Sincroniza los borradores de la quincena en Odoo bajo demanda (botón "Sincronizar ahora").
// borrador → tarifa viva; cerrada → tarifa congelada. `obreroIds` opcional para un subconjunto.
export async function sincronizarAhora(quincenaId: number, obreroIds?: number[]): Promise<ResultadoObrero[]> {
  await requireAdmin();
  const res = await sincronizarQuincena(quincenaId, obreroIds);
  revalidatePath("/saldos");
  return res;
}

type Registro = { facturaId: number; numero: string; estadoOdoo: string };

// Estado de las facturas ya registradas (por obrero), leyendo número + estado vivo de Odoo.
// Sincroniza huérfanos: si un id guardado ya no existe en Odoo (borrado a mano), limpia el
// odooFacturaId en la DB para que el obrero vuelva a aparecer como no-registrado.
export async function estadoComprobantes(quincenaId: number): Promise<Record<number, Registro>> {
  await requireAdmin();
  const liqs = await db.select().from(liquidaciones).where(eq(liquidaciones.quincenaId, quincenaId));
  // id > 0: ignora el centinela EN_PROCESO de un registro en curso (no es una factura real).
  const ids = liqs.map((l) => l.odooFacturaId).filter((x): x is number => x != null && x > 0);
  const facturas = await leerFacturas(ids);
  const byId = new Map(facturas.map((f) => [f.id, f]));

  for (const l of liqs) {
    if (l.odooFacturaId != null && l.odooFacturaId > 0 && !byId.has(l.odooFacturaId)) {
      await db.update(liquidaciones).set({ odooFacturaId: null, odooFacturaNumero: null })
        .where(and(eq(liquidaciones.quincenaId, quincenaId), eq(liquidaciones.obreroId, l.obreroId)));
    }
  }

  const out: Record<number, Registro> = {};
  for (const l of liqs) {
    if (l.odooFacturaId == null || l.odooFacturaId < 0) continue; // null o centinela en proceso
    const f = byId.get(l.odooFacturaId);
    if (!f) continue; // huérfano: ya se limpió arriba
    out[l.obreroId] = { facturaId: l.odooFacturaId, numero: f.name ?? "/", estadoOdoo: f.state ?? "?" };
  }
  return out;
}
