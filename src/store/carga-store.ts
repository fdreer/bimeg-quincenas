import { create } from "zustand";

export type FilaBorrador = {
  id: string;
  fecha: string;
  tipo: "trabajado" | "ausente";
  obraId: number | null;
  desde: string; // "HH:MM" o ""
  hasta: string;
  horas: number;
  comentario: string;
};

type CargaState = {
  filas: FilaBorrador[];
  agregarFila: (fila: Omit<FilaBorrador, "id">) => void;
  editarFila: (id: string, patch: Partial<FilaBorrador>) => void;
  quitarFila: (id: string) => void;
  reset: () => void;
};

let seq = 0;
export const useCargaStore = create<CargaState>((set) => ({
  filas: [],
  agregarFila: (fila) => set((s) => ({ filas: [...s.filas, { id: `f${++seq}`, ...fila }] })),
  editarFila: (id, patch) => set((s) => ({ filas: s.filas.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),
  quitarFila: (id) => set((s) => ({ filas: s.filas.filter((f) => f.id !== id) })),
  reset: () => set({ filas: [] }),
}));
