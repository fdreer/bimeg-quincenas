import { ReceiptTextIcon } from "lucide-react";
import { listarQuincenas, construirSaldos } from "@/actions/saldos";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { SaldosTabla } from "./saldos-tabla";

export const dynamic = "force-dynamic"; // lee datos vivos (DB + Odoo) en cada request

export default async function SaldosPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const lista = await listarQuincenas();

  if (lista.length === 0) {
    return (
      <main className="mx-auto max-w-5xl p-4 sm:p-6">
        <h1 className="mb-4 text-xl font-semibold tracking-tight">Saldos</h1>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><ReceiptTextIcon /></EmptyMedia>
            <EmptyTitle>No hay quincenas cargadas</EmptyTitle>
            <EmptyDescription>Cargá horas en <a className="underline" href="/carga">/carga</a> y volvé acá.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </main>
    );
  }

  const elegida = sp.q && lista.some((q) => String(q.id) === sp.q) ? Number(sp.q) : lista[0].id;
  const data = await construirSaldos(elegida);
  if (!data) return <main className="mx-auto max-w-5xl p-4 sm:p-6">Quincena no encontrada.</main>;

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <h1 className="text-xl font-semibold tracking-tight">Saldos · {data.quincena.etiqueta}</h1>
      <SaldosTabla
        quincenas={lista}
        quincenaId={elegida}
        empresaNombre={data.quincena.empresaNombre}
        saldos={data.saldos}
        costos={data.costos}
        totales={data.totales}
      />
    </main>
  );
}
