"use server";
import { db } from "@/db";
import { quincenas, horas, obreros, categorias, liquidaciones } from "@/db/schema";
import { obtenerEmpresas, obtenerObras, obtenerAdelantos, type Adelanto } from "@/lib/odoo/queries";
import {
  jornalEfectivo, valorHora, devengadoPorObrero, costoPorObra, saldo,
  diasTrabajados, etiquetaQuincena, type FilaCalc,
} from "@/lib/calc";
import { requireAdmin } from "@/lib/auth-server";
import { EMPRESA_BIMEG } from "@/lib/constantes";
import { desc, eq } from "drizzle-orm";

/** Quincenas de BIMEG B (única empresa operada), recientes primero, con etiqueta legible. */
export async function listarQuincenas() {
  await requireAdmin();
  const qs = await db.select().from(quincenas)
    .where(eq(quincenas.odooEmpresaId, EMPRESA_BIMEG))
    .orderBy(desc(quincenas.fechaInicio));
  return qs.map((q) => ({ id: q.id, etiqueta: etiquetaQuincena(q.fechaInicio) }));
}

export async function construirSaldos(quincenaId: number) {
  await requireAdmin();
  const [q] = await db.select().from(quincenas).where(eq(quincenas.id, quincenaId));
  if (!q) return null;
  const cerrada = q.estado === "cerrada";

  const [filas, obrerosDb, cats, empresas, liqs] = await Promise.all([
    db.select().from(horas).where(eq(horas.quincenaId, quincenaId)),
    db.select().from(obreros),
    db.select().from(categorias),
    obtenerEmpresas(),
    db.select().from(liquidaciones).where(eq(liquidaciones.quincenaId, quincenaId)),
  ]);

  const valorCategoria = new Map(cats.map((c) => [c.id, Number(c.valorJornal)]));
  const obreroById = new Map(obrerosDb.map((o) => [o.id, o]));
  const liqByObrero = new Map(liqs.map((l) => [l.obreroId, l]));

  // Filas agrupadas por obrero una sola vez (evita filtrar el array completo por cada obrero).
  const filasPorObrero = new Map<number, typeof filas>();
  for (const f of filas) (filasPorObrero.get(f.obreroId) ?? filasPorObrero.set(f.obreroId, []).get(f.obreroId)!).push(f);

  // valor/hora por obrero. Si la quincena está cerrada usa el jornal CONGELADO en la liquidación
  // (no las tarifas vivas), para que el histórico no cambie al editar categorías después.
  const tarifaHora = (obreroId: number): number => {
    if (cerrada) {
      const l = liqByObrero.get(obreroId);
      return l ? valorHora(Number(l.valorJornal)) : 0;
    }
    const o = obreroById.get(obreroId);
    if (!o) return 0;
    const cat = o.categoriaId != null ? valorCategoria.get(o.categoriaId) ?? null : null;
    return valorHora(jornalEfectivo(o.valorJornal != null ? Number(o.valorJornal) : null, cat));
  };

  // ponytail: solo trabajado + obra entra al importe; el form de carga garantiza obra en trabajado.
  const trabajadas: FilaCalc[] = filas
    .filter((f) => f.tipo === "trabajado" && f.odooObraId != null)
    .map((f) => ({ obreroId: f.obreroId, obraId: f.odooObraId as number, horas: Number(f.horas) }));

  const devengado = devengadoPorObrero(trabajadas, tarifaHora);
  const costos = costoPorObra(trabajadas, tarifaHora);

  // Obreros que aparecen en esta quincena (tienen alguna fila cargada)
  const obrerosConHoras = [...filasPorObrero.keys()]
    .map((id) => obreroById.get(id))
    .filter((o): o is NonNullable<typeof o> => !!o);

  // Cerrada → adelantos congelados de la liquidación (sin pegarle a Odoo). Borrador → pagos vivos.
  // Nombres de obra siempre desde Odoo.
  const [pagos, obras] = await Promise.all([
    cerrada
      ? Promise.resolve<Adelanto[]>([])
      : obtenerAdelantos(obrerosConHoras.map((o) => o.odooContactoId), q.odooEmpresaId, q.fechaInicio, q.fechaFin),
    obtenerObras(q.odooEmpresaId),
  ]);
  const adelantoPorContacto = new Map<number, number>();
  for (const p of pagos) adelantoPorContacto.set(p.contactoId, (adelantoPorContacto.get(p.contactoId) ?? 0) + p.monto);
  const nombreObra = new Map(obras.map((o) => [o.id, o.nombre]));

  const saldos: SaldoRow[] = obrerosConHoras.map((o) => {
    const suyas = filasPorObrero.get(o.id) ?? [];
    const dev = devengado.get(o.id) ?? 0;
    const adel = cerrada ? Number(liqByObrero.get(o.id)?.adelantos ?? 0) : (adelantoPorContacto.get(o.odooContactoId) ?? 0);
    return {
      obreroId: o.id,
      nombre: o.nombre,
      aliasCbu: o.aliasCbu,
      dni: o.dni,
      dias: diasTrabajados(suyas),
      horas: suyas.filter((f) => f.tipo === "trabajado").reduce((s, f) => s + Number(f.horas), 0),
      devengado: dev,
      adelantos: adel,
      saldo: saldo(dev, adel),
      sinTarifa: tarifaHora(o.id) === 0,
      detalle: suyas
        .slice()
        .sort((a, b) => a.fecha.localeCompare(b.fecha))
        .map((f) => ({
          fecha: f.fecha,
          obra: f.odooObraId != null ? (nombreObra.get(f.odooObraId) ?? `#${f.odooObraId}`) : null,
          horas: Number(f.horas),
          tipo: f.tipo,
          comentario: f.comentario,
        })),
    };
  }).sort((a, b) => a.nombre.localeCompare(b.nombre));

  const costosList = [...costos.entries()]
    .map(([obraId, costo]) => ({ obra: nombreObra.get(obraId) ?? `#${obraId}`, costo }))
    .sort((a, b) => b.costo - a.costo);

  const totales = {
    devengado: saldos.reduce((s, x) => s + x.devengado, 0),
    adelantos: saldos.reduce((s, x) => s + x.adelantos, 0),
    saldo: saldos.reduce((s, x) => s + x.saldo, 0),
    costo: costosList.reduce((s, x) => s + x.costo, 0),
  };

  const empresaNombre = empresas.find((e) => e.id === q.odooEmpresaId)?.nombre ?? `Empresa #${q.odooEmpresaId}`;

  return {
    quincena: { id: q.id, etiqueta: etiquetaQuincena(q.fechaInicio), empresaNombre, estado: q.estado, fechaInicio: q.fechaInicio, fechaFin: q.fechaFin },
    saldos,
    costos: costosList,
    totales,
  };
}

// Tipos del reporte (re-export para la vista)
type Detalle = { fecha: string; obra: string | null; horas: number; tipo: string; comentario: string | null };
type SaldoRow = {
  obreroId: number; nombre: string; aliasCbu: string | null; dni: string | null;
  dias: number; horas: number; devengado: number; adelantos: number; saldo: number;
  sinTarifa: boolean; detalle: Detalle[];
};
