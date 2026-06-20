"use client";
import { useMemo, useState } from "react";
import { SearchIcon, PencilIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { guardarObrero } from "@/actions/obreros";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type ObreroRow = { id: number; nombre: string; categoriaId: number | null; valorJornal: string | null; aliasCbu: string | null };
type CategoriaLite = { id: number; nombre: string; valorJornal: string | null };

const PAGE = 20;
const COLS = "sm:grid-cols-[minmax(0,1.6fr)_minmax(8rem,auto)_8rem_minmax(0,1fr)_2rem]";
const money = (n: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);

export function ObrerosTabla({ obreros, categorias }: { obreros: ObreroRow[]; categorias: CategoriaLite[] }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [editId, setEditId] = useState<number | null>(null);

  const catById = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias]);
  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? obreros.filter((o) => o.nombre.toLowerCase().includes(q)) : obreros;
  }, [obreros, query]);

  const totalPages = Math.max(1, Math.ceil(filtradas.length / PAGE));
  const pageSafe = Math.min(page, totalPages - 1);
  const visibles = filtradas.slice(pageSafe * PAGE, pageSafe * PAGE + PAGE);
  const editObrero = editId != null ? obreros.find((o) => o.id === editId) ?? null : null;

  // Jornal efectivo: override propio, si no el de la categoría, si no nada.
  function jornal(o: ObreroRow) {
    if (o.valorJornal != null) return { v: money(Number(o.valorJornal)), cat: false };
    const c = o.categoriaId != null ? catById.get(o.categoriaId) : null;
    if (c?.valorJornal != null) return { v: money(Number(c.valorJornal)), cat: true };
    return { v: "—", cat: false };
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} placeholder="Buscar obrero…" className="pl-8" />
      </div>

      <div className={`hidden gap-3 px-3 text-xs font-medium text-muted-foreground sm:grid ${COLS}`}>
        <span>Obrero</span><span>Categoría</span><span className="text-right">Jornal</span><span>Alias / CBU</span><span />
      </div>

      <div className="space-y-2 sm:space-y-0">
        {visibles.map((o) => {
          const cat = o.categoriaId != null ? catById.get(o.categoriaId) : null;
          const j = jornal(o);
          return (
            <div
              key={o.id}
              className={`relative grid grid-cols-1 items-center gap-1.5 rounded-lg border p-3 sm:gap-3 sm:rounded-none sm:border-0 sm:border-b sm:p-3 ${COLS}`}
            >
              <span className="pr-9 font-medium sm:pr-0">{o.nombre}</span>
              <span>{cat ? <Badge variant="secondary">{cat.nombre}</Badge> : <span className="text-sm text-muted-foreground">— sin categoría —</span>}</span>
              <span className="text-sm tabular-nums sm:text-right">
                <span className="text-muted-foreground sm:hidden">Jornal: </span>
                {j.v}{j.cat && <span className="ml-1 text-xs text-muted-foreground">(cat.)</span>}
              </span>
              <span className="truncate text-sm text-muted-foreground">
                <span className="sm:hidden">Alias: </span>{o.aliasCbu || "—"}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Editar ${o.nombre}`}
                onClick={() => setEditId(o.id)}
                className="absolute top-2.5 right-2.5 text-muted-foreground sm:static sm:justify-self-end"
              >
                <PencilIcon />
              </Button>
            </div>
          );
        })}
        {visibles.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">Sin resultados para “{query}”.</p>}
      </div>

      {filtradas.length > PAGE && (
        <div className="flex items-center justify-between pt-1 text-sm text-muted-foreground">
          <span className="tabular-nums">{filtradas.length} obreros</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={pageSafe === 0} onClick={() => setPage(pageSafe - 1)}>Anterior</Button>
            <span className="tabular-nums">{pageSafe + 1} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={pageSafe >= totalPages - 1} onClick={() => setPage(pageSafe + 1)}>Siguiente</Button>
          </div>
        </div>
      )}

      <Dialog open={editObrero != null} onOpenChange={(o) => { if (!o) setEditId(null); }}>
        <DialogContent>
          {editObrero && <EditarObrero key={editObrero.id} obrero={editObrero} categorias={categorias} onListo={() => setEditId(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditarObrero({ obrero, categorias, onListo }: { obrero: ObreroRow; categorias: CategoriaLite[]; onListo: () => void }) {
  const catItems: Record<string, string> = { "": "— sin categoría —", ...Object.fromEntries(categorias.map((c) => [String(c.id), c.nombre])) };
  const [categoriaId, setCategoriaId] = useState(obrero.categoriaId != null ? String(obrero.categoriaId) : "");
  const [valorJornal, setValorJornal] = useState(obrero.valorJornal ?? "");
  const [aliasCbu, setAliasCbu] = useState(obrero.aliasCbu ?? "");
  const [guardando, setGuardando] = useState(false);

  async function onGuardar() {
    setGuardando(true);
    try {
      await guardarObrero(obrero.id, {
        categoriaId: categoriaId ? Number(categoriaId) : null,
        valorJornal: valorJornal.trim() ? Number(valorJornal) : null,
        aliasCbu: aliasCbu.trim() ? aliasCbu.trim() : null,
      });
      toast.success(`${obrero.nombre} actualizado`);
      onListo();
    } catch {
      toast.error("No se pudo guardar. Reintentá.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{obrero.nombre}</DialogTitle>
        <DialogDescription>Categoría, jornal y datos de pago.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4">
        <div className="grid gap-1.5">
          <Label>Categoría</Label>
          <Select items={catItems} value={categoriaId} onValueChange={(v) => setCategoriaId(v ?? "")}>
            <SelectTrigger className="w-full"><SelectValue placeholder="— sin categoría —" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">— sin categoría —</SelectItem>
              {categorias.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Jornal propio</Label>
          <Input type="number" inputMode="decimal" step="0.01" placeholder="usa el de la categoría" value={valorJornal} onChange={(e) => setValorJornal(e.target.value)} />
          <p className="text-xs text-muted-foreground">Dejalo vacío para usar el jornal de la categoría.</p>
        </div>
        <div className="grid gap-1.5">
          <Label>Alias / CBU</Label>
          <Input placeholder="alias o CBU" value={aliasCbu} onChange={(e) => setAliasCbu(e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost">Cancelar</Button>} />
        <Button onClick={onGuardar} disabled={guardando}>
          {guardando && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
          Guardar
        </Button>
      </DialogFooter>
    </>
  );
}
