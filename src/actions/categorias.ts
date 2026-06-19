"use server";
import { db } from "@/db";
import { categorias } from "@/db/schema";
import { obtenerPuestos } from "@/lib/odoo/queries";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

// Lee los puestos de Odoo y les pega el valor hora guardado en nuestra DB (0 si no tiene).
export async function listarCategorias() {
  const puestos = await obtenerPuestos();
  const guardadas = await db.select().from(categorias);
  const valorPorPuesto = new Map(guardadas.map((c) => [c.odooPuestoId, Number(c.valorHora)]));
  return puestos.map((p) => ({ odooPuestoId: p.id, nombre: p.nombre, valorHora: valorPorPuesto.get(p.id) ?? 0 }));
}

const ValorCategoria = z.object({
  odooPuestoId: z.coerce.number().int(),
  nombre: z.string().min(1),
  valorHora: z.coerce.number().min(0),
});

export async function guardarValorCategoria(formData: FormData) {
  const datos = ValorCategoria.parse({
    odooPuestoId: formData.get("odooPuestoId"),
    nombre: formData.get("nombre"),
    valorHora: formData.get("valorHora"),
  });
  await db.insert(categorias)
    .values({ odooPuestoId: datos.odooPuestoId, nombre: datos.nombre, valorHora: String(datos.valorHora) })
    .onConflictDoUpdate({
      target: categorias.odooPuestoId,
      set: { valorHora: String(datos.valorHora), nombre: datos.nombre, actualizadoEn: sql`now()` },
    });
  revalidatePath("/categorias");
}
