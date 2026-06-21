"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRightIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const money = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);

// ponytail: placeholder. Cuando definamos la lógica de Odoo, enganchar acá la server action.
const registrarPronto = (que: string) => toast.info(`Registrar ${que} en Odoo — próximamente`);

type Detalle = { fecha: string; obra: string | null; horas: number; tipo: string; comentario: string | null };
type SaldoRow = {
  obreroId: number; nombre: string; aliasCbu: string | null; dni: string | null;
  dias: number; horas: number; devengado: number; adelantos: number; saldo: number;
  sinTarifa: boolean; detalle: Detalle[];
};
type Costo = { obra: string; costo: number };
type Totales = { devengado: number; adelantos: number; saldo: number; costo: number };
type Quincena = { id: number; etiqueta: string };

// Las 3 columnas de plata son 1fr iguales (mismo ancho, flexibles); días/horas/registrar
// con ancho fijo. Como ninguna columna varía entre header, filas y totales, todo queda
// alineado bajo su título. El fix clave vs antes: la col Registrar es fija, no `auto`.
const GRID = "sm:grid-cols-[1.75rem_minmax(0,1.4fr)_3.5rem_3.5rem_repeat(3,minmax(5rem,1fr))_5.5rem]";

export function SaldosTabla({ quincenas, quincenaId, empresaNombre, saldos, costos, totales }: {
  quincenas: Quincena[]; quincenaId: number; empresaNombre: string;
  saldos: SaldoRow[]; costos: Costo[]; totales: Totales;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState<number | null>(null);
  const items = Object.fromEntries(quincenas.map((q) => [String(q.id), q.etiqueta]));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{empresaNombre}</p>
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
          <Button onClick={() => registrarPronto("todos los pagos")} className="w-full sm:w-auto">Registrar</Button>
        </div>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Saldo por obrero</h2>

        <div className={`hidden gap-3 px-3 text-xs font-medium text-muted-foreground sm:grid ${GRID}`}>
          <span /><span>Obrero</span>
          <span className="text-center">Días</span><span className="text-center">Horas</span>
          <span className="text-center">Devengado</span><span className="text-center">Adelantos</span><span className="text-center">A pagar</span>
          <span />
        </div>

        {saldos.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">No hay horas cargadas en esta quincena.</p>}

        {saldos.map((s) => {
          const open = abierto === s.obreroId;
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
                  {s.sinTarifa && <Badge variant="destructive" className="ml-2 align-middle text-[10px]">sin tarifa</Badge>}
                </span>
                <span className="text-sm tabular-nums sm:text-center"><span className="text-muted-foreground sm:hidden">Días: </span>{s.dias}</span>
                <span className="text-sm tabular-nums sm:text-center"><span className="text-muted-foreground sm:hidden">Horas: </span>{s.horas}</span>
                <span className="text-sm tabular-nums sm:text-center"><span className="text-muted-foreground sm:hidden">Devengado: </span>{money(s.devengado)}</span>
                <span className="text-sm tabular-nums sm:text-center"><span className="text-muted-foreground sm:hidden">Adelantos: </span>{money(s.adelantos)}</span>
                <span className={`text-sm font-semibold tabular-nums sm:text-center ${s.saldo < 0 ? "text-destructive" : ""}`}>
                  <span className="font-normal text-muted-foreground sm:hidden">A pagar: </span>{money(s.saldo)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => registrarPronto(`el pago de ${s.nombre}`)}
                  className="w-full"
                >
                  Registrar
                </Button>
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
    </div>
  );
}
