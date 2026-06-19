import { endOfMonth, format } from "date-fns";

const fmt = (d: Date) => format(d, "yyyy-MM-dd");

/** Rango de una quincena. mitad=1 → 1 al 15; mitad=2 → 16 al fin de mes. */
export function rangoQuincena(anio: number, mes: number, mitad: 1 | 2): { inicio: string; fin: string } {
  const primero = new Date(anio, mes - 1, 1);
  if (mitad === 1) return { inicio: fmt(new Date(anio, mes - 1, 1)), fin: fmt(new Date(anio, mes - 1, 15)) };
  return { inicio: fmt(new Date(anio, mes - 1, 16)), fin: fmt(endOfMonth(primero)) };
}

export type FilaCalc = { obreroId: number; obraId: number; horas: number };

/** Tarifa efectiva: override del obrero si existe, si no la de su categoría, si no 0. */
export function tarifaEfectiva(
  obreroId: number,
  puestoId: number | null,
  overridePorObrero: Map<number, number>,
  tarifaPorPuesto: Map<number, number>,
): number {
  const override = overridePorObrero.get(obreroId);
  if (override != null) return override;
  if (puestoId != null) return tarifaPorPuesto.get(puestoId) ?? 0;
  return 0;
}

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
