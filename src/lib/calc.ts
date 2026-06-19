import { endOfMonth, format } from "date-fns";

const fmt = (d: Date) => format(d, "yyyy-MM-dd");

/** Horas de un jornal completo. Cambiar la jornada estándar = una línea. */
export const HORAS_JORNAL = 8;

/** Rango de una quincena. mitad=1 → 1 al 15; mitad=2 → 16 al fin de mes. */
export function rangoQuincena(anio: number, mes: number, mitad: 1 | 2): { inicio: string; fin: string } {
  const primero = new Date(anio, mes - 1, 1);
  if (mitad === 1) return { inicio: fmt(new Date(anio, mes - 1, 1)), fin: fmt(new Date(anio, mes - 1, 15)) };
  return { inicio: fmt(new Date(anio, mes - 1, 16)), fin: fmt(endOfMonth(primero)) };
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
