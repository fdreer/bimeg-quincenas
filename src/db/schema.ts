import { pgTable, serial, text, integer, numeric, date, timestamp, unique } from "drizzle-orm/pg-core";

// Categorías propias de la app (ya NO ligadas a Odoo). El valor es por JORNAL (día de 8 hs).
export const categorias = pgTable("categorias", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  valorJornal: numeric("valor_jornal", { precision: 12, scale: 2 }).notNull(),
  actualizadoEn: timestamp("actualizado_en").defaultNow().notNull(),
});

// Obreros sincronizados de Contactos de Odoo (etiqueta "Obrero") + datos propios de la app.
export const obreros = pgTable("obreros", {
  id: serial("id").primaryKey(),
  odooContactoId: integer("odoo_contacto_id").notNull().unique(), // res.partner
  nombre: text("nombre").notNull(), // se refresca al sincronizar
  categoriaId: integer("categoria_id").references(() => categorias.id), // la asignás vos
  valorJornal: numeric("valor_jornal", { precision: 12, scale: 2 }), // override opcional; null = usa la categoría
  aliasCbu: text("alias_cbu"), // dato para transferir
  dni: text("dni"), // identificación; se trae de Odoo (vat) al sincronizar, no editable
  actualizadoEn: timestamp("actualizado_en").defaultNow().notNull(),
});

export const quincenas = pgTable("quincenas", {
  id: serial("id").primaryKey(),
  odooEmpresaId: integer("odoo_empresa_id").notNull(),
  fechaInicio: date("fecha_inicio").notNull(),
  fechaFin: date("fecha_fin").notNull(),
  estado: text("estado").notNull().default("borrador"), // borrador | cerrada
  cerradaEn: timestamp("cerrada_en"),
  creadaEn: timestamp("creada_en").defaultNow().notNull(),
}, (t) => ({ periodoUnico: unique().on(t.odooEmpresaId, t.fechaInicio, t.fechaFin) }));

// Un movimiento por día: un bloque trabajado (obra + rango horario) o una ausencia.
// Varias filas por día permiten multi-obra y turnos partidos (8–13, 14–17).
export const horas = pgTable("horas", {
  id: serial("id").primaryKey(),
  quincenaId: integer("quincena_id").notNull().references(() => quincenas.id, { onDelete: "cascade" }),
  obreroId: integer("obrero_id").notNull().references(() => obreros.id),
  tipo: text("tipo").notNull().default("trabajado"), // trabajado | ausente
  odooObraId: integer("odoo_obra_id"), // null si ausente
  fecha: date("fecha").notNull(),
  desde: text("desde"), // "HH:MM" (opcional; si está, define las horas)
  hasta: text("hasta"),
  horas: numeric("horas", { precision: 5, scale: 2 }).notNull(), // 0 si ausente
  comentario: text("comentario"), // motivo de ausencia ("Médico") o nota
});

// Snapshot escrito AL CERRAR: congela jornal y adelantos para fijar el histórico.
export const liquidaciones = pgTable("liquidaciones", {
  id: serial("id").primaryKey(),
  quincenaId: integer("quincena_id").notNull().references(() => quincenas.id, { onDelete: "cascade" }),
  obreroId: integer("obrero_id").notNull().references(() => obreros.id),
  valorJornal: numeric("valor_jornal", { precision: 12, scale: 2 }).notNull(),
  adelantos: numeric("adelantos", { precision: 12, scale: 2 }).notNull(),
}, (t) => ({ obreroUnico: unique().on(t.quincenaId, t.obreroId) }));
