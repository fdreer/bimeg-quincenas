"use server";
import { db } from "@/db";
import { obreros, categorias } from "@/db/schema";
import { obtenerContactosObreros } from "@/lib/odoo/queries";
import { asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

// Botón "Actualizar contactos": trae de Odoo los contactos etiquetados "Obrero" y hace upsert.
// Solo refresca el nombre; preserva categoría, override y alias ya cargados.
export async function sincronizarObreros() {
  const contactos = await obtenerContactosObreros();
  if (contactos.length === 0) return;
  await db.insert(obreros)
    .values(contactos.map((c) => ({ odooContactoId: c.odooContactoId, nombre: c.nombre, dni: c.dni })))
    .onConflictDoUpdate({ target: obreros.odooContactoId, set: { nombre: sql`excluded.nombre`, dni: sql`excluded.dni` } });
  revalidatePath("/obreros");
  revalidatePath("/carga"); // /carga también lista obreros: que vea los nuevos al toque
}

export async function listarObreros() {
  const [filas, cats] = await Promise.all([
    db.select().from(obreros).orderBy(asc(obreros.nombre)),
    db.select().from(categorias).orderBy(asc(categorias.nombre)),
  ]);
  return { obreros: filas, categorias: cats };
}

export async function guardarObrero(
  id: number,
  datos: { categoriaId: number | null; valorJornal: number | null; aliasCbu: string | null },
) {
  await db.update(obreros)
    .set({
      categoriaId: datos.categoriaId,
      valorJornal: datos.valorJornal != null ? String(datos.valorJornal) : null,
      aliasCbu: datos.aliasCbu,
      actualizadoEn: sql`now()`,
    })
    .where(eq(obreros.id, id));
  revalidatePath("/obreros");
}
