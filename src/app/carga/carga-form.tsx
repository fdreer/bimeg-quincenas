"use client";
import { useState } from "react";
import { useCargaStore } from "@/store/carga-store";
import { asegurarQuincena, guardarHoras } from "@/actions/quincenas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Empresa, Obra } from "@/lib/odoo/queries";

type ObreroLite = { id: number; nombre: string };

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
      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-sm">Empresa
          <select className="block border rounded px-2 py-1" value={empresaId} onChange={(e) => setEmpresaId(Number(e.target.value))}>
            {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </label>
        <label className="text-sm">Obrero
          <select className="block border rounded px-2 py-1" value={obreroId} onChange={(e) => setObreroId(Number(e.target.value))}>
            {obreros.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
          </select>
        </label>
        <label className="text-sm">Año <Input type="number" className="w-24" value={anio} onChange={(e) => setAnio(Number(e.target.value))} /></label>
        <label className="text-sm">Mes <Input type="number" min={1} max={12} className="w-20" value={mes} onChange={(e) => setMes(Number(e.target.value))} /></label>
        <label className="text-sm">Quincena
          <select className="block border rounded px-2 py-1" value={mitad} onChange={(e) => setMitad(Number(e.target.value) as 1 | 2)}>
            <option value={1}>1ª (1–15)</option>
            <option value={2}>2ª (16–fin)</option>
          </select>
        </label>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b"><th className="py-2">Fecha</th><th>Obra</th><th>Horas</th><th></th></tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id} className="border-b">
              <td className="py-1"><Input type="date" value={f.fecha} onChange={(e) => editarFila(f.id, { fecha: e.target.value })} /></td>
              <td>
                <select className="border rounded px-2 py-1" value={f.obraId ?? ""} onChange={(e) => editarFila(f.id, { obraId: Number(e.target.value) })}>
                  <option value="">— elegir obra —</option>
                  {obras.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                </select>
              </td>
              <td><Input type="number" step="0.5" className="w-20" value={f.horas} onChange={(e) => editarFila(f.id, { horas: Number(e.target.value) })} /></td>
              <td><Button variant="ghost" size="sm" onClick={() => quitarFila(f.id)}>✕</Button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => agregarFila(new Date().toISOString().slice(0, 10))}>+ Día</Button>
        <Button onClick={onGuardar} disabled={filas.length === 0 || !obreroId}>Guardar quincena</Button>
        <Button variant="ghost" onClick={reset}>Limpiar</Button>
      </div>
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
    </div>
  );
}
