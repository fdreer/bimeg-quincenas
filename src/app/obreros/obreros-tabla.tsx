"use client";
import { useState } from "react";
import { guardarObrero } from "@/actions/obreros";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type ObreroRow = { id: number; nombre: string; categoriaId: number | null; valorJornal: string | null; aliasCbu: string | null };
type CategoriaLite = { id: number; nombre: string };

export function ObrerosTabla({ obreros, categorias }: { obreros: ObreroRow[]; categorias: CategoriaLite[] }) {
  const catItems: Record<string, string> = { "": "— sin categoría —", ...Object.fromEntries(categorias.map((c) => [String(c.id), c.nombre])) };
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Obrero</TableHead>
          <TableHead className="w-44">Categoría</TableHead>
          <TableHead className="w-32">Jornal propio</TableHead>
          <TableHead className="w-56">Alias / CBU</TableHead>
          <TableHead className="w-28" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {obreros.map((o) => <Fila key={o.id} obrero={o} categorias={categorias} catItems={catItems} />)}
      </TableBody>
    </Table>
  );
}

function Fila({ obrero, categorias, catItems }: { obrero: ObreroRow; categorias: CategoriaLite[]; catItems: Record<string, string> }) {
  const [categoriaId, setCategoriaId] = useState(obrero.categoriaId != null ? String(obrero.categoriaId) : "");
  const [valorJornal, setValorJornal] = useState(obrero.valorJornal ?? "");
  const [aliasCbu, setAliasCbu] = useState(obrero.aliasCbu ?? "");
  const [estado, setEstado] = useState<"" | "guardando" | "ok">("");

  async function onGuardar() {
    setEstado("guardando");
    await guardarObrero(obrero.id, {
      categoriaId: categoriaId ? Number(categoriaId) : null,
      valorJornal: valorJornal.trim() ? Number(valorJornal) : null,
      aliasCbu: aliasCbu.trim() ? aliasCbu.trim() : null,
    });
    setEstado("ok");
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{obrero.nombre}</TableCell>
      <TableCell>
        <Select items={catItems} value={categoriaId} onValueChange={(v) => { setCategoriaId(v ?? ""); setEstado(""); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="— sin categoría —" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">— sin categoría —</SelectItem>
            {categorias.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Input type="number" step="0.01" placeholder="usa categoría" value={valorJornal}
          onChange={(e) => { setValorJornal(e.target.value); setEstado(""); }} className="w-28" />
      </TableCell>
      <TableCell>
        <Input placeholder="alias o CBU" value={aliasCbu}
          onChange={(e) => { setAliasCbu(e.target.value); setEstado(""); }} />
      </TableCell>
      <TableCell>
        <Button size="sm" onClick={onGuardar} disabled={estado === "guardando"}>
          {estado === "guardando" ? "…" : estado === "ok" ? "✓ Guardado" : "Guardar"}
        </Button>
      </TableCell>
    </TableRow>
  );
}
