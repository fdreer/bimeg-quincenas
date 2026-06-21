import { test, expect } from "vitest";
import { rangoQuincena, devengadoPorObrero, costoPorObra, saldo, jornalEfectivo, valorHora, horasEntre, HORAS_JORNAL, etiquetaQuincena, diasTrabajados } from "./calc";

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

// Horas por rango horario (8–13 + 14–17 = 5 + 3 = 8).
test("horasEntre calcula el rango", () => {
  expect(horasEntre("08:00", "13:00")).toBe(5);
  expect(horasEntre("14:00", "17:00")).toBe(3);
});
test("horasEntre con medias horas", () => {
  expect(horasEntre("08:30", "12:00")).toBe(3.5);
});
test("horasEntre devuelve 0 si falta un horario o el rango es inválido", () => {
  expect(horasEntre("", "")).toBe(0);
  expect(horasEntre("17:00", "08:00")).toBe(0);
});

test("etiquetaQuincena: 1ª quincena (día 1)", () => {
  expect(etiquetaQuincena("2026-06-01")).toBe("1ª quincena · Jun 2026");
});
test("etiquetaQuincena: 2ª quincena (día 16)", () => {
  expect(etiquetaQuincena("2026-06-16")).toBe("2ª quincena · Jun 2026");
});
test("etiquetaQuincena: otro mes (febrero)", () => {
  expect(etiquetaQuincena("2026-02-16")).toBe("2ª quincena · Feb 2026");
});

test("diasTrabajados: cuenta días distintos trabajados (multi-obra mismo día = 1)", () => {
  const filasDias = [
    { fecha: "2026-06-01", tipo: "trabajado" }, // obra A
    { fecha: "2026-06-01", tipo: "trabajado" }, // obra B, mismo día
    { fecha: "2026-06-02", tipo: "trabajado" },
    { fecha: "2026-06-03", tipo: "ausente" },   // no cuenta
  ];
  expect(diasTrabajados(filasDias)).toBe(2);
});
