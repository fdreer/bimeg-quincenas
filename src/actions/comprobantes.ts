"use server";
import { db } from "@/db";
import { quincenas, horas, obreros, liquidaciones } from "@/db/schema";
import { obtenerProductoManoObra, crearFacturaProveedor, leerFacturas, obtenerObras } from "@/lib/odoo/queries";
import { valorHora, construirLineasComprobante, desglosarJornales, etiquetaQuincena, HORAS_JORNAL } from "@/lib/calc";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { EMPRESA_BIMEG, DIARIO_COMPRAS } from "@/lib/constantes";

type ResultadoObrero = {
  obreroId: number; nombre: string;
  estado: "creado" | "ya_registrado" | "sin_tarifa" | "sin_horas" | "error";
  facturaId?: number; mensaje?: string;
};

export async function registrarComprobantes(quincenaId: number, obreroIds?: number[]): Promise<ResultadoObrero[]> {
  const [q] = await db.select().from(quincenas).where(eq(quincenas.id, quincenaId));
  if (!q) throw new Error("Quincena no encontrada");
  if (q.estado !== "cerrada") throw new Error("La quincena debe estar cerrada para registrar comprobantes");

  const productoId = await obtenerProductoManoObra();
  if (productoId == null) throw new Error('No se encontró el producto "Mano de Obra" en Odoo');

  const [filas, liqs, obrerosDb, obras] = await Promise.all([
    db.select().from(horas).where(eq(horas.quincenaId, quincenaId)),
    db.select().from(liquidaciones).where(eq(liquidaciones.quincenaId, quincenaId)),
    db.select().from(obreros),
    obtenerObras(q.odooEmpresaId),
  ]);

  const obreroById = new Map(obrerosDb.map((o) => [o.id, o]));
  const liqByObrero = new Map(liqs.map((l) => [l.obreroId, l]));
  const nombreObra = new Map(obras.map((o) => [o.id, o.nombre]));
  // Referencia común del lote: "QUINCENA" + fin de quincena (YYYYMMDD). Ej: QUINCENA20260630.
  const referencia = `QUINCENA${q.fechaFin.replace(/-/g, "")}`;
  const etiqueta = etiquetaQuincena(q.fechaInicio);
  const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
  // dedup: registrarComprobantes es server action (borde de confianza); un obreroId repetido
  // crearía dos facturas y dejaría un borrador huérfano en Odoo. Set lo evita en una línea.
  const objetivo = [...new Set(obreroIds ?? liqs.map((l) => l.obreroId))];

  const resultados: ResultadoObrero[] = [];
  for (const obreroId of objetivo) {
    const o = obreroById.get(obreroId);
    const liq = liqByObrero.get(obreroId);
    if (!o || !liq) { resultados.push({ obreroId, nombre: o?.nombre ?? `#${obreroId}`, estado: "error", mensaje: "Sin liquidación; cerrá la quincena primero" }); continue; }
    if (liq.odooFacturaId != null) { resultados.push({ obreroId, nombre: o.nombre, estado: "ya_registrado", facturaId: liq.odooFacturaId }); continue; }

    const precioHora = valorHora(Number(liq.valorJornal)); // jornal congelado / 8
    if (precioHora <= 0) { resultados.push({ obreroId, nombre: o.nombre, estado: "sin_tarifa" }); continue; }

    const suyas = filas.filter((f) => f.obreroId === obreroId)
      .map((f) => ({ tipo: f.tipo, odooObraId: f.odooObraId, horas: Number(f.horas) }));
    const lineas = construirLineasComprobante(suyas, precioHora);
    if (lineas.length === 0) { resultados.push({ obreroId, nombre: o.nombre, estado: "sin_horas" }); continue; }

    // Términos y condiciones de la factura: desglose legible de la liquidación.
    const horasTotal = lineas.reduce((s, l) => s + l.horas, 0);
    const { jornales, sobrante } = desglosarJornales(horasTotal);
    const totalTrabajado = `${jornales} jornal${jornales === 1 ? "" : "es"}${sobrante > 0 ? ` + ${sobrante} h` : ""}`;
    const narracion = [
      `Liquidación: ${etiqueta} — ${o.nombre}`,
      `Valor jornal: ${money.format(Number(liq.valorJornal))} (${HORAS_JORNAL} hs)`,
      `Total trabajado: ${totalTrabajado}`,
      o.aliasCbu ? `Alias/CBU: ${o.aliasCbu}` : null,
    ].filter(Boolean).join("\n");

    try {
      const facturaId = await crearFacturaProveedor({
        partnerId: o.odooContactoId,
        companyId: EMPRESA_BIMEG,
        journalId: DIARIO_COMPRAS,
        fecha: q.fechaFin,
        referencia,
        narracion,
        lineas: lineas.map((l) => ({
          productId: productoId,
          nombre: `Mano de obra — ${nombreObra.get(l.obraId) ?? `#${l.obraId}`}`,
          cantidad: l.horas,
          precioUnit: l.precioUnit,
          obraId: l.obraId,
        })),
      });
      await db.update(liquidaciones).set({ odooFacturaId: facturaId })
        .where(and(eq(liquidaciones.quincenaId, quincenaId), eq(liquidaciones.obreroId, obreroId)));
      resultados.push({ obreroId, nombre: o.nombre, estado: "creado", facturaId });
    } catch (e) {
      resultados.push({ obreroId, nombre: o.nombre, estado: "error", mensaje: e instanceof Error ? e.message : String(e) });
    }
  }
  revalidatePath("/saldos");
  return resultados;
}

type Registro = { facturaId: number; numero: string; estadoOdoo: string };

// Estado de las facturas ya registradas (por obrero), leyendo número + estado vivo de Odoo.
// Sincroniza huérfanos: si un id guardado ya no existe en Odoo (borrado a mano), limpia el
// odooFacturaId en la DB para que el obrero vuelva a aparecer como no-registrado y se pueda re-registrar.
export async function estadoComprobantes(quincenaId: number): Promise<Record<number, Registro>> {
  const liqs = await db.select().from(liquidaciones).where(eq(liquidaciones.quincenaId, quincenaId));
  const ids = liqs.map((l) => l.odooFacturaId).filter((x): x is number => x != null);
  const facturas = await leerFacturas(ids);
  const byId = new Map(facturas.map((f) => [f.id, f]));

  for (const l of liqs) {
    if (l.odooFacturaId != null && !byId.has(l.odooFacturaId)) {
      await db.update(liquidaciones).set({ odooFacturaId: null, odooFacturaNumero: null })
        .where(and(eq(liquidaciones.quincenaId, quincenaId), eq(liquidaciones.obreroId, l.obreroId)));
    }
  }

  const out: Record<number, Registro> = {};
  for (const l of liqs) {
    if (l.odooFacturaId == null) continue;
    const f = byId.get(l.odooFacturaId);
    if (!f) continue; // huérfano: ya se limpió arriba, no lo reportamos como registrado
    out[l.obreroId] = { facturaId: l.odooFacturaId, numero: f.name ?? "/", estadoOdoo: f.state ?? "?" };
  }
  return out;
}
