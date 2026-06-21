"use server";
import { db } from "@/db";
import { quincenas, horas, obreros, categorias } from "@/db/schema";
import { obtenerEmpresas, obtenerObras, obtenerAdelantos } from "@/lib/odoo/queries";
import {
  jornalEfectivo, valorHora, devengadoPorObrero, costoPorObra, saldo,
  diasTrabajados, etiquetaQuincena, type FilaCalc,
} from "@/lib/calc";
import { desc, eq } from "drizzle-orm";

/** Todas las quincenas existentes (ambas empresas), recientes primero, con etiqueta legible. */
export async function listarQuincenas() {
  const [qs, empresas] = await Promise.all([
    db.select().from(quincenas).orderBy(desc(quincenas.fechaInicio)),
    obtenerEmpresas(),
  ]);
  const nombreEmpresa = new Map(empresas.map((e) => [e.id, e.nombre]));
  return qs.map((q) => ({
    id: q.id,
    etiqueta: `${nombreEmpresa.get(q.odooEmpresaId) ?? `Empresa #${q.odooEmpresaId}`} · ${etiquetaQuincena(q.fechaInicio)}`,
  }));
}

export async function construirSaldos(quincenaId: number) {
  const [q] = await db.select().from(quincenas).where(eq(quincenas.id, quincenaId));
  if (!q) return null;

  const [filas, obrerosDb, cats, empresas] = await Promise.all([
    db.select().from(horas).where(eq(horas.quincenaId, quincenaId)),
    db.select().from(obreros),
    db.select().from(categorias),
    obtenerEmpresas(),
  ]);

  const valorCategoria = new Map(cats.map((c) => [c.id, Number(c.valorJornal)]));
  const obreroById = new Map(obrerosDb.map((o) => [o.id, o]));

  // valor/hora por obrero: override propio → categoría → 0
  const tarifaHora = (obreroId: number): number => {
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
  const obrerosConHoras = [...new Set(filas.map((f) => f.obreroId))]
    .map((id) => obreroById.get(id))
    .filter((o): o is NonNullable<typeof o> => !!o);

  // Adelantos de Odoo (pagos salientes al contacto) + nombres de obra: dos llamadas Odoo independientes, en paralelo.
  const [pagos, obras] = await Promise.all([
    obtenerAdelantos(obrerosConHoras.map((o) => o.odooContactoId), q.fechaInicio, q.fechaFin),
    obtenerObras(q.odooEmpresaId),
  ]);
  const adelantoPorContacto = new Map<number, number>();
  for (const p of pagos) adelantoPorContacto.set(p.contactoId, (adelantoPorContacto.get(p.contactoId) ?? 0) + p.monto);
  const nombreObra = new Map(obras.map((o) => [o.id, o.nombre]));

  const saldos: SaldoRow[] = obrerosConHoras.map((o) => {
    const suyas = filas.filter((f) => f.obreroId === o.id);
    const dev = devengado.get(o.id) ?? 0;
    const adel = adelantoPorContacto.get(o.odooContactoId) ?? 0;
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
    quincena: { id: q.id, etiqueta: etiquetaQuincena(q.fechaInicio), empresaNombre, fechaInicio: q.fechaInicio, fechaFin: q.fechaFin },
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
