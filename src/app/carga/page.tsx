import Link from "next/link";
import { UsersIcon } from "lucide-react";
import { obtenerObras } from "@/lib/odoo/queries";
import { EMPRESA_BIMEG } from "@/lib/constantes";
import { listarObreros } from "@/actions/obreros";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { CargaForm } from "./carga-form";

export const dynamic = "force-dynamic";

export default async function CargaPage() {
  const obras = await obtenerObras(EMPRESA_BIMEG);
  const { obreros } = await listarObreros();
  const obrerosLite = obreros.filter((o) => o.habilitado).map((o) => ({ id: o.id, nombre: o.nombre, dni: o.dni }));

  return (
    <main className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Carga de horas</h1>
      {obrerosLite.length === 0 ? (
        <Empty className="mt-4">
          <EmptyHeader>
            <EmptyMedia variant="icon"><UsersIcon /></EmptyMedia>
            <EmptyTitle>No hay obreros todavía</EmptyTitle>
            <EmptyDescription>
              Andá a <Link href="/obreros">Obreros</Link> y tocá “Actualizar contactos”.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <CargaForm obras={obras} obreros={obrerosLite} />
      )}
    </main>
  );
}
