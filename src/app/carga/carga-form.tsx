"use client";
import { useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { useCargaStore } from "@/store/carga-store";
import { asegurarQuincena, guardarHoras } from "@/actions/quincenas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Empresa, Obra } from "@/lib/odoo/queries";

type ObreroLite = { id: number; nombre: string };
const record = <T extends { id: number; nombre: string }>(xs: T[]) => Object.fromEntries(xs.map((x) => [String(x.id), x.nombre]));

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
  const { filas, agregarFila, editarFila, quitarFila, reset } = useCargaStore();

  const obras = obrasPorEmpresa[empresaId] ?? [];
  const obraItems = record(obras);

  // Carga rápida: el próximo día arranca en la fecha siguiente y con la misma obra que la última fila.
  function proximaFecha() {
    if (filas.length === 0) return format(ahora, "yyyy-MM-dd");
    return format(addDays(parseISO(filas[filas.length - 1].fecha), 1), "yyyy-MM-dd");
  }
  function agregarDia() {
    agregarFila(proximaFecha(), filas[filas.length - 1]?.obraId ?? null);
  }

  async function onGuardar() {
    setMsg("Guardando…");
    const q = await asegurarQuincena(empresaId, anio, mes, mitad);
    const limpias = filas
      .filter((f) => f.obraId && f.horas > 0)
      .map((f) => ({ fecha: f.fecha, obraId: f.obraId as number, horas: f.horas }));
    const res = await guardarHoras({ quincenaId: q.id, obreroId, filas: limpias });
    setMsg(`Guardado: ${res.guardadas} días.`);
  }

  return (
    <div className="space-y-4">
      <Card size="sm">
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label>Empresa</Label>
            <Select items={record(empresas)} value={String(empresaId)} onValueChange={(v) => setEmpresaId(Number(v))}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                {empresas.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Obrero</Label>
            <Select items={record(obreros)} value={String(obreroId)} onValueChange={(v) => setObreroId(Number(v))}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                {obreros.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="anio">Año</Label>
            <Input id="anio" type="number" className="w-24" value={anio} onChange={(e) => setAnio(Number(e.target.value))} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="mes">Mes</Label>
            <Input id="mes" type="number" min={1} max={12} className="w-20" value={mes} onChange={(e) => setMes(Number(e.target.value))} />
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

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-40">Fecha</TableHead>
            <TableHead>Obra</TableHead>
            <TableHead className="w-24">Horas</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map((f) => (
            <TableRow key={f.id}>
              <TableCell><Input type="date" value={f.fecha} onChange={(e) => editarFila(f.id, { fecha: e.target.value })} /></TableCell>
              <TableCell>
                <Select items={obraItems} value={f.obraId != null ? String(f.obraId) : null} onValueChange={(v) => editarFila(f.id, { obraId: v ? Number(v) : null })}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="— elegir obra —" /></SelectTrigger>
                  <SelectContent>
                    {obras.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell><Input type="number" step="0.5" className="w-20" value={f.horas} onChange={(e) => editarFila(f.id, { horas: Number(e.target.value) })} /></TableCell>
              <TableCell><Button variant="ghost" size="icon-sm" onClick={() => quitarFila(f.id)} aria-label="Quitar">✕</Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex gap-2">
        <Button variant="secondary" onClick={agregarDia}>+ Día</Button>
        <Button onClick={onGuardar} disabled={filas.length === 0 || !obreroId}>Guardar quincena</Button>
        <Button variant="ghost" onClick={reset}>Limpiar</Button>
      </div>
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
    </div>
  );
}
