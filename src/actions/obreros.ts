"use server";
import { db } from "@/db";
import { obreros, categorias } from "@/db/schema";
import { obtenerContactosObreros } from "@/lib/odoo/queries";
import { requireAdmin, requireUser } from "@/lib/auth-server";
import { asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

// Botón "Actualizar contactos": trae de Odoo los contactos etiquetados "Obrero" y hace upsert.
// Refresca nombre y DNI; preserva categoría, override y alias ya cargados. Devuelve cuántos.
export async function sincronizarObreros() {
  await requireAdmin();
  const contactos = await obtenerContactosObreros();
  if (contactos.length === 0) return 0;
  await db.insert(obreros)
    .values(contactos.map((c) => ({ odooContactoId: c.odooContactoId, nombre: c.nombre, dni: c.dni })))
    // coalesce: no pisar un DNI ya cargado si Odoo lo devuelve vacío.
    .onConflictDoUpdate({ target: obreros.odooContactoId, set: { nombre: sql`excluded.nombre`, dni: sql`coalesce(excluded.dni, ${obreros.dni})` } });
  revalidatePath("/obreros");
  revalidatePath("/carga"); // /carga también lista obreros: que vea los nuevos al toque
  return contactos.length;
}

export async function listarObreros() {
  await requireUser();
  const [filas, cats] = await Promise.all([
    db.select().from(obreros).orderBy(asc(obreros.nombre)),
    db.select().from(categorias).orderBy(asc(categorias.nombre)),
  ]);
  return { obreros: filas, categorias: cats };
}

export async function guardarObrero(
  id: number,
  datos: { categoriaId: number | null; valorJornal: number | null; aliasCbu: string | null; habilitado: boolean },
) {
  await requireAdmin();
  await db.update(obreros)
    .set({
      categoriaId: datos.categoriaId,
      valorJornal: datos.valorJornal != null ? String(datos.valorJornal) : null,
      aliasCbu: datos.aliasCbu,
      habilitado: datos.habilitado,
      actualizadoEn: sql`now()`,
    })
    .where(eq(obreros.id, id));
  revalidatePath("/obreros");
  revalidatePath("/carga");
}
