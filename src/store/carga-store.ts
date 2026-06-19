import { create } from "zustand";

export type FilaBorrador = { id: string; fecha: string; obraId: number | null; horas: number };

type CargaState = {
  filas: FilaBorrador[];
  agregarFila: (fecha: string) => void;
  editarFila: (id: string, patch: Partial<FilaBorrador>) => void;
  quitarFila: (id: string) => void;
  reset: () => void;
};

let seq = 0;
export const useCargaStore = create<CargaState>((set) => ({
  filas: [],
  agregarFila: (fecha) => set((s) => ({ filas: [...s.filas, { id: `f${++seq}`, fecha, obraId: null, horas: 8 }] })),
  editarFila: (id, patch) => set((s) => ({ filas: s.filas.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),
  quitarFila: (id) => set((s) => ({ filas: s.filas.filter((f) => f.id !== id) })),
  reset: () => set({ filas: [] }),
}));
