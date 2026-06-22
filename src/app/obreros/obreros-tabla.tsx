"use client";
import { useMemo, useState } from "react";
import { SearchIcon, PencilIcon, Loader2Icon, CopyIcon, CheckIcon } from "lucide-react";
import { toast } from "sonner";
import { guardarObrero } from "@/actions/obreros";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type ObreroRow = { id: number; nombre: string; categoriaId: number | null; valorJornal: string | null; aliasCbu: string | null; habilitado: boolean; obraHabitualId: number | null };
type CategoriaLite = { id: number; nombre: string; valorJornal: string | null };
type ObraLite = { id: number; nombre: string };

const PAGE = 20;
// Obrero (izq) | Categoría | Alias/CBU | acción. Sin `auto`: las columnas miden igual
// en el header y en las filas, así cada dato queda centrado bajo su título.
const COLS = "sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.4fr)_2.5rem]";
const COLS_RO = "sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.4fr)]";

export function ObrerosTabla({ obreros, categorias, obras, puedeEditar = true }: { obreros: ObreroRow[]; categorias: CategoriaLite[]; obras: ObraLite[]; puedeEditar?: boolean }) {
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

  return (
    <div className="space-y-3">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} placeholder="Buscar obrero…" className="pl-8" />
      </div>

      <div className={`hidden gap-3 px-3 text-xs font-medium text-muted-foreground sm:grid ${puedeEditar ? COLS : COLS_RO}`}>
        <span>Obrero</span><span className="text-center">Categoría</span><span className="text-center">Alias / CBU</span>{puedeEditar && <span />}
      </div>

      <div className="space-y-2 sm:space-y-0">
        {visibles.map((o) => {
          const cat = o.categoriaId != null ? catById.get(o.categoriaId) : null;
          return (
            <div
              key={o.id}
              className={`relative grid grid-cols-1 items-center gap-1.5 rounded-lg border p-3 sm:gap-3 sm:rounded-none sm:border-0 sm:border-b sm:p-3 ${puedeEditar ? COLS : COLS_RO}`}
            >
              <span className="pr-9 font-medium sm:pr-0">
                {o.nombre}
                {!o.habilitado && <Badge variant="secondary" className="ml-2 align-middle text-[10px]">deshabilitado</Badge>}
              </span>
              <span className="sm:text-center">
                {cat ? <Badge variant="secondary">{cat.nombre}</Badge> : <span className="text-sm text-muted-foreground">— sin categoría —</span>}
              </span>
              <span className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground sm:justify-center">
                <span className="sm:hidden">Alias: </span>
                {o.aliasCbu ? (
                  <>
                    <span className="truncate">{o.aliasCbu}</span>
                    <CopyButton value={o.aliasCbu} />
                  </>
                ) : (
                  "—"
                )}
              </span>
              {puedeEditar && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Editar ${o.nombre}`}
                  onClick={() => setEditId(o.id)}
                  className="absolute top-2.5 right-2.5 text-muted-foreground sm:static sm:justify-self-center"
                >
                  <PencilIcon />
                </Button>
              )}
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
          {editObrero && <EditarObrero key={editObrero.id} obrero={editObrero} categorias={categorias} obras={obras} onListo={() => setEditId(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Botón de copiar al portapapeles: muestra un check 1.5s como confirmación.
function CopyButton({ value, className }: { value: string; className?: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Copiar alias/CBU"
      className={`shrink-0 text-muted-foreground ${className ?? ""}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1500);
        } catch {
          toast.error("No se pudo copiar");
        }
      }}
    >
      {copiado ? <CheckIcon className="text-green-600" /> : <CopyIcon />}
    </Button>
  );
}

function EditarObrero({ obrero, categorias, obras, onListo }: { obrero: ObreroRow; categorias: CategoriaLite[]; obras: ObraLite[]; onListo: () => void }) {
  const catItems: Record<string, string> = { "": "— sin categoría —", ...Object.fromEntries(categorias.map((c) => [String(c.id), c.nombre])) };
  const [categoriaId, setCategoriaId] = useState(obrero.categoriaId != null ? String(obrero.categoriaId) : "");
  const [valorJornal, setValorJornal] = useState(obrero.valorJornal ?? "");
  const [aliasCbu, setAliasCbu] = useState(obrero.aliasCbu ?? "");
  const [habilitado, setHabilitado] = useState(obrero.habilitado);
  const obraItems: Record<string, string> = { "": "— sin obra habitual —", ...Object.fromEntries(obras.map((o) => [String(o.id), o.nombre])) };
  const [obraHabitualId, setObraHabitualId] = useState(obrero.obraHabitualId != null ? String(obrero.obraHabitualId) : "");
  const [guardando, setGuardando] = useState(false);

  async function onGuardar() {
    setGuardando(true);
    try {
      await guardarObrero(obrero.id, {
        categoriaId: categoriaId ? Number(categoriaId) : null,
        valorJornal: valorJornal.trim() ? Number(valorJornal) : null,
        aliasCbu: aliasCbu.trim() ? aliasCbu.trim() : null,
        habilitado,
        obraHabitualId: obraHabitualId ? Number(obraHabitualId) : null,
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
          <Label>Obra habitual</Label>
          <Select items={obraItems} value={obraHabitualId} onValueChange={(v) => setObraHabitualId(v ?? "")}>
            <SelectTrigger className="w-full"><SelectValue placeholder="— sin obra habitual —" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">— sin obra habitual —</SelectItem>
              {obras.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Pre-carga Lun–Vie en /carga. Vacío = cada día arranca Ausente.</p>
        </div>
        <div className="grid gap-1.5">
          <Label>Jornal propio</Label>
          <Input type="number" inputMode="decimal" step="0.01" placeholder="usa el de la categoría" value={valorJornal} onChange={(e) => setValorJornal(e.target.value)} />
          <p className="text-xs text-muted-foreground">Dejalo vacío para usar el jornal de la categoría.</p>
        </div>
        <div className="grid gap-1.5">
          <Label>Alias / CBU</Label>
          <div className="relative">
            <Input placeholder="alias o CBU" value={aliasCbu} onChange={(e) => setAliasCbu(e.target.value)} className="pr-9" />
            {aliasCbu.trim() && <CopyButton value={aliasCbu} className="absolute top-1/2 right-1 -translate-y-1/2" />}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input id="habilitado-check" type="checkbox" checked={habilitado} onChange={(e) => setHabilitado(e.target.checked)} className="size-4 cursor-pointer accent-primary" />
          <Label htmlFor="habilitado-check" className="cursor-pointer">Habilitado</Label>
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
