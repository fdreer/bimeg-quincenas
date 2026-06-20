"use client";
import { useEffect, useRef, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { CalendarPlusIcon, Loader2Icon, PlusIcon, XIcon } from "lucide-react";
import { useCargaStore, type FilaBorrador } from "@/store/carga-store";
import { asegurarQuincena, guardarHoras } from "@/actions/quincenas";
import { horasEntre, rangoQuincena, HORAS_JORNAL } from "@/lib/calc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/field";
import { DatePicker } from "@/components/date-picker";
import { TimePicker } from "@/components/time-picker";
import { toast } from "sonner";
import type { Empresa, Obra } from "@/lib/odoo/queries";

// lg (no md): la grilla de 8 columnas necesita ~888px; abajo de 1024px se apila (sin scroll horizontal).
const COLS = "lg:grid-cols-[9rem_7rem_minmax(8rem,1fr)_7rem_7rem_4.5rem_minmax(8rem,1fr)_5rem]";

type ObreroLite = { id: number; nombre: string };
const record = <T extends { id: number; nombre: string }>(xs: T[]) => Object.fromEntries(xs.map((x) => [String(x.id), x.nombre]));

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const mesItems = Object.fromEntries(MESES.map((n, i) => [String(i + 1), n]));

// Turno partido típico: 8–13 y 14–17 (= 8 hs). Un "día" arranca con estos dos bloques.
const TURNOS = [{ desde: "08:00", hasta: "13:00" }, { desde: "14:00", hasta: "17:00" }];

type FilaPayload = { fecha: string; tipo: "trabajado" | "ausente"; obraId: number | null; desde: string | null; hasta: string | null; horas: number; comentario: string | null };

export function CargaForm({ empresas, obrasPorEmpresa, obreros }: {
  empresas: Empresa[];
  obrasPorEmpresa: Record<number, Obra[]>;
  obreros: ObreroLite[];
}) {
  const ahora = new Date();
  const [empresaId, setEmpresaId] = useState<number>(empresas[0]?.id ?? 0);
  const [obreroId, setObreroId] = useState<number>(obreros[0]?.id ?? 0);
  const [anio, setAnio] = useState(ahora.getFullYear());
  const [mes, setMes] = useState(ahora.getMonth() + 1);
  const [mitad, setMitad] = useState<1 | 2>(ahora.getDate() <= 15 ? 1 : 2);
  const [guardando, setGuardando] = useState(false);
  const { filas, agregarFila, duplicarFila, editarFila, quitarFila, reset } = useCargaStore();

  const obras = obrasPorEmpresa[empresaId] ?? [];
  const obraItems = record(obras);
  const ultima = filas[filas.length - 1];
  const cy = ahora.getFullYear();
  const anioItems = Object.fromEntries([cy - 2, cy - 1, cy, cy + 1].map((a) => [String(a), String(a)]));
  const rango = rangoQuincena(anio, mes, mitad);

  // Totales en vivo: un día puede tener 2 bloques (turno partido), por eso días = fechas distintas.
  const trabajadas = filas.filter((f) => f.tipo === "trabajado");
  const dias = new Set(trabajadas.map((f) => f.fecha)).size;
  const horas = Math.round(trabajadas.reduce((a, f) => a + (f.horas || 0), 0) * 100) / 100;
  const ausencias = new Set(filas.filter((f) => f.tipo === "ausente").map((f) => f.fecha)).size;

  function proximaFecha() {
    if (!ultima) return rango.inicio;
    const next = format(addDays(parseISO(ultima.fecha), 1), "yyyy-MM-dd");
    return next > rango.fin ? rango.fin : next; // no pasar del fin de la quincena
  }
  // Un día = los dos bloques del turno partido, con la obra de la última fila.
  function agregarDia(fecha: string, obraId: number | null) {
    for (const t of TURNOS) {
      agregarFila({ fecha, tipo: "trabajado", obraId, desde: t.desde, hasta: t.hasta, horas: horasEntre(t.desde, t.hasta), comentario: "" });
    }
  }
  // + Día: día siguiente repitiendo la obra de la última fila (carga rápida).
  function nuevoDia() {
    agregarDia(proximaFecha(), ultima?.tipo === "trabajado" ? ultima.obraId : null);
  }
  function limpiar() {
    reset();
    agregarDia(rango.inicio, null);
  }

  // Arrancá con el primer día ya armado (no una pantalla vacía). Solo una vez.
  const seeded = useRef(false);
  useEffect(() => {
    if (!seeded.current && filas.length === 0) {
      seeded.current = true;
      agregarDia(rango.inicio, null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cambiarTipo(f: FilaBorrador, tipo: "trabajado" | "ausente") {
    editarFila(f.id, tipo === "ausente" ? { tipo, horas: 0 } : { tipo, horas: f.horas || HORAS_JORNAL });
  }
  // Si hay desde y hasta, las horas se calculan solas (editables igual).
  function cambiarTiempo(f: FilaBorrador, campo: "desde" | "hasta", val: string) {
    const desde = campo === "desde" ? val : f.desde;
    const hasta = campo === "hasta" ? val : f.hasta;
    const patch: Partial<FilaBorrador> = { [campo]: val };
    if (desde && hasta) patch.horas = horasEntre(desde, hasta);
    editarFila(f.id, patch);
  }

  async function onGuardar() {
    setGuardando(true);
    try {
      const q = await asegurarQuincena(empresaId, anio, mes, mitad);
      const limpias: FilaPayload[] = filas
        .map((f): FilaPayload => f.tipo === "ausente"
          ? { fecha: f.fecha, tipo: "ausente", obraId: null, desde: null, hasta: null, horas: 0, comentario: f.comentario.trim() || null }
          : { fecha: f.fecha, tipo: "trabajado", obraId: f.obraId, desde: f.desde || null, hasta: f.hasta || null, horas: f.horas, comentario: f.comentario.trim() || null })
        .filter((f) => f.tipo === "ausente" || (f.obraId != null && f.horas > 0));
      const res = await guardarHoras({ quincenaId: q.id, obreroId, filas: limpias });
      toast.success(`${res.guardadas} movimiento${res.guardadas === 1 ? "" : "s"} guardado${res.guardadas === 1 ? "" : "s"} · ${obreroNombre}`);
    } catch {
      toast.error("No se pudo guardar. Reintentá.");
    } finally {
      setGuardando(false);
    }
  }

  const obreroNombre = obreros.find((o) => o.id === obreroId)?.nombre;

  return (
    <div className="space-y-4 pb-2">
      <Card size="sm">
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="grid gap-1.5 w-full sm:w-auto">
            <Label>Empresa</Label>
            <Select items={record(empresas)} value={String(empresaId)} onValueChange={(v) => setEmpresaId(Number(v))}>
              <SelectTrigger className="w-full sm:w-52"><SelectValue /></SelectTrigger>
              <SelectContent>{empresas.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.nombre}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5 w-full sm:w-auto">
            <Label>Obrero</Label>
            <Select items={record(obreros)} value={String(obreroId)} onValueChange={(v) => setObreroId(Number(v))}>
              <SelectTrigger className="w-full sm:w-52"><SelectValue /></SelectTrigger>
              <SelectContent>{obreros.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.nombre}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5 w-full sm:w-auto">
            <Label>Año</Label>
            <Select items={anioItems} value={String(anio)} onValueChange={(v) => setAnio(Number(v))}>
              <SelectTrigger className="w-full sm:w-28"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.keys(anioItems).map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5 w-full sm:w-auto">
            <Label>Mes</Label>
            <Select items={mesItems} value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{MESES.map((n, i) => <SelectItem key={n} value={String(i + 1)}>{n}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5 w-full sm:w-auto">
            <Label>Quincena</Label>
            <Select items={{ "1": "1ª (1–15)", "2": "2ª (16–fin)" }} value={String(mitad)} onValueChange={(v) => setMitad(Number(v) as 1 | 2)}>
              <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1ª (1–15)</SelectItem>
                <SelectItem value="2">2ª (16–fin)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <p className="px-1 text-sm text-muted-foreground">
        Cargando <span className="font-medium text-foreground">{obreroNombre}</span> · {mitad}ª quincena de {MESES[mes - 1]} (días {rango.inicio.slice(8)}–{rango.fin.slice(8)})
      </p>

      <div className="space-y-3 md:space-y-0">
        {/* Encabezados: solo desktop. En mobile cada fila se apila con su etiqueta. */}
        <div className={`hidden gap-2 px-2 text-sm font-medium text-muted-foreground lg:grid ${COLS}`}>
          <span>Fecha</span><span>Tipo</span><span>Obra</span><span>Desde</span><span>Hasta</span><span>Horas</span><span>Nota / motivo</span><span />
        </div>
        {filas.map((f) => {
          const ausente = f.tipo === "ausente";
          return (
            <div key={f.id} data-ausente={ausente || undefined} className={`grid grid-cols-1 gap-3 rounded-lg border p-3 transition-colors data-[ausente=true]:bg-muted/40 lg:items-center lg:gap-2 lg:rounded-none lg:border-0 lg:border-b lg:bg-transparent lg:p-2 ${COLS}`}>
              <Field label="Fecha" hideLabelAt="lg"><DatePicker value={f.fecha} aria-label="Fecha" onChange={(v) => editarFila(f.id, { fecha: v })} /></Field>
              <Field label="Tipo" hideLabelAt="lg">
                <Select items={{ trabajado: "Trabajó", ausente: "Ausente" }} value={f.tipo} onValueChange={(v) => cambiarTipo(f, v as "trabajado" | "ausente")}>
                  <SelectTrigger className="w-full" aria-label="Tipo"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trabajado">Trabajó</SelectItem>
                    <SelectItem value="ausente">Ausente</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Obra" hideLabelAt="lg">
                <Select items={obraItems} value={f.obraId != null ? String(f.obraId) : null} disabled={ausente} onValueChange={(v) => editarFila(f.id, { obraId: v ? Number(v) : null })}>
                  <SelectTrigger className="w-full" aria-label="Obra"><SelectValue placeholder="— elegir obra —" /></SelectTrigger>
                  <SelectContent>{obras.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.nombre}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Desde" hideLabelAt="lg"><TimePicker value={f.desde} disabled={ausente} aria-label="Desde" onChange={(v) => cambiarTiempo(f, "desde", v)} /></Field>
              <Field label="Hasta" hideLabelAt="lg"><TimePicker value={f.hasta} disabled={ausente} aria-label="Hasta" onChange={(v) => cambiarTiempo(f, "hasta", v)} /></Field>
              <Field label="Horas" hideLabelAt="lg"><Input type="number" inputMode="decimal" step="0.5" value={ausente ? 0 : f.horas} disabled={ausente} onChange={(e) => editarFila(f.id, { horas: Number(e.target.value) })} /></Field>
              <Field label="Nota / motivo" hideLabelAt="lg"><Input value={f.comentario} disabled={!ausente} placeholder={ausente ? "motivo (Médico…)" : ""} onChange={(e) => editarFila(f.id, { comentario: e.target.value })} /></Field>
              <div className="flex gap-1 lg:justify-end">
                <Button variant="ghost" size="icon-sm" onClick={() => duplicarFila(f.id)} disabled={ausente} title="Agregar otro bloque a este mismo día (turno partido)" aria-label="Agregar bloque"><PlusIcon /></Button>
                <Button variant="ghost" size="icon-sm" onClick={() => quitarFila(f.id)} className="text-muted-foreground hover:text-destructive" title="Quitar fila" aria-label="Quitar fila"><XIcon /></Button>
              </div>
            </div>
          );
        })}

        <Button
          type="button"
          variant="outline"
          onClick={nuevoDia}
          className="mt-3 h-auto w-full border-dashed py-2.5 text-muted-foreground hover:text-foreground"
        >
          <CalendarPlusIcon data-icon="inline-start" /> Agregar día
        </Button>
      </div>

      {/* Barra fija: totales + guardar siempre a mano, también en listas largas y mobile. */}
      <div className="sticky bottom-0 z-30 -mx-4 mt-2 flex flex-wrap items-center justify-between gap-3 border-t bg-background/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-4 text-sm tabular-nums">
          <span><span className="font-semibold">{dias}</span> <span className="text-muted-foreground">{dias === 1 ? "día" : "días"}</span></span>
          <span><span className="font-semibold">{horas}</span> <span className="text-muted-foreground">hs</span></span>
          {ausencias > 0 && <span><span className="font-semibold">{ausencias}</span> <span className="text-muted-foreground">aus.</span></span>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={limpiar}>Limpiar</Button>
          <Button onClick={onGuardar} disabled={guardando || filas.length === 0 || !obreroId}>
            {guardando && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
            Guardar quincena
          </Button>
        </div>
      </div>
    </div>
  );
}
