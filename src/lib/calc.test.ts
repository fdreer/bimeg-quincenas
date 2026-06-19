import { test, expect } from "vitest";
import { rangoQuincena, devengadoPorObrero, costoPorObra, saldo, jornalEfectivo, valorHora, HORAS_JORNAL } from "./calc";

test("rangoQuincena 1ra quincena", () => {
  expect(rangoQuincena(2026, 6, 1)).toEqual({ inicio: "2026-06-01", fin: "2026-06-15" });
});
test("rangoQuincena 2da quincena (junio = 30)", () => {
  expect(rangoQuincena(2026, 6, 2)).toEqual({ inicio: "2026-06-16", fin: "2026-06-30" });
});
test("rangoQuincena 2da quincena (febrero = 28)", () => {
  expect(rangoQuincena(2026, 2, 2)).toEqual({ inicio: "2026-02-16", fin: "2026-02-28" });
});

// Modelo de jornal (día de 8 hs): la hora se deriva del jornal.
test("HORAS_JORNAL es 8", () => {
  expect(HORAS_JORNAL).toBe(8);
});
test("valorHora = jornal / 8", () => {
  expect(valorHora(8000)).toBe(1000);
});
test("jornalEfectivo: el override del obrero pisa a la categoría", () => {
  expect(jornalEfectivo(9000, 8000)).toBe(9000);
});
test("jornalEfectivo: sin override usa la categoría", () => {
  expect(jornalEfectivo(null, 8000)).toBe(8000);
});
test("jornalEfectivo: sin override ni categoría devuelve 0", () => {
  expect(jornalEfectivo(null, null)).toBe(0);
});

const filas = [
  { obreroId: 7, obraId: 100, horas: 8 }, // jornal completo
  { obreroId: 7, obraId: 200, horas: 8 },
  { obreroId: 9, obraId: 100, horas: 4 }, // medio jornal
];
const jornal = (id: number) => (id === 7 ? 8000 : 6000);
const tarifa = (id: number) => valorHora(jornal(id));

test("devengadoPorObrero suma horas x (jornal/8)", () => {
  const m = devengadoPorObrero(filas, tarifa);
  expect(m.get(7)).toBe(16000); // 16h * (8000/8)
  expect(m.get(9)).toBe(3000); //  4h * (6000/8)
});
test("medio jornal: 4 hs paga la mitad del jornal", () => {
  const m = devengadoPorObrero([{ obreroId: 7, obraId: 100, horas: 4 }], tarifa);
  expect(m.get(7)).toBe(4000); // 8000 / 2
});
test("costoPorObra agrupa por obra", () => {
  const m = costoPorObra(filas, tarifa);
  expect(m.get(100)).toBe(11000); // 8*1000 + 4*750
  expect(m.get(200)).toBe(8000); //  8*1000
});
test("saldo = devengado - adelantos", () => {
  expect(saldo(16000, 5000)).toBe(11000);
});
