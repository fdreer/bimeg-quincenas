"use server";
import { db } from "@/db";
import { categorias } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-server";
import { asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export async function listarCategorias() {
  await requireAdmin();
  return db.select().from(categorias).orderBy(asc(categorias.nombre));
}

const NuevaCategoria = z.object({ nombre: z.string().min(1), valorJornal: z.coerce.number().min(0) });

export async function crearCategoria(formData: FormData) {
  await requireAdmin();
  const datos = NuevaCategoria.parse({ nombre: formData.get("nombre"), valorJornal: formData.get("valorJornal") });
  await db.insert(categorias).values({ nombre: datos.nombre, valorJornal: String(datos.valorJornal) });
  revalidatePath("/categorias");
}

const EditarCategoria = z.object({
  id: z.coerce.number().int(),
  nombre: z.string().min(1),
  valorJornal: z.coerce.number().min(0),
});

export async function guardarCategoria(formData: FormData) {
  await requireAdmin();
  const datos = EditarCategoria.parse({
    id: formData.get("id"),
    nombre: formData.get("nombre"),
    valorJornal: formData.get("valorJornal"),
  });
  await db.update(categorias)
    .set({ nombre: datos.nombre, valorJornal: String(datos.valorJornal), actualizadoEn: sql`now()` })
    .where(eq(categorias.id, datos.id));
  revalidatePath("/categorias");
}
