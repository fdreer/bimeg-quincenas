"use client";
import { useEffect, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { ArrowRightIcon, Loader2Icon, PlusIcon, XIcon } from "lucide-react";
import { useCargaStore, type Asignacion, type DiaBorrador } from "@/store/carga-store";
import { asegurarQuincena, guardarHoras, obtenerHorasGuardadas, obtenerEstadoCarga, aplicarHorasEnLote } from "@/actions/quincenas";
import { horasEntre, rangoQuincena, HORAS_JORNAL, estadoCargaPorObrero, diasHabilesDeRango, semanasDeQuincena, type EstadoCargaObrero } from "@/lib/calc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/field";
import { TimePicker } from "@/components/time-picker";
import { ObreroCombobox } from "./obrero-combobox";
import { toast } from "sonner";
import type { Obra } from "@/lib/odoo/queries";
import { EMPRESA_BIMEG } from "@/lib/constantes";

// Grilla de una asignación (obra del día): se apila en mobile, inline desde sm.
const ALOC_COLS = "sm:grid-cols-[minmax(8rem,1fr)_7rem_7rem_4.5rem_2rem]";
const DOW = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const TIPO_ITEMS = { trabajado: "Presente", ausente: "Ausente" };

type ObreroLite = { id: number; nombre: string; dni: string | null; obraHabitualId: number | null };
const record = <T extends { id: number; nombre: string }>(xs: T[]) => Object.fromEntries(xs.map((x) => [String(x.id), x.nombre]));

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const mesItems = Object.fromEntries(MESES.map((n, i) => [String(i + 1), n]));

type FilaPayload = { fecha: string; tipo: "trabajado" | "ausente"; obraId: number | null; desde: string | null; hasta: string | null; horas: number; comentario: string | null };
type HoraGuardada = Awaited<ReturnType<typeof obtenerHorasGuardadas>>["filas"][number];

const r2 = (n: number) => Math.round(n * 100) / 100;
const totalDeDia = (d: DiaBorrador) => r2(d.asignaciones.reduce((a, x) => a + (x.horas || 0), 0));

// Todas las fechas "yyyy-MM-dd" de inicio a fin (inclusive).
function diasDeRango(inicio: string, fin: string): string[] {
  const out: string[] = [];
  for (let d = parseISO(inicio), end = parseISO(fin); d <= end; d = addDays(d, 1)) out.push(format(d, "yyyy-MM-dd"));
  return out;
}

// Arma la grilla: cada día arranca Ausente, salvo que ya haya datos guardados de esa fecha.
function construirDias(inicio: string, fin: string, guardadas: HoraGuardada[]): DiaBorrador[] {
  const porFecha = new Map<string, HoraGuardada[]>();
  for (const h of guardadas) (porFecha.get(h.fecha) ?? porFecha.set(h.fecha, []).get(h.fecha)!).push(h);
  return diasDeRango(inicio, fin).map((fecha) => {
    const rows = porFecha.get(fecha) ?? [];
    const trab = rows.filter((h) => h.tipo === "trabajado");
    if (trab.length > 0) {
      return {
        id: fecha, fecha, tipo: "trabajado",
        asignaciones: trab.map((h): Asignacion => ({ obraId: h.odooObraId, desde: h.desde ?? "", hasta: h.hasta ?? "", horas: Number(h.horas) })),
        comentario: trab.find((h) => h.comentario)?.comentario ?? "",
      };
    }
    return { id: fecha, fecha, tipo: "ausente", asignaciones: [], comentario: rows.find((h) => h.tipo === "ausente")?.comentario ?? "" };
  });
}

// Pre-llenado por obra habitual: Lun–Vie Presente@8h en esa obra; Sáb/Dom Ausente.
// Solo se usa cuando el obrero no tiene nada guardado en el período (primera carga).
function construirDiasPrefill(inicio: string, fin: string, obraHabitualId: number): DiaBorrador[] {
  const habiles = new Set(diasHabilesDeRango(inicio, fin));
  return diasDeRango(inicio, fin).map((fecha) =>
    habiles.has(fecha)
      ? { id: fecha, fecha, tipo: "trabajado", asignaciones: [{ obraId: obraHabitualId, desde: "", hasta: "", horas: HORAS_JORNAL }], comentario: "" }
      : { id: fecha, fecha, tipo: "ausente", asignaciones: [], comentario: "" },
  );
}

export function CargaForm({ obras, obreros }: {
  obras: Obra[];
  obreros: ObreroLite[];
}) {
  const ahora = new Date();
  const empresaId = EMPRESA_BIMEG; // única empresa operada; ya no se elige
  const [obreroId, setObreroId] = useState<number>(0); // 0 = ninguno; el usuario elige
  const [anio, setAnio] = useState(ahora.getFullYear());
  const [mes, setMes] = useState(ahora.getMonth() + 1);
  const [mitad, setMitad] = useState<1 | 2>(ahora.getDate() <= 15 ? 1 : 2);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [cerrada, setCerrada] = useState(false);
  // Estado de carga de TODA la quincena (quién falta), no solo del obrero abierto.
  const [estado, setEstado] = useState<{ cerrada: boolean; porObrero: Record<number, EstadoCargaObrero> }>({ cerrada: false, porObrero: {} });
  // Barra de carga rápida (bulk).
  const [barObraId, setBarObraId] = useState<string>("");
  const [barHoras, setBarHoras] = useState("8");
  const [barDiaSet, setBarDiaSet] = useState("lunvie");
  // Diálogo de cuadrilla.
  const [crewOpen, setCrewOpen] = useState(false);
  const [crewIds, setCrewIds] = useState<number[]>([]);
  const [aplicandoLote, setAplicandoLote] = useState(false);
  const { dias, dirty, cargarDias, marcarLimpio, marcarSucio, editarDia, editarAsignacion, agregarObra, quitarObra, aplicarABloque } = useCargaStore();

  const obraItems = record(obras);
  const cy = ahora.getFullYear();
  const anioItems = Object.fromEntries([cy - 2, cy - 1, cy, cy + 1].map((a) => [String(a), String(a)]));
  const rango = rangoQuincena(anio, mes, mitad);

  // Reabrir la quincena de este obrero: trae lo guardado + el estado; el resto queda Ausente por defecto.
  useEffect(() => {
    let cancel = false;
    if (!obreroId) { cargarDias([]); setCerrada(false); setCargando(false); return () => { cancel = true; }; }
    setCargando(true);
    const { inicio, fin } = rangoQuincena(anio, mes, mitad);
    obtenerHorasGuardadas(empresaId, anio, mes, mitad, obreroId)
      .then((r) => { if (!cancel) {
        const habitual = obreros.find((o) => o.id === obreroId)?.obraHabitualId ?? null;
        cargarDias(r.filas.length === 0 && habitual != null
          ? construirDiasPrefill(inicio, fin, habitual)
          : construirDias(inicio, fin, r.filas));
        setCerrada(r.estado === "cerrada");
      } })
      .catch(() => { if (!cancel) { cargarDias(construirDias(inicio, fin, [])); setCerrada(false); } })
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [empresaId, obreroId, anio, mes, mitad, cargarDias, obreros]);

  // Estado del roster (no depende del obrero abierto): se refresca al cambiar de período.
  useEffect(() => {
    let cancel = false;
    obtenerEstadoCarga(empresaId, anio, mes, mitad)
      .then((r) => { if (!cancel) setEstado(r); })
      .catch(() => { if (!cancel) setEstado({ cerrada: false, porObrero: {} }); });
    return () => { cancel = true; };
  }, [empresaId, anio, mes, mitad]);

  // Al abrir un obrero, la barra arranca con su obra habitual (si tiene).
  useEffect(() => {
    const h = obreros.find((o) => o.id === obreroId)?.obraHabitualId ?? null;
    setBarObraId(h != null ? String(h) : "");
  }, [obreroId, obreros]);

  // Aviso del navegador si cerrás/recargás con cambios sin guardar.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (useCargaStore.getState().dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  // Guard contra pérdida de datos: cambiar de obrero/período recarga del server y pisa lo no guardado.
  // ponytail: window.confirm es el guard más barato y confiable; subir a un AlertDialog si molesta.
  function intentarCambiar(fn: () => void) {
    if (useCargaStore.getState().dirty && !window.confirm("Tenés cambios sin guardar en este obrero. ¿Descartarlos?")) return;
    fn();
  }

  const cargados = obreros.filter((o) => (estado.porObrero[o.id]?.movimientos ?? 0) > 0).length;
  const pendientes = obreros.length - cargados;

  // Totales en vivo.
  const presentes = dias.filter((d) => d.tipo === "trabajado");
  const diasTrab = presentes.filter((d) => d.asignaciones.some((a) => a.obraId != null && a.horas > 0)).length;
  const horas = r2(presentes.reduce((a, d) => a + d.asignaciones.reduce((s, x) => s + (x.obraId != null && x.horas > 0 ? x.horas : 0), 0), 0));
  const ausencias = dias.filter((d) => d.tipo === "ausente" && d.comentario.trim()).length;

  function cambiarTipo(d: DiaBorrador, tipo: "trabajado" | "ausente") {
    if (tipo === "trabajado")
      editarDia(d.id, { tipo, asignaciones: d.asignaciones.length ? d.asignaciones : [{ obraId: null, desde: "", hasta: "", horas: HORAS_JORNAL }] });
    else editarDia(d.id, { tipo });
  }
  // Si hay desde y hasta, las horas se calculan solas (editables igual).
  function cambiarTiempo(d: DiaBorrador, i: number, campo: "desde" | "hasta", val: string) {
    const a = d.asignaciones[i];
    const desde = campo === "desde" ? val : a.desde;
    const hasta = campo === "hasta" ? val : a.hasta;
    const patch: Partial<Asignacion> = { [campo]: val };
    if (desde && hasta) patch.horas = horasEntre(desde, hasta);
    editarAsignacion(d.id, i, patch);
  }

  async function guardar(): Promise<boolean> {
    setGuardando(true);
    try {
      const q = await asegurarQuincena(empresaId, anio, mes, mitad);
      const filas: FilaPayload[] = [];
      for (const d of dias) {
        if (d.tipo === "ausente") {
          // ponytail: el default de cada día es Ausente; solo persistimos ausencias con motivo (las vacías se re-derivan al abrir).
          if (d.comentario.trim()) filas.push({ fecha: d.fecha, tipo: "ausente", obraId: null, desde: null, hasta: null, horas: 0, comentario: d.comentario.trim() });
        } else {
          for (const a of d.asignaciones)
            if (a.obraId != null && a.horas > 0)
              filas.push({ fecha: d.fecha, tipo: "trabajado", obraId: a.obraId, desde: a.desde || null, hasta: a.hasta || null, horas: a.horas, comentario: d.comentario.trim() || null });
        }
      }
      const res = await guardarHoras({ quincenaId: q.id, obreroId, filas });
      marcarLimpio();
      // Refleja el obrero recién guardado en el roster sin re-consultar (mismo cálculo que el server).
      const e = estadoCargaPorObrero(filas.map((f) => ({ obreroId, tipo: f.tipo, fecha: f.fecha })))[obreroId]
        ?? { movimientos: 0, diasTrabajados: 0, ultimaFecha: null };
      setEstado((prev) => ({ ...prev, porObrero: { ...prev.porObrero, [obreroId]: e } }));
      toast.success(`${res.guardadas} movimiento${res.guardadas === 1 ? "" : "s"} guardado${res.guardadas === 1 ? "" : "s"} · ${obreroNombre}`);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar. Reintentá.");
      return false;
    } finally {
      setGuardando(false);
    }
  }

  // P6: guardar y saltar al primer obrero que falta cargar (flujo diario del jefe de obra).
  async function guardarYSiguiente() {
    if (!(await guardar())) return;
    // El actual ya quedó cargado; buscá el próximo sin movimientos (excluyéndolo explícitamente).
    const sig = obreros.find((o) => o.id !== obreroId && !(estado.porObrero[o.id]?.movimientos));
    if (!sig) { toast.info("No quedan obreros sin cargar en esta quincena."); return; }
    setObreroId(sig.id); // dirty ya es false → recarga sin pedir confirmación
  }

  function limpiar() {
    cargarDias(construirDias(rango.inicio, rango.fin, []));
    marcarSucio(); // vaciar es un cambio: hay que guardar para persistirlo
  }

  const obreroNombre = obreros.find((o) => o.id === obreroId)?.nombre;
  const obraHabitual = obreros.find((o) => o.id === obreroId)?.obraHabitualId ?? null;

  // Presets de "Días" de esta quincena: Lun–Vie, cada semana suelta, y toda la quincena.
  const diaSets: { key: string; label: string; fechas: string[] }[] = [
    { key: "lunvie", label: "Lun–Vie (toda la quincena)", fechas: diasHabilesDeRango(rango.inicio, rango.fin) },
    ...semanasDeQuincena(rango.inicio, rango.fin).map((dias, i) => ({
      key: `sem-${i}`,
      label: `Sem ${dias[0].slice(8)}–${dias[dias.length - 1].slice(8)}`,
      fechas: dias,
    })),
    { key: "toda", label: "Toda la quincena (incl. sáb/dom)", fechas: diasDeRango(rango.inicio, rango.fin) },
  ];
  const fechasDelSet = diaSets.find((s) => s.key === barDiaSet)?.fechas ?? [];
  const barHorasNum = Number(barHoras) || 0;
  const barListo = !!barObraId && fechasDelSet.length > 0 && barHorasNum > 0;

  function aplicarBarra() {
    if (!barListo) return;
    aplicarABloque(fechasDelSet, { obraId: Number(barObraId), desde: "", hasta: "", horas: barHorasNum });
  }

  const barObraNombre = obras.find((o) => String(o.id) === barObraId)?.nombre ?? "—";

  async function aplicarACuadrilla() {
    if (!barListo || crewIds.length === 0) return;
    setAplicandoLote(true);
    try {
      const r = await aplicarHorasEnLote({
        empresaId, anio, mes, mitad,
        obreroIds: crewIds, obraId: Number(barObraId), horas: barHorasNum, fechas: fechasDelSet,
      });
      toast.success(`Aplicado a ${r.obreros} obrero${r.obreros === 1 ? "" : "s"}${r.saltados ? ` · ${r.saltados} día(s) saltado(s) por ya tener carga` : ""}`);
      const e = await obtenerEstadoCarga(empresaId, anio, mes, mitad);
      setEstado(e);
      setCrewOpen(false);
      setCrewIds([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo aplicar a la cuadrilla.");
    } finally {
      setAplicandoLote(false);
    }
  }

  return (
    <div className="space-y-4 pb-2">
      <Card size="sm">
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="grid gap-1.5 w-full sm:w-auto">
            <Label>Obrero</Label>
            <ObreroCombobox obreros={obreros} value={obreroId} estado={estado.porObrero} onSelect={(id) => intentarCambiar(() => setObreroId(id))} />
          </div>
          <div className="grid flex-1 gap-1.5 sm:w-auto sm:flex-none">
            <Label>Año</Label>
            <Select items={anioItems} value={String(anio)} onValueChange={(v) => intentarCambiar(() => setAnio(Number(v)))}>
              <SelectTrigger className="w-full sm:w-28"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.keys(anioItems).map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid flex-1 gap-1.5 sm:w-auto sm:flex-none">
            <Label>Mes</Label>
            <Select items={mesItems} value={String(mes)} onValueChange={(v) => intentarCambiar(() => setMes(Number(v)))}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{MESES.map((n, i) => <SelectItem key={n} value={String(i + 1)}>{n}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid flex-1 gap-1.5 sm:w-auto sm:flex-none">
            <Label>Quincena</Label>
            <Select items={{ "1": "1ª (1–15)", "2": "2ª (16–fin)" }} value={String(mitad)} onValueChange={(v) => intentarCambiar(() => setMitad(Number(v) as 1 | 2))}>
              <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1ª (1–15)</SelectItem>
                <SelectItem value="2">2ª (16–fin)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2 px-1">
        <Badge variant={pendientes > 0 ? "secondary" : "outline"} className="gap-1">
          <span className="font-semibold tabular-nums">{pendientes}</span> sin cargar
        </Badge>
        <span className="text-sm text-muted-foreground tabular-nums">{cargados}/{obreros.length} cargados · {MESES[mes - 1]} {mitad}ª quincena</span>
      </div>

      {obreroId ? (
        <p className="px-1 text-sm text-muted-foreground">
          Cargando <span className="font-medium text-foreground">{obreroNombre}</span> · {mitad}ª quincena de {MESES[mes - 1]} (días {rango.inicio.slice(8)}–{rango.fin.slice(8)}).{" "}
          {obraHabitual != null
            ? <>Viene pre-cargado <span className="font-medium text-foreground">Lun–Vie</span> en su obra habitual; corregí las excepciones (faltas, sábados, cambios de obra).</>
            : <>Cada día arranca como <span className="font-medium text-foreground">Ausente</span>; marcá los que estuvo Presente.</>}
        </p>
      ) : (
        <p className="px-1 text-sm text-muted-foreground">Elegí un obrero para cargar sus horas.</p>
      )}
      {cerrada && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Quincena cerrada — solo lectura. Reabrila desde <a className="underline" href="/saldos">Saldos</a> para editar.
        </p>
      )}

      {!!obreroId && !cerrada && !cargando && (
        <Card size="sm">
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5 flex-1 min-w-[10rem]">
              <Label>Carga rápida · Obra</Label>
              <Select items={obraItems} value={barObraId || null} onValueChange={(v) => setBarObraId(v ?? "")}>
                <SelectTrigger className="w-full"><SelectValue placeholder="— elegir obra —" /></SelectTrigger>
                <SelectContent>{obras.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5 w-20">
              <Label>Horas</Label>
              <Input type="number" inputMode="decimal" step="0.5" value={barHoras} onChange={(e) => setBarHoras(e.target.value)} />
            </div>
            <div className="grid gap-1.5 flex-1 min-w-[9rem]">
              <Label>Días</Label>
              <Select items={Object.fromEntries(diaSets.map((s) => [s.key, s.label]))} value={barDiaSet} onValueChange={(v) => setBarDiaSet(v ?? "lunvie")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{diaSets.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={aplicarBarra} disabled={!barListo}>Aplicar</Button>
            <Button variant="ghost" onClick={() => setCrewOpen(true)} disabled={!barListo}>Aplicar a más obreros…</Button>
          </CardContent>
        </Card>
      )}

      {!!obreroId && (cargando ? (
        <div className="flex items-center gap-2 px-1 py-10 text-sm text-muted-foreground">
          <Loader2Icon className="animate-spin" /> Cargando datos…
        </div>
      ) : (
        <div className="space-y-2">
          {dias.map((d) => {
            const fecha = parseISO(d.fecha);
            const ausente = d.tipo === "ausente";
            const domingo = fecha.getDay() === 0;
            return (
              <div key={d.id} data-ausente={ausente || undefined} className="rounded-lg border p-3 transition-colors data-[ausente=true]:bg-muted/30">
                {/* Encabezado del día: fecha bien diferenciada + tipo + total. */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex w-24 items-baseline gap-2">
                    <span className="text-base font-semibold tabular-nums">{format(fecha, "dd/MM")}</span>
                    <span className={cn("text-xs font-medium uppercase", domingo ? "text-destructive" : "text-muted-foreground")}>{DOW[fecha.getDay()]}</span>
                  </div>
                  <Select items={TIPO_ITEMS} value={d.tipo} onValueChange={(v) => cambiarTipo(d, v as "trabajado" | "ausente")}>
                    <SelectTrigger className="w-32" aria-label="Tipo"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trabajado">Presente</SelectItem>
                      <SelectItem value="ausente">Ausente</SelectItem>
                    </SelectContent>
                  </Select>
                  {!ausente && (
                    <span className="ml-auto text-sm tabular-nums text-muted-foreground">
                      <span className="font-semibold text-foreground">{totalDeDia(d)}</span> hs
                    </span>
                  )}
                </div>

                {ausente ? (
                  <Input className="mt-3" value={d.comentario} placeholder="motivo (opcional: Médico, Falta…)" onChange={(e) => editarDia(d.id, { comentario: e.target.value })} />
                ) : (
                  <div className="mt-3 space-y-2">
                    {d.asignaciones.map((a, i) => (
                      <div key={i} className={`grid grid-cols-1 gap-2 sm:items-center ${ALOC_COLS}`}>
                        <Field label="Obra" hideLabelAt="md">
                          <Select items={obraItems} value={a.obraId != null ? String(a.obraId) : null} onValueChange={(v) => editarAsignacion(d.id, i, { obraId: v ? Number(v) : null })}>
                            <SelectTrigger className="w-full" aria-label="Obra"><SelectValue placeholder="— elegir obra —" /></SelectTrigger>
                            <SelectContent>{obras.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.nombre}</SelectItem>)}</SelectContent>
                          </Select>
                        </Field>
                        <Field label="Desde" hideLabelAt="md"><TimePicker value={a.desde} aria-label="Desde" onChange={(v) => cambiarTiempo(d, i, "desde", v)} /></Field>
                        <Field label="Hasta" hideLabelAt="md"><TimePicker value={a.hasta} aria-label="Hasta" onChange={(v) => cambiarTiempo(d, i, "hasta", v)} /></Field>
                        <Field label="Horas" hideLabelAt="md"><Input type="number" inputMode="decimal" step="0.5" value={a.horas} aria-label="Horas" readOnly={!!(a.desde && a.hasta)} className={a.desde && a.hasta ? "cursor-default bg-muted/50 text-muted-foreground" : ""} onChange={(e) => editarAsignacion(d.id, i, { horas: Number(e.target.value) })} /></Field>
                        <div className="flex sm:justify-center">
                          <Button variant="ghost" size="icon-sm" onClick={() => quitarObra(d.id, i)} disabled={d.asignaciones.length === 1} className="text-muted-foreground hover:text-destructive" title="Quitar obra" aria-label="Quitar obra"><XIcon /></Button>
                        </div>
                      </div>
                    ))}
                    <Button type="button" variant="ghost" size="sm" onClick={() => agregarObra(d.id)} className="text-muted-foreground hover:text-foreground">
                      <PlusIcon data-icon="inline-start" /> Agregar obra
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {/* Barra fija: totales + guardar siempre a mano. En mobile se apoya sobre la bottom bar de navegación. */}
      <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 -mx-4 mt-2 flex flex-wrap items-center justify-between gap-3 border-t bg-background/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 md:bottom-0">
        <div className="flex items-center gap-4 text-sm tabular-nums">
          <span><span className="font-semibold">{diasTrab}</span> <span className="text-muted-foreground">{diasTrab === 1 ? "día" : "días"}</span></span>
          <span><span className="font-semibold">{horas}</span> <span className="text-muted-foreground">hs</span></span>
          {ausencias > 0 && <span><span className="font-semibold">{ausencias}</span> <span className="text-muted-foreground">aus.</span></span>}
          {dirty && <span className="text-amber-600 dark:text-amber-400">sin guardar</span>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={limpiar} disabled={cargando}>Limpiar</Button>
          <Button variant="outline" onClick={() => void guardar()} disabled={guardando || cargando || !obreroId || cerrada}>
            {guardando && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
            Guardar
          </Button>
          <Button onClick={() => void guardarYSiguiente()} disabled={guardando || cargando || !obreroId || cerrada}>
            Guardar y siguiente
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </div>
      </div>

      <Dialog open={crewOpen} onOpenChange={setCrewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aplicar a más obreros</DialogTitle>
            <DialogDescription>{barObraNombre} · {barHorasNum} hs · {fechasDelSet.length} día(s). Solo se rellenan días vacíos.</DialogDescription>
          </DialogHeader>
          <div className="flex max-h-72 flex-col gap-2 overflow-auto">
            {obreros.filter((o) => o.id !== obreroId).map((o) => (
              <label key={o.id} className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 cursor-pointer accent-primary"
                  checked={crewIds.includes(o.id)}
                  onChange={(e) => setCrewIds((prev) => e.target.checked ? [...prev, o.id] : prev.filter((id) => id !== o.id))}
                />
                {o.nombre}
              </label>
            ))}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost">Cancelar</Button>} />
            <Button onClick={() => void aplicarACuadrilla()} disabled={aplicandoLote || crewIds.length === 0}>
              {aplicandoLote && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
              Aplicar a {crewIds.length}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
