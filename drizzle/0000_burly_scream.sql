CREATE TABLE "categorias" (
	"id" serial PRIMARY KEY NOT NULL,
	"odoo_puesto_id" integer NOT NULL,
	"nombre" text NOT NULL,
	"valor_hora" numeric(12, 2) NOT NULL,
	"actualizado_en" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "categorias_odoo_puesto_id_unique" UNIQUE("odoo_puesto_id")
);
--> statement-breakpoint
CREATE TABLE "horas" (
	"id" serial PRIMARY KEY NOT NULL,
	"quincena_id" integer NOT NULL,
	"odoo_obrero_id" integer NOT NULL,
	"odoo_obra_id" integer NOT NULL,
	"fecha" date NOT NULL,
	"horas" numeric(5, 2) NOT NULL,
	CONSTRAINT "horas_quincena_id_odoo_obrero_id_fecha_odoo_obra_id_unique" UNIQUE("quincena_id","odoo_obrero_id","fecha","odoo_obra_id")
);
--> statement-breakpoint
CREATE TABLE "liquidaciones" (
	"id" serial PRIMARY KEY NOT NULL,
	"quincena_id" integer NOT NULL,
	"odoo_obrero_id" integer NOT NULL,
	"valor_hora" numeric(12, 2) NOT NULL,
	"adelantos" numeric(12, 2) NOT NULL,
	CONSTRAINT "liquidaciones_quincena_id_odoo_obrero_id_unique" UNIQUE("quincena_id","odoo_obrero_id")
);
--> statement-breakpoint
CREATE TABLE "quincenas" (
	"id" serial PRIMARY KEY NOT NULL,
	"odoo_empresa_id" integer NOT NULL,
	"fecha_inicio" date NOT NULL,
	"fecha_fin" date NOT NULL,
	"estado" text DEFAULT 'borrador' NOT NULL,
	"cerrada_en" timestamp,
	"creada_en" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "quincenas_odoo_empresa_id_fecha_inicio_fecha_fin_unique" UNIQUE("odoo_empresa_id","fecha_inicio","fecha_fin")
);
--> statement-breakpoint
CREATE TABLE "tarifas_obrero" (
	"id" serial PRIMARY KEY NOT NULL,
	"odoo_obrero_id" integer NOT NULL,
	"valor_hora" numeric(12, 2) NOT NULL,
	"actualizado_en" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tarifas_obrero_odoo_obrero_id_unique" UNIQUE("odoo_obrero_id")
);
--> statement-breakpoint
ALTER TABLE "horas" ADD CONSTRAINT "horas_quincena_id_quincenas_id_fk" FOREIGN KEY ("quincena_id") REFERENCES "public"."quincenas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidaciones" ADD CONSTRAINT "liquidaciones_quincena_id_quincenas_id_fk" FOREIGN KEY ("quincena_id") REFERENCES "public"."quincenas"("id") ON DELETE cascade ON UPDATE no action;