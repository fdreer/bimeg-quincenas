import { UsersIcon } from "lucide-react";
import { listarObreros } from "@/actions/obreros";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import { ObrerosTabla } from "./obreros-tabla";
import { ActualizarContactos } from "./actualizar-contactos";
import { requireUser } from "@/lib/auth-server";
import { obtenerObras } from "@/lib/odoo/queries";
import { EMPRESA_BIMEG } from "@/lib/constantes";

export const dynamic = "force-dynamic"; // lee datos vivos de la DB en cada request

export default async function ObrerosPage() {
  const session = await requireUser();
  const esAdmin = session.user.role === "admin";
  const [{ obreros, categorias }, obras] = await Promise.all([listarObreros(), obtenerObras(EMPRESA_BIMEG)]);
  return (
    <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Obreros</h1>
        {esAdmin && <ActualizarContactos />}
      </div>

      {esAdmin && categorias.length === 0 && (
        <p className="text-sm text-muted-foreground">Cargá primero las categorías en <a className="underline" href="/categorias">/categorias</a> para poder asignarlas.</p>
      )}

      {obreros.length === 0 ? (
        <Empty className="mt-4">
          <EmptyHeader>
            <EmptyMedia variant="icon"><UsersIcon /></EmptyMedia>
            <EmptyTitle>No hay obreros todavía</EmptyTitle>
            <EmptyDescription>
              {esAdmin ? "Etiquetá los contactos como “Obrero” en Odoo y actualizá." : "Pedile a un admin que sincronice los contactos."}
            </EmptyDescription>
          </EmptyHeader>
          {esAdmin && (
            <EmptyContent>
              <ActualizarContactos />
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <ObrerosTabla
          puedeEditar={esAdmin}
          obreros={obreros.map((o) => ({ id: o.id, nombre: o.nombre, categoriaId: o.categoriaId, valorJornal: o.valorJornal, aliasCbu: o.aliasCbu, habilitado: o.habilitado, obraHabitualId: o.odooObraHabitualId }))}
          categorias={categorias.map((c) => ({ id: c.id, nombre: c.nombre, valorJornal: c.valorJornal }))}
          obras={obras.map((o) => ({ id: o.id, nombre: o.nombre, cliente: o.cliente }))}
        />
      )}
    </main>
  );
}
