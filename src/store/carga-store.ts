import { create } from "zustand";

// Una asignación = una obra del día, con su propio horario. Varias por día = multi-obra.
export type Asignacion = { obraId: number | null; desde: string; hasta: string; horas: number };

// Un día de la quincena (fecha fija, precargada). "trabajado" se muestra como "Presente".
export type DiaBorrador = {
  id: string; // = fecha (única dentro de la quincena)
  fecha: string; // "yyyy-MM-dd"
  tipo: "trabajado" | "ausente";
  asignaciones: Asignacion[]; // 1+ obras si Presente; se ignora si Ausente
  comentario: string; // motivo de ausencia / nota
};

type CargaState = {
  dias: DiaBorrador[];
  cargarDias: (dias: DiaBorrador[]) => void;
  editarDia: (id: string, patch: Partial<DiaBorrador>) => void;
  editarAsignacion: (diaId: string, i: number, patch: Partial<Asignacion>) => void;
  agregarObra: (diaId: string) => void;
  quitarObra: (diaId: string, i: number) => void;
};

const mapDia = (s: CargaState, diaId: string, fn: (d: DiaBorrador) => DiaBorrador) => ({
  dias: s.dias.map((d) => (d.id === diaId ? fn(d) : d)),
});

export const useCargaStore = create<CargaState>((set) => ({
  dias: [],
  cargarDias: (dias) => set({ dias }),
  editarDia: (id, patch) => set((s) => mapDia(s, id, (d) => ({ ...d, ...patch }))),
  editarAsignacion: (diaId, i, patch) =>
    set((s) => mapDia(s, diaId, (d) => ({ ...d, asignaciones: d.asignaciones.map((a, j) => (j === i ? { ...a, ...patch } : a)) }))),
  agregarObra: (diaId) =>
    set((s) => mapDia(s, diaId, (d) => ({ ...d, asignaciones: [...d.asignaciones, { obraId: null, desde: "", hasta: "", horas: 0 }] }))),
  quitarObra: (diaId, i) =>
    set((s) => mapDia(s, diaId, (d) => ({ ...d, asignaciones: d.asignaciones.filter((_, j) => j !== i) }))),
}));
