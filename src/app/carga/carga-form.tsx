"use client";
import { useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { useCargaStore, type FilaBorrador } from "@/store/carga-store";
import { asegurarQuincena, guardarHoras } from "@/actions/quincenas";
import { horasEntre } from "@/lib/calc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Empresa, Obra } from "@/lib/odoo/queries";

type ObreroLite = { id: number; nombre: string };
const record = <T extends { id: number; nombre: string }>(xs: T[]) => Object.fromEntries(xs.map((x) => [String(x.id), x.nombre]));

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const mesItems = Object.fromEntries(MESES.map((n, i) => [String(i + 1), n]));

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
  const [msg, setMsg] = useState("");
  const { filas, agregarFila, duplicarFila, editarFila, quitarFila, reset } = useCargaStore();

  const obras = obrasPorEmpresa[empresaId] ?? [];
  const obraItems = record(obras);
  const ultima = filas[filas.length - 1];
  const cy = ahora.getFullYear();
  const anioItems = Object.fromEntries([cy - 2, cy - 1, cy, cy + 1].map((a) => [String(a), String(a)]));

  function proximaFecha() {
    if (!ultima) return format(ahora, "yyyy-MM-dd");
    return format(addDays(parseISO(ultima.fecha), 1), "yyyy-MM-dd");
  }
  // + Día: día siguiente repitiendo obra y horario de la última fila (carga rápida).
  function nuevoDia() {
    agregarFila({
      fecha: proximaFecha(), tipo: "trabajado",
      obraId: ultima?.tipo === "trabajado" ? ultima.obraId : null,
      desde: ultima?.desde ?? "", hasta: ultima?.hasta ?? "",
      horas: ultima?.tipo === "trabajado" ? ultima.horas : 8, comentario: "",
    });
  }

  function cambiarTipo(f: FilaBorrador, tipo: "trabajado" | "ausente") {
    editarFila(f.id, tipo === "ausente" ? { tipo, horas: 0 } : { tipo, horas: f.horas || 8 });
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
    setMsg("Guardando…");
    const q = await asegurarQuincena(empresaId, anio, mes, mitad);
    const limpias: FilaPayload[] = filas
      .map((f): FilaPayload => f.tipo === "ausente"
        ? { fecha: f.fecha, tipo: "ausente", obraId: null, desde: null, hasta: null, horas: 0, comentario: f.comentario.trim() || null }
        : { fecha: f.fecha, tipo: "trabajado", obraId: f.obraId, desde: f.desde || null, hasta: f.hasta || null, horas: f.horas, comentario: f.comentario.trim() || null })
      .filter((f) => f.tipo === "ausente" || (f.obraId != null && f.horas > 0));
    const res = await guardarHoras({ quincenaId: q.id, obreroId, filas: limpias });
    setMsg(`Guardado: ${res.guardadas} movimientos.`);
  }

  return (
    <div className="space-y-4">
      <Card size="sm">
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="grid gap-1.5">
            <Label>Empresa</Label>
            <Select items={record(empresas)} value={String(empresaId)} onValueChange={(v) => setEmpresaId(Number(v))}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>{empresas.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.nombre}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Obrero</Label>
            <Select items={record(obreros)} value={String(obreroId)} onValueChange={(v) => setObreroId(Number(v))}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>{obreros.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.nombre}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Año</Label>
            <Select items={anioItems} value={String(anio)} onValueChange={(v) => setAnio(Number(v))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.keys(anioItems).map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Mes</Label>
            <Select items={mesItems} value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{MESES.map((n, i) => <SelectItem key={n} value={String(i + 1)}>{n}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Quincena</Label>
            <Select items={{ "1": "1ª (1–15)", "2": "2ª (16–fin)" }} value={String(mitad)} onValueChange={(v) => setMitad(Number(v) as 1 | 2)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1ª (1–15)</SelectItem>
                <SelectItem value="2">2ª (16–fin)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-36">Fecha</TableHead>
            <TableHead className="w-28">Tipo</TableHead>
            <TableHead>Obra</TableHead>
            <TableHead className="w-28">Desde</TableHead>
            <TableHead className="w-28">Hasta</TableHead>
            <TableHead className="w-16">Horas</TableHead>
            <TableHead>Nota / motivo</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map((f) => {
            const ausente = f.tipo === "ausente";
            return (
              <TableRow key={f.id}>
                <TableCell><Input type="date" value={f.fecha} onChange={(e) => editarFila(f.id, { fecha: e.target.value })} className="w-full" /></TableCell>
                <TableCell>
                  <Select items={{ trabajado: "Trabajó", ausente: "Ausente" }} value={f.tipo} onValueChange={(v) => cambiarTipo(f, v as "trabajado" | "ausente")}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trabajado">Trabajó</SelectItem>
                      <SelectItem value="ausente">Ausente</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Select items={obraItems} value={f.obraId != null ? String(f.obraId) : null} disabled={ausente} onValueChange={(v) => editarFila(f.id, { obraId: v ? Number(v) : null })}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="— elegir obra —" /></SelectTrigger>
                    <SelectContent>{obras.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.nombre}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
                <TableCell><Input type="time" value={f.desde} disabled={ausente} onChange={(e) => cambiarTiempo(f, "desde", e.target.value)} className="w-full" /></TableCell>
                <TableCell><Input type="time" value={f.hasta} disabled={ausente} onChange={(e) => cambiarTiempo(f, "hasta", e.target.value)} className="w-full" /></TableCell>
                <TableCell><Input type="number" step="0.5" value={ausente ? 0 : f.horas} disabled={ausente} onChange={(e) => editarFila(f.id, { horas: Number(e.target.value) })} className="w-full" /></TableCell>
                <TableCell><Input value={f.comentario} disabled={!ausente} placeholder={ausente ? "motivo (Médico…)" : ""} onChange={(e) => editarFila(f.id, { comentario: e.target.value })} className="w-full" /></TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Button variant="ghost" size="icon-sm" onClick={() => duplicarFila(f.id)} disabled={ausente} title="Agregar otro bloque a este mismo día" aria-label="Agregar bloque">＋</Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => quitarFila(f.id)} title="Quitar" aria-label="Quitar">✕</Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={nuevoDia}>+ Día</Button>
        <Button onClick={onGuardar} disabled={filas.length === 0 || !obreroId}>Guardar quincena</Button>
        <Button variant="ghost" onClick={reset}>Limpiar</Button>
      </div>
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
    </div>
  );
}
