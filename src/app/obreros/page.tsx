import { UsersIcon } from "lucide-react";
import { listarObreros, sincronizarObreros } from "@/actions/obreros";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import { ObrerosTabla } from "./obreros-tabla";

export const dynamic = "force-dynamic"; // lee datos vivos de la DB en cada request

export default async function ObrerosPage() {
  const { obreros, categorias } = await listarObreros();
  return (
    <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Obreros</h1>
        <form action={sincronizarObreros}>
          <Button type="submit" variant="secondary">Actualizar contactos</Button>
        </form>
      </div>

      {categorias.length === 0 && (
        <p className="text-sm text-muted-foreground">Cargá primero las categorías en <a className="underline" href="/categorias">/categorias</a> para poder asignarlas.</p>
      )}

      {obreros.length === 0 ? (
        <Empty className="mt-4">
          <EmptyHeader>
            <EmptyMedia variant="icon"><UsersIcon /></EmptyMedia>
            <EmptyTitle>No hay obreros todavía</EmptyTitle>
            <EmptyDescription>
              Etiquetá los contactos como “Obrero” en Odoo y actualizá.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <form action={sincronizarObreros}>
              <Button type="submit" variant="secondary">Actualizar contactos</Button>
            </form>
          </EmptyContent>
        </Empty>
      ) : (
        <ObrerosTabla
          obreros={obreros.map((o) => ({ id: o.id, nombre: o.nombre, categoriaId: o.categoriaId, valorJornal: o.valorJornal, aliasCbu: o.aliasCbu }))}
          categorias={categorias.map((c) => ({ id: c.id, nombre: c.nombre, valorJornal: c.valorJornal }))}
        />
      )}
    </main>
  );
}
