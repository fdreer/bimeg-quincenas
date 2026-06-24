"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRightIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cerrarQuincena, reabrirQuincena } from "@/actions/cierre";
import { sincronizarAhora } from "@/actions/comprobantes";

const money = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);

type Detalle = { fecha: string; obra: string | null; horas: number; tipo: string; comentario: string | null };
type SaldoRow = {
  obreroId: number; nombre: string; aliasCbu: string | null; dni: string | null;
  habilitado: boolean;
  dias: number; horas: number; devengado: number; adelantos: number; saldo: number;
  sinTarifa: boolean; detalle: Detalle[];
};
type Costo = { obra: string; costo: number };
type Totales = { devengado: number; adelantos: number; saldo: number; costo: number };
type Quincena = { id: number; etiqueta: string };
type Registro = { facturaId: number; numero: string; estadoOdoo: string };

// Igual que antes + última columna (Odoo) un poco más ancha para el botón/numero.
const GRID = "sm:grid-cols-[1.75rem_minmax(0,1.4fr)_3.5rem_3.5rem_repeat(3,minmax(5rem,1fr))_6.5rem]";

export function SaldosTabla({ quincenas, quincenaId, estado, saldos, costos, totales, registros }: {
  quincenas: Quincena[]; quincenaId: number; estado: string;
  saldos: SaldoRow[]; costos: Costo[]; totales: Totales; registros: Record<number, Registro>;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState<number | null>(null);
  const [confirmarCerrar, setConfirmarCerrar] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const cerrada = estado === "cerrada";
  const items = Object.fromEntries(quincenas.map((q) => [String(q.id), q.etiqueta]));

  function cerrar() {
    setConfirmarCerrar(false);
    startTransition(async () => {
      try { await cerrarQuincena(quincenaId); toast.success("Quincena cerrada"); router.refresh(); }
      catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo cerrar"); }
    });
  }
  function reabrir() {
    startTransition(async () => {
      try { await reabrirQuincena(quincenaId); toast.success("Quincena reabierta"); router.refresh(); }
      catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo reabrir"); }
    });
  }
  function sincronizar(obreroIds?: number[]) {
    startTransition(async () => {
      try {
        const res = await sincronizarAhora(quincenaId, obreroIds);
        const tocados = res.filter((r) => r.estado === "creado" || r.estado === "actualizado").length;
        const errores = res.filter((r) => r.estado === "error");
        if (tocados) toast.success(`${tocados} comprobante${tocados === 1 ? "" : "s"} sincronizado${tocados === 1 ? "" : "s"} en borrador`);
        if (errores.length) toast.error(`${errores.length} con error: ${errores.map((e) => e.nombre).join(", ")}`);
        if (!tocados && !errores.length) toast.info("Nada que sincronizar");
        router.refresh();
      } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo sincronizar"); }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={cerrada ? "default" : "secondary"}>{cerrada ? "Cerrada" : "Borrador"}</Badge>
        </div>
        <Select items={items} value={String(quincenaId)} onValueChange={(v) => { if (v) router.push(`/saldos?q=${v}`); }}>
          <SelectTrigger className="w-full sm:w-80"><SelectValue /></SelectTrigger>
          <SelectContent>
            {quincenas.map((q) => <SelectItem key={q.id} value={String(q.id)}>{q.etiqueta}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {saldos.length > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Total a pagar</p>
            <p className={`text-2xl font-semibold tabular-nums ${totales.saldo < 0 ? "text-destructive" : ""}`}>{money(totales.saldo)}</p>
          </div>
          <div className="flex items-center gap-2">
            {pendiente && <Loader2Icon className="size-4 animate-spin text-muted-foreground" />}
            {cerrada ? (
              <>
                <Button variant="ghost" onClick={reabrir} disabled={pendiente}>Reabrir</Button>
                <Button onClick={() => sincronizar()} disabled={pendiente} className="w-full sm:w-auto">Sincronizar ahora</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => sincronizar()} disabled={pendiente}>Sincronizar ahora</Button>
                <Button onClick={() => setConfirmarCerrar(true)} disabled={pendiente} className="w-full sm:w-auto">Cerrar quincena</Button>
              </>
            )}
          </div>
        </div>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Saldo por obrero</h2>

        <div className={`hidden gap-3 px-3 text-xs font-medium text-muted-foreground sm:grid ${GRID}`}>
          <span /><span>Obrero</span>
          <span className="text-center">Días</span><span className="text-center">Horas</span>
          <span className="text-center">Devengado</span><span className="text-center">Adelantos</span><span className="text-center">A pagar</span>
          <span className="text-center">Odoo</span>
        </div>

        {saldos.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">No hay horas cargadas en esta quincena.</p>}

        {saldos.map((s) => {
          const open = abierto === s.obreroId;
          const reg = registros[s.obreroId];
          return (
            <div key={s.obreroId} className="rounded-lg border sm:rounded-none sm:border-0 sm:border-b">
              <div className={`grid grid-cols-1 items-center gap-1.5 p-3 sm:gap-3 ${GRID}`}>
                <button
                  onClick={() => setAbierto(open ? null : s.obreroId)}
                  aria-expanded={open}
                  aria-label={`${open ? "Cerrar" : "Ver"} detalle de ${s.nombre}`}
                  className="flex w-fit cursor-pointer items-center gap-1 rounded-md py-0.5 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronRightIcon className={`size-4 transition-transform ${open ? "rotate-90" : ""}`} />
                  <span className="text-xs sm:hidden">{open ? "Ocultar detalle" : "Ver detalle"}</span>
                </button>
                <span className="font-medium">
                  {s.nombre}
                  {!s.habilitado && <Badge variant="secondary" className="ml-2 align-middle text-[10px]">deshabilitado</Badge>}
                  {s.sinTarifa && <Badge variant="destructive" className="ml-2 align-middle text-[10px]">sin tarifa</Badge>}
                </span>
                <span className="text-sm tabular-nums sm:text-center"><span className="text-muted-foreground sm:hidden">Días: </span>{s.dias}</span>
                <span className="text-sm tabular-nums sm:text-center"><span className="text-muted-foreground sm:hidden">Horas: </span>{s.horas}</span>
                <span className="text-sm tabular-nums sm:text-center"><span className="text-muted-foreground sm:hidden">Devengado: </span>{money(s.devengado)}</span>
                <span className="text-sm tabular-nums sm:text-center"><span className="text-muted-foreground sm:hidden">Adelantos: </span>{money(s.adelantos)}</span>
                <span className={`text-sm font-semibold tabular-nums sm:text-center ${s.saldo < 0 ? "text-destructive" : ""}`}>
                  <span className="font-normal text-muted-foreground sm:hidden">A pagar: </span>{money(s.saldo)}
                </span>
                <div className="sm:text-center">
                  {reg ? (
                    <Badge variant="secondary" title={`Factura Odoo #${reg.facturaId} (${reg.estadoOdoo})`}>
                      {reg.numero !== "/" ? reg.numero : `#${reg.facturaId}`}
                    </Badge>
                  ) : !s.sinTarifa ? (
                    <Button variant="outline" size="sm" onClick={() => sincronizar([s.obreroId])} disabled={pendiente} className="w-full">Sincronizar</Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
              </div>

              {open && (
                <div className="border-t bg-muted/30 px-3 py-2 text-sm sm:pl-11">
                  {(s.dni || s.aliasCbu) && (
                    <p className="mb-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                      {s.dni && <span>DNI: <span className="font-mono text-foreground">{s.dni}</span></span>}
                      {s.aliasCbu && <span>Alias/CBU: <span className="font-mono text-foreground">{s.aliasCbu}</span></span>}
                    </p>
                  )}
                  <ul className="space-y-1">
                    {s.detalle.map((d, i) => (
                      <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 tabular-nums">
                        <span className="w-12 text-muted-foreground">{d.fecha.slice(8, 10)}/{d.fecha.slice(5, 7)}</span>
                        {d.tipo === "ausente"
                          ? <span className="italic text-muted-foreground">Ausente{d.comentario ? ` — ${d.comentario}` : ""}</span>
                          : <><span className="min-w-0 flex-1 truncate">{d.obra ?? "—"}</span><span>{d.horas} h</span></>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}

        {saldos.length > 0 && (
          <div className={`grid grid-cols-1 gap-1.5 px-3 pt-2 text-sm font-semibold sm:gap-3 ${GRID}`}>
            <span /><span>Total</span><span className="hidden sm:block" /><span className="hidden sm:block" />
            <span className="tabular-nums sm:text-center"><span className="text-muted-foreground sm:hidden">Devengado: </span>{money(totales.devengado)}</span>
            <span className="tabular-nums sm:text-center"><span className="text-muted-foreground sm:hidden">Adelantos: </span>{money(totales.adelantos)}</span>
            <span className="tabular-nums sm:text-center"><span className="text-muted-foreground sm:hidden">A pagar: </span>{money(totales.saldo)}</span>
            <span className="hidden sm:block" />
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Costo de mano de obra por obra</h2>
        {costos.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">Sin horas trabajadas cargadas en esta quincena.</p>
        ) : (
          <div>
            {costos.map((c) => (
              <div key={c.obra} className="flex items-center justify-between border-b px-3 py-2 text-sm">
                <span className="min-w-0 truncate pr-3">{c.obra}</span>
                <span className="font-medium tabular-nums">{money(c.costo)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between px-3 py-2 text-sm font-semibold">
              <span>Total</span><span className="tabular-nums">{money(totales.costo)}</span>
            </div>
          </div>
        )}
      </section>

      <Dialog open={confirmarCerrar} onOpenChange={setConfirmarCerrar}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Cerrar la quincena?</DialogTitle>
            <DialogDescription>
              Cerrar la quincena congela las tarifas y bloquea la carga de horas. Esta acción se puede revertir con Reabrir.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost">Cancelar</Button>} />
            <Button onClick={cerrar} disabled={pendiente}>Cerrar quincena</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
