import { db } from "@/db";
import { quincenas, horas, obreros, categorias, liquidaciones } from "@/db/schema";
import {
  obtenerObras, leerFacturas, crearFacturaProveedor, actualizarFacturaBorrador, eliminarFactura,
} from "@/lib/odoo/queries";
import {
  valorHora, jornalEfectivo, etiquetaQuincena, desglosarJornales, construirLineasComprobante,
  decidirAccionSync, HORAS_JORNAL,
} from "@/lib/calc";
import { EMPRESA_BIMEG, DIARIO_COMPRAS, PRODUCTO_MANO_OBRA } from "@/lib/constantes";
import { and, eq, isNull, inArray } from "drizzle-orm";

// Centinela "factura en proceso" para el claim atómico (ningún id real de Odoo es negativo).
const EN_PROCESO = -1;

export type ResultadoObrero = {
  obreroId: number; nombre: string;
  estado: "creado" | "actualizado" | "desvinculado" | "ya_posteado" | "sin_tarifa" | "sin_horas" | "omitido" | "error";
  facturaId?: number; mensaje?: string;
};

// Términos y condiciones de la factura: desglose legible de la liquidación (HTML, lo renderiza Odoo).
function construirNarracion(args: {
  etiqueta: string; nombre: string; categoria: string | null; valorJornal: number; aliasCbu: string | null; horasTotal: number;
}): string {
  const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
  const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  const { jornales, sobrante } = desglosarJornales(args.horasTotal);
  const totalTrabajado = `${jornales} jornal${jornales === 1 ? "" : "es"}${sobrante > 0 ? ` + ${sobrante} h` : ""}`;
  return [
    `<p><strong>Liquidación · ${escHtml(args.etiqueta)} — ${escHtml(args.nombre)}</strong></p>`,
    args.categoria ? `<p><strong>Categoría:</strong> ${escHtml(args.categoria)}</p>` : null,
    `<p><strong>Valor jornal:</strong> ${money.format(args.valorJornal)} (${HORAS_JORNAL} hs)</p>`,
    `<p><strong>Total trabajado:</strong> ${totalTrabajado}</p>`,
    args.aliasCbu ? `<p><strong>Alias/CBU:</strong> ${escHtml(args.aliasCbu)}</p>` : null,
  ].filter(Boolean).join("");
}

/**
 * Sincroniza el borrador en Odoo de los obreros de una quincena (todos, o el subconjunto `obreroIds`).
 * - borrador → usa la tarifa VIVA (override del obrero → categoría).
 * - cerrada  → usa el jornal CONGELADO de la liquidación.
 * Crea, actualiza o desvincula la factura según su estado en Odoo. Idempotente.
 */
export async function sincronizarQuincena(quincenaId: number, obreroIds?: number[]): Promise<ResultadoObrero[]> {
  const [q] = await db.select().from(quincenas).where(eq(quincenas.id, quincenaId));
  if (!q) throw new Error("Quincena no encontrada");
  const cerrada = q.estado === "cerrada";

  const [filas, liqs, obrerosDb, cats, obras] = await Promise.all([
    db.select().from(horas).where(eq(horas.quincenaId, quincenaId)),
    db.select().from(liquidaciones).where(eq(liquidaciones.quincenaId, quincenaId)),
    db.select().from(obreros),
    db.select().from(categorias),
    obtenerObras(q.odooEmpresaId),
  ]);

  const obreroById = new Map(obrerosDb.map((o) => [o.id, o]));
  const liqByObrero = new Map(liqs.map((l) => [l.obreroId, l]));
  const valorCategoria = new Map(cats.map((c) => [c.id, Number(c.valorJornal)]));
  const nombreObra = new Map(obras.map((o) => [o.id, o.nombre]));
  const nombreCategoria = new Map(cats.map((c) => [c.id, c.nombre]));
  const referencia = `QUINCENA${q.fechaFin.replace(/-/g, "")}`;
  const etiqueta = etiquetaQuincena(q.fechaInicio);

  // Estados vivos de las facturas ya guardadas (una sola lectura a Odoo).
  const idsReales = liqs.map((l) => l.odooFacturaId).filter((x): x is number => x != null && x > 0);
  const facturas = await leerFacturas(idsReales);
  const estadoFactura = new Map(facturas.map((f) => [f.id, f.state]));

  const precioHoraDe = (obreroId: number): number => {
    if (cerrada) {
      const l = liqByObrero.get(obreroId);
      return l ? valorHora(Number(l.valorJornal)) : 0;
    }
    const o = obreroById.get(obreroId);
    if (!o) return 0;
    const cat = o.categoriaId != null ? valorCategoria.get(o.categoriaId) ?? null : null;
    return valorHora(jornalEfectivo(o.valorJornal != null ? Number(o.valorJornal) : null, cat));
  };

  async function procesar(obreroId: number): Promise<ResultadoObrero> {
    const o = obreroById.get(obreroId)!;
    const precioHora = precioHoraDe(obreroId);
    const suyas = filas.filter((f) => f.obreroId === obreroId)
      .map((f) => ({ tipo: f.tipo, odooObraId: f.odooObraId, horas: Number(f.horas) }));
    const lineas = construirLineasComprobante(suyas, precioHora);

    // Asegura la fila de liquidación para poder guardar el id. Placeholder en borrador
    // (valorJornal/adelantos se ignoran mientras la quincena no esté cerrada).
    await db.insert(liquidaciones)
      .values({ quincenaId, obreroId, valorJornal: String(precioHora * HORAS_JORNAL), adelantos: "0" })
      .onConflictDoNothing({ target: [liquidaciones.quincenaId, liquidaciones.obreroId] });
    const [liq] = await db.select().from(liquidaciones)
      .where(and(eq(liquidaciones.quincenaId, quincenaId), eq(liquidaciones.obreroId, obreroId)));

    // Huérfano: id guardado que ya no existe en Odoo (borrado a mano) → limpiar y tratar como sin factura.
    let idFactura = liq.odooFacturaId;
    if (idFactura != null && idFactura > 0 && !estadoFactura.has(idFactura)) {
      await db.update(liquidaciones).set({ odooFacturaId: null, odooFacturaNumero: null })
        .where(and(eq(liquidaciones.quincenaId, quincenaId), eq(liquidaciones.obreroId, obreroId)));
      idFactura = null;
    }
    const estadoOdoo = idFactura != null && idFactura > 0 ? estadoFactura.get(idFactura) ?? null : null;

    const accion = decidirAccionSync({
      tieneTarifa: precioHora > 0, tieneLineas: lineas.length > 0, idFactura, estadoOdoo,
    });

    if (accion === "saltar") {
      if (precioHora <= 0) return { obreroId, nombre: o.nombre, estado: "sin_tarifa" };
      if (idFactura != null && idFactura < 0) return { obreroId, nombre: o.nombre, estado: "omitido" };
      if (estadoOdoo && estadoOdoo !== "draft") return { obreroId, nombre: o.nombre, estado: "ya_posteado", facturaId: idFactura ?? undefined };
      return { obreroId, nombre: o.nombre, estado: "sin_horas" };
    }

    const lineasOdoo = lineas.map((l) => ({
      productId: PRODUCTO_MANO_OBRA,
      nombre: `Mano de obra — ${nombreObra.get(l.obraId) ?? `#${l.obraId}`}`,
      cantidad: l.horas, precioUnit: l.precioUnit, obraId: l.obraId,
    }));
    const narracion = construirNarracion({
      etiqueta, nombre: o.nombre,
      categoria: o.categoriaId != null ? nombreCategoria.get(o.categoriaId) ?? null : null,
      valorJornal: precioHora * HORAS_JORNAL, aliasCbu: o.aliasCbu,
      horasTotal: lineas.reduce((s, l) => s + l.horas, 0),
    });

    if (accion === "desvincular") {
      await eliminarFactura(idFactura!);
      await db.update(liquidaciones).set({ odooFacturaId: null, odooFacturaNumero: null })
        .where(and(eq(liquidaciones.quincenaId, quincenaId), eq(liquidaciones.obreroId, obreroId)));
      return { obreroId, nombre: o.nombre, estado: "desvinculado" };
    }

    if (accion === "actualizar") {
      await actualizarFacturaBorrador({ facturaId: idFactura!, referencia, narracion, lineas: lineasOdoo });
      return { obreroId, nombre: o.nombre, estado: "actualizado", facturaId: idFactura! };
    }

    // accion === "crear": claim atómico (marca EN_PROCESO solo si sigue sin factura).
    const claim = await db.update(liquidaciones).set({ odooFacturaId: EN_PROCESO })
      .where(and(eq(liquidaciones.quincenaId, quincenaId), eq(liquidaciones.obreroId, obreroId), isNull(liquidaciones.odooFacturaId)))
      .returning({ id: liquidaciones.id });
    if (claim.length === 0) return { obreroId, nombre: o.nombre, estado: "omitido" }; // otra corrida ganó el claim
    try {
      const facturaId = await crearFacturaProveedor({
        partnerId: o.odooContactoId, companyId: EMPRESA_BIMEG, journalId: DIARIO_COMPRAS,
        fecha: q.fechaFin, referencia, narracion, lineas: lineasOdoo,
      });
      await db.update(liquidaciones).set({ odooFacturaId: facturaId })
        .where(and(eq(liquidaciones.quincenaId, quincenaId), eq(liquidaciones.obreroId, obreroId)));
      return { obreroId, nombre: o.nombre, estado: "creado", facturaId };
    } catch (e) {
      // Falló Odoo: liberar el centinela para poder reintentar.
      await db.update(liquidaciones).set({ odooFacturaId: null })
        .where(and(eq(liquidaciones.quincenaId, quincenaId), eq(liquidaciones.obreroId, obreroId), eq(liquidaciones.odooFacturaId, EN_PROCESO)));
      throw e;
    }
  }

  const conHoras = new Set(filas.map((f) => f.obreroId));
  const objetivo = [...new Set(obreroIds ?? [...conHoras])].filter((id) => conHoras.has(id) && obreroById.has(id));
  const resultados: ResultadoObrero[] = [];
  for (const obreroId of objetivo) {
    try { resultados.push(await procesar(obreroId)); }
    catch (e) { resultados.push({ obreroId, nombre: obreroById.get(obreroId)?.nombre ?? `#${obreroId}`, estado: "error", mensaje: e instanceof Error ? e.message : String(e) }); }
  }
  return resultados;
}

/**
 * Disparador del cron: sincroniza el borrador de todas las quincenas en estado "borrador"
 * de BIMEG B que ya tengan horas cargadas. No crea quincenas.
 */
export async function sincronizarBorradores(): Promise<{ quincenas: number; resultados: ResultadoObrero[] }> {
  const qs = await db.select({ id: quincenas.id }).from(quincenas)
    .where(and(
      eq(quincenas.odooEmpresaId, EMPRESA_BIMEG),
      eq(quincenas.estado, "borrador"),
      inArray(quincenas.id, db.select({ id: horas.quincenaId }).from(horas)),
    ));
  const resultados: ResultadoObrero[] = [];
  for (const q of qs) resultados.push(...await sincronizarQuincena(q.id));
  return { quincenas: qs.length, resultados };
}
