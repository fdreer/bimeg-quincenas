import { obtenerEmpresas, obtenerObras } from "@/lib/odoo/queries";
import { listarObreros } from "@/actions/obreros";
import { CargaForm } from "./carga-form";

export const dynamic = "force-dynamic";

export default async function CargaPage() {
  const empresas = await obtenerEmpresas();
  const obrasPorEmpresa: Record<number, Awaited<ReturnType<typeof obtenerObras>>> = {};
  await Promise.all(empresas.map(async (e) => { obrasPorEmpresa[e.id] = await obtenerObras(e.id); }));
  const { obreros } = await listarObreros();
  const obrerosLite = obreros.map((o) => ({ id: o.id, nombre: o.nombre }));

  return (
    <main className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
      <h1 className="text-xl font-semibold">Carga de horas</h1>
      {obrerosLite.length === 0 ? (
        <p className="text-muted-foreground">
          No hay obreros. Andá a <a className="underline" href="/obreros">/obreros</a> y tocá &quot;Actualizar contactos&quot;.
        </p>
      ) : (
        <CargaForm empresas={empresas} obrasPorEmpresa={obrasPorEmpresa} obreros={obrerosLite} />
      )}
    </main>
  );
}
