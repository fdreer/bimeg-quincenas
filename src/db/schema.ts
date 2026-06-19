import { pgTable, serial, text, integer, numeric, date, timestamp, unique } from "drizzle-orm/pg-core";

// Tarifa BASE por categoría (puesto de Odoo = hr.job).
export const categorias = pgTable("categorias", {
  id: serial("id").primaryKey(),
  odooPuestoId: integer("odoo_puesto_id").notNull().unique(),
  nombre: text("nombre").notNull(),
  valorHora: numeric("valor_hora", { precision: 12, scale: 2 }).notNull(),
  actualizadoEn: timestamp("actualizado_en").defaultNow().notNull(),
});

// Override opcional de valor hora por obrero (pisa el de su categoría).
export const tarifasObrero = pgTable("tarifas_obrero", {
  id: serial("id").primaryKey(),
  odooObreroId: integer("odoo_obrero_id").notNull().unique(),
  valorHora: numeric("valor_hora", { precision: 12, scale: 2 }).notNull(),
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

// Una fila por día/obra de cada obrero (espeja la tarja).
export const horas = pgTable("horas", {
  id: serial("id").primaryKey(),
  quincenaId: integer("quincena_id").notNull().references(() => quincenas.id, { onDelete: "cascade" }),
  odooObreroId: integer("odoo_obrero_id").notNull(),
  odooObraId: integer("odoo_obra_id").notNull(),
  fecha: date("fecha").notNull(),
  horas: numeric("horas", { precision: 5, scale: 2 }).notNull(),
}, (t) => ({ diaUnico: unique().on(t.quincenaId, t.odooObreroId, t.fecha, t.odooObraId) }));

// Snapshot escrito AL CERRAR: congela tarifa y adelantos para fijar el histórico.
export const liquidaciones = pgTable("liquidaciones", {
  id: serial("id").primaryKey(),
  quincenaId: integer("quincena_id").notNull().references(() => quincenas.id, { onDelete: "cascade" }),
  odooObreroId: integer("odoo_obrero_id").notNull(),
  valorHora: numeric("valor_hora", { precision: 12, scale: 2 }).notNull(),
  adelantos: numeric("adelantos", { precision: 12, scale: 2 }).notNull(),
}, (t) => ({ obreroUnico: unique().on(t.quincenaId, t.odooObreroId) }));
