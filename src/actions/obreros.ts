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
    .values(contactos.map((c) => ({ odooContactoId: c.odooContactoId, nombre: c.nombre })))
    .onConflictDoUpdate({ target: obreros.odooContactoId, set: { nombre: sql`excluded.nombre` } });
  revalidatePath("/obreros");
}

export async function listarObreros() {
  const filas = await db.select().from(obreros).orderBy(asc(obreros.nombre));
  const cats = await db.select().from(categorias).orderBy(asc(categorias.nombre));
  return { obreros: filas, categorias: cats };
}

export async function guardarObrero(formData: FormData) {
  const id = Number(formData.get("id"));
  const categoriaRaw = formData.get("categoriaId");
  const jornalRaw = formData.get("valorJornal");
  const aliasRaw = formData.get("aliasCbu");

  const categoriaId = categoriaRaw && categoriaRaw !== "" ? Number(categoriaRaw) : null;
  const valorJornal = jornalRaw && jornalRaw !== "" ? String(Number(jornalRaw)) : null;
  const aliasCbu = aliasRaw && String(aliasRaw).trim() !== "" ? String(aliasRaw).trim() : null;

  await db.update(obreros)
    .set({ categoriaId, valorJornal, aliasCbu, actualizadoEn: sql`now()` })
    .where(eq(obreros.id, id));
  revalidatePath("/obreros");
}
