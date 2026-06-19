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
  duplicarFila: (id: string) => void;
  editarFila: (id: string, patch: Partial<FilaBorrador>) => void;
  quitarFila: (id: string) => void;
  reset: () => void;
};

let seq = 0;
export const useCargaStore = create<CargaState>((set) => ({
  filas: [],
  agregarFila: (fila) => set((s) => ({ filas: [...s.filas, { id: `f${++seq}`, ...fila }] })),
  // Inserta otro bloque del mismo día/obra justo debajo (turno partido), con horario en blanco.
  duplicarFila: (id) => set((s) => {
    const i = s.filas.findIndex((f) => f.id === id);
    if (i === -1) return s;
    const copia: FilaBorrador = { ...s.filas[i], id: `f${++seq}`, desde: "", hasta: "", horas: 0, comentario: "" };
    const filas = [...s.filas];
    filas.splice(i + 1, 0, copia);
    return { filas };
  }),
  editarFila: (id, patch) => set((s) => ({ filas: s.filas.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),
  quitarFila: (id) => set((s) => ({ filas: s.filas.filter((f) => f.id !== id) })),
  reset: () => set({ filas: [] }),
}));
