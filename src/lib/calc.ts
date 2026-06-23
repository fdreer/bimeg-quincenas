import { endOfMonth, format, parseISO, addDays } from "date-fns";

const fmt = (d: Date) => format(d, "yyyy-MM-dd");

/** Horas de un jornal completo. Cambiar la jornada estándar = una línea. */
export const HORAS_JORNAL = 8;

/** Rango de una quincena. mitad=1 → 1 al 15; mitad=2 → 16 al fin de mes. */
export function rangoQuincena(anio: number, mes: number, mitad: 1 | 2): { inicio: string; fin: string } {
  const primero = new Date(anio, mes - 1, 1);
  if (mitad === 1) return { inicio: fmt(new Date(anio, mes - 1, 1)), fin: fmt(new Date(anio, mes - 1, 15)) };
  return { inicio: fmt(new Date(anio, mes - 1, 16)), fin: fmt(endOfMonth(primero)) };
}

/**
 * Días Lun–Vie del rango [inicio, fin] inclusive, en "yyyy-MM-dd". Sáb y Dom quedan afuera.
 * Son los días que el pre-llenado de /carga marca como Presente.
 */
export function diasHabilesDeRango(inicio: string, fin: string): string[] {
  const out: string[] = [];
  for (let d = parseISO(inicio), end = parseISO(fin); d <= end; d = addDays(d, 1)) {
    const dow = d.getDay(); // 0=Dom … 6=Sáb
    if (dow >= 1 && dow <= 5) out.push(format(d, "yyyy-MM-dd"));
  }
  return out;
}

/**
 * Divide la quincena en semanas calendario, cada una con sus días Lun–Vie ("yyyy-MM-dd").
 * Una semana nueva arranca cada Lunes. Alimenta los presets "por semana" del bulk de /carga.
 */
export function semanasDeQuincena(inicio: string, fin: string): string[][] {
  const out: string[][] = [];
  for (const fecha of diasHabilesDeRango(inicio, fin)) {
    if (out.length === 0 || parseISO(fecha).getDay() === 1) out.push([fecha]);
    else out[out.length - 1].push(fecha);
  }
  return out;
}

/** Jornal efectivo del obrero: override propio si existe, si no el de la categoría, si no 0. */
export function jornalEfectivo(overrideObrero: number | null, valorCategoria: number | null): number {
  if (overrideObrero != null) return overrideObrero;
  return valorCategoria ?? 0;
}

/** Valor de la hora derivado del jornal (día de HORAS_JORNAL horas). */
export function valorHora(valorJornal: number): number {
  return valorJornal / HORAS_JORNAL;
}

/** Horas entre dos horarios "HH:MM" del mismo día. 0 si falta alguno o el rango es inválido. */
export function horasEntre(desde: string, hasta: string): number {
  const aMin = (t: string) => {
    const [h, m] = (t ?? "").split(":").map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
  };
  const d = aMin(desde), h = aMin(hasta);
  if (!Number.isFinite(d) || !Number.isFinite(h)) return 0;
  const horas = (h - d) / 60;
  return horas > 0 ? Math.round(horas * 100) / 100 : 0;
}

export type FilaCalc = { obreroId: number; obraId: number; horas: number };

export function devengadoPorObrero(filas: FilaCalc[], tarifa: (obreroId: number) => number): Map<number, number> {
  const m = new Map<number, number>();
  for (const f of filas) m.set(f.obreroId, (m.get(f.obreroId) ?? 0) + f.horas * tarifa(f.obreroId));
  return m;
}

export function costoPorObra(filas: FilaCalc[], tarifa: (obreroId: number) => number): Map<number, number> {
  const m = new Map<number, number>();
  for (const f of filas) m.set(f.obraId, (m.get(f.obraId) ?? 0) + f.horas * tarifa(f.obreroId));
  return m;
}

export function saldo(devengado: number, adelantos: number): number {
  return devengado - adelantos;
}

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/** Etiqueta legible de una quincena a partir de su fecha de inicio ("yyyy-mm-dd"). */
export function etiquetaQuincena(fechaInicio: string): string {
  const [anio, mes, dia] = fechaInicio.split("-").map(Number);
  const mitad = dia <= 15 ? "1ª" : "2ª";
  return `${mitad} quincena · ${MESES[mes - 1]} ${anio}`;
}

/** Cantidad de días distintos con al menos un bloque trabajado. */
export function diasTrabajados(filas: { fecha: string; tipo: string }[]): number {
  const dias = new Set<string>();
  for (const f of filas) if (f.tipo === "trabajado") dias.add(f.fecha);
  return dias.size;
}

export type EstadoCargaObrero = { movimientos: number; diasTrabajados: number; ultimaFecha: string | null };

/**
 * Estado de carga de cada obrero en una quincena, derivado de sus movimientos guardados.
 * `movimientos` 0 (obrero ausente del map) = sin cargar. `ultimaFecha` ("yyyy-MM-dd") = último
 * día con dato → para mostrar "cargado hasta DD/MM" y que el jefe vea hasta dónde llegó.
 */
export function estadoCargaPorObrero(
  filas: { obreroId: number; tipo: string; fecha: string }[],
): Record<number, EstadoCargaObrero> {
  const acc = new Map<number, { mov: number; dias: Set<string>; ult: string | null }>();
  for (const f of filas) {
    const e = acc.get(f.obreroId) ?? { mov: 0, dias: new Set<string>(), ult: null };
    e.mov += 1;
    if (f.tipo === "trabajado") e.dias.add(f.fecha);
    if (e.ult == null || f.fecha > e.ult) e.ult = f.fecha; // ISO ordena lexicográficamente
    acc.set(f.obreroId, e);
  }
  const out: Record<number, EstadoCargaObrero> = {};
  for (const [id, e] of acc) out[id] = { movimientos: e.mov, diasTrabajados: e.dias.size, ultimaFecha: e.ult };
  return out;
}

export type LineaComprobante = { obraId: number; horas: number; precioUnit: number };

/**
 * Líneas de factura de un obrero: una por obra, sumando las horas trabajadas en cada una.
 * `precioHora` es la tarifa/hora congelada del obrero (igual en todas las líneas).
 * Ignora ausencias y filas sin obra. Si la tarifa es 0 → sin líneas (no se factura).
 */
export function construirLineasComprobante(
  filas: { tipo: string; odooObraId: number | null; horas: number }[],
  precioHora: number,
): LineaComprobante[] {
  if (precioHora <= 0) return [];
  const porObra = new Map<number, number>();
  for (const f of filas) {
    if (f.tipo !== "trabajado" || f.odooObraId == null) continue;
    porObra.set(f.odooObraId, (porObra.get(f.odooObraId) ?? 0) + f.horas);
  }
  return [...porObra.entries()]
    .map(([obraId, horas]) => ({ obraId, horas, precioUnit: precioHora }))
    .sort((a, b) => a.obraId - b.obraId);
}

/**
 * Desglosa horas totales en jornales completos (de HORAS_JORNAL hs) + sobrante.
 * Ej: 20 hs → { jornales: 2, sobrante: 4 }. Útil para narrar la liquidación.
 */
export function desglosarJornales(horas: number): { jornales: number; sobrante: number } {
  const jornales = Math.floor(horas / HORAS_JORNAL);
  const sobrante = Math.round((horas - jornales * HORAS_JORNAL) * 100) / 100;
  return { jornales, sobrante };
}
