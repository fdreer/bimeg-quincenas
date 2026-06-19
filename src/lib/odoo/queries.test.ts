import { test, expect } from "vitest";
import { normalizarObrero } from "./queries";

// Odoo devuelve relaciones como [id, "nombre"]. Probamos el normalizador puro.
test("normalizarObrero parsea job_id y work_contact_id como tuplas", () => {
  const r = { id: 7, name: "Gustavo Buczek", job_id: [3, "HERRERO"], work_contact_id: [42, "Gustavo Buczek"] };
  expect(normalizarObrero(r)).toEqual({
    id: 7,
    nombre: "Gustavo Buczek",
    puestoId: 3,
    puestoNombre: "HERRERO",
    contactoId: 42,
  });
});

test("normalizarObrero tolera campos falsos", () => {
  const r = { id: 8, name: "Sin puesto", job_id: false, work_contact_id: false };
  expect(normalizarObrero(r)).toEqual({
    id: 8,
    nombre: "Sin puesto",
    puestoId: null,
    puestoNombre: null,
    contactoId: null,
  });
});
