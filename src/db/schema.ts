import { pgTable, serial, text, integer, numeric, date, timestamp, boolean, unique } from "drizzle-orm/pg-core";

// ─── better-auth ───────────────────────────────────────────────────────────
// Tablas requeridas por better-auth. `role` es el único campo agregado por nosotros.
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"),
  role: text("role").notNull().default("user"), // 'admin' | 'user'
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});
// ───────────────────────────────────────────────────────────────────────────


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
  habilitado: boolean("habilitado").notNull().default(true), // solo admin lo cambia; deshabilitado = no se le cargan horas
  odooObraHabitualId: integer("odoo_obra_habitual_id"), // obra por defecto (account.analytic.account); pre-llena Lun–Vie en /carga
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

// Fila de vida del comprobante por (quincena, obrero): la crea temprano la sync diaria con valores
// placeholder (valorJornal/adelantos se ignoran mientras la quincena está en borrador) y guarda el
// odooFacturaId del borrador. Al CERRAR se congelan jornal y adelantos para fijar el histórico.
export const liquidaciones = pgTable("liquidaciones", {
  id: serial("id").primaryKey(),
  quincenaId: integer("quincena_id").notNull().references(() => quincenas.id, { onDelete: "cascade" }),
  obreroId: integer("obrero_id").notNull().references(() => obreros.id),
  valorJornal: numeric("valor_jornal", { precision: 12, scale: 2 }).notNull(),
  adelantos: numeric("adelantos", { precision: 12, scale: 2 }).notNull(),
  odooFacturaId: integer("odoo_factura_id"),       // account.move id (siempre, aun en borrador)
  odooFacturaNumero: text("odoo_factura_numero"),  // número fiscal; se llena al publicar en Odoo
}, (t) => ({ obreroUnico: unique().on(t.quincenaId, t.obreroId) }));
