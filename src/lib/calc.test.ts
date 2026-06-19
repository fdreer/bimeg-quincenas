import { test, expect } from "vitest";
import { rangoQuincena, devengadoPorObrero, costoPorObra, saldo, tarifaEfectiva } from "./calc";

test("rangoQuincena 1ra quincena", () => {
  expect(rangoQuincena(2026, 6, 1)).toEqual({ inicio: "2026-06-01", fin: "2026-06-15" });
});
test("rangoQuincena 2da quincena (junio = 30)", () => {
  expect(rangoQuincena(2026, 6, 2)).toEqual({ inicio: "2026-06-16", fin: "2026-06-30" });
});
test("rangoQuincena 2da quincena (febrero = 28)", () => {
  expect(rangoQuincena(2026, 2, 2)).toEqual({ inicio: "2026-02-16", fin: "2026-02-28" });
});

const filas = [
  { obreroId: 7, obraId: 100, horas: 8 }, // Tres Cerritos
  { obreroId: 7, obraId: 200, horas: 8 }, // La Verbena
  { obreroId: 9, obraId: 100, horas: 4 },
];
const tarifa = (id: number) => (id === 7 ? 3500 : 3000);

test("devengadoPorObrero suma horas x valor hora", () => {
  const m = devengadoPorObrero(filas, tarifa);
  expect(m.get(7)).toBe(56000); // 16h * 3500
  expect(m.get(9)).toBe(12000); // 4h * 3000
});
test("costoPorObra agrupa por obra", () => {
  const m = costoPorObra(filas, tarifa);
  expect(m.get(100)).toBe(40000); // 8*3500 + 4*3000
  expect(m.get(200)).toBe(28000); // 8*3500
});
test("saldo = devengado - adelantos", () => {
  expect(saldo(56000, 20000)).toBe(36000);
});

// Override por obrero (decisión Q3): un valor propio del obrero pisa al de su categoría.
test("tarifaEfectiva: el override del obrero pisa a la categoría", () => {
  const overridePorObrero = new Map([[7, 5000]]);
  const tarifaPorPuesto = new Map([[3, 3500]]);
  expect(tarifaEfectiva(7, 3, overridePorObrero, tarifaPorPuesto)).toBe(5000);
});
test("tarifaEfectiva: sin override usa la tarifa de la categoría", () => {
  const tarifaPorPuesto = new Map([[3, 3500]]);
  expect(tarifaEfectiva(9, 3, new Map(), tarifaPorPuesto)).toBe(3500);
});
test("tarifaEfectiva: sin override ni categoría devuelve 0", () => {
  expect(tarifaEfectiva(9, null, new Map(), new Map())).toBe(0);
});
