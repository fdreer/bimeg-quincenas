CREATE TABLE "categorias" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"valor_jornal" numeric(12, 2) NOT NULL,
	"actualizado_en" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "horas" (
	"id" serial PRIMARY KEY NOT NULL,
	"quincena_id" integer NOT NULL,
	"obrero_id" integer NOT NULL,
	"tipo" text DEFAULT 'trabajado' NOT NULL,
	"odoo_obra_id" integer,
	"fecha" date NOT NULL,
	"desde" text,
	"hasta" text,
	"horas" numeric(5, 2) NOT NULL,
	"comentario" text
);
--> statement-breakpoint
CREATE TABLE "liquidaciones" (
	"id" serial PRIMARY KEY NOT NULL,
	"quincena_id" integer NOT NULL,
	"obrero_id" integer NOT NULL,
	"valor_jornal" numeric(12, 2) NOT NULL,
	"adelantos" numeric(12, 2) NOT NULL,
	CONSTRAINT "liquidaciones_quincena_id_obrero_id_unique" UNIQUE("quincena_id","obrero_id")
);
--> statement-breakpoint
CREATE TABLE "obreros" (
	"id" serial PRIMARY KEY NOT NULL,
	"odoo_contacto_id" integer NOT NULL,
	"nombre" text NOT NULL,
	"categoria_id" integer,
	"valor_jornal" numeric(12, 2),
	"alias_cbu" text,
	"actualizado_en" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "obreros_odoo_contacto_id_unique" UNIQUE("odoo_contacto_id")
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
ALTER TABLE "horas" ADD CONSTRAINT "horas_quincena_id_quincenas_id_fk" FOREIGN KEY ("quincena_id") REFERENCES "public"."quincenas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horas" ADD CONSTRAINT "horas_obrero_id_obreros_id_fk" FOREIGN KEY ("obrero_id") REFERENCES "public"."obreros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidaciones" ADD CONSTRAINT "liquidaciones_quincena_id_quincenas_id_fk" FOREIGN KEY ("quincena_id") REFERENCES "public"."quincenas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidaciones" ADD CONSTRAINT "liquidaciones_obrero_id_obreros_id_fk" FOREIGN KEY ("obrero_id") REFERENCES "public"."obreros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obreros" ADD CONSTRAINT "obreros_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE no action ON UPDATE no action;