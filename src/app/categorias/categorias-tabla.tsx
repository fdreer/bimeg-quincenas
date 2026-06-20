"use client";
import { useState } from "react";
import { PencilIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { guardarCategoria } from "@/actions/categorias";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type CategoriaRow = { id: number; nombre: string; valorJornal: string };
const money = (n: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
const COLS = "sm:grid-cols-[1fr_10rem_2rem]";

export function CategoriasTabla({ categorias }: { categorias: CategoriaRow[] }) {
  const [editId, setEditId] = useState<number | null>(null);
  const edit = editId != null ? categorias.find((c) => c.id === editId) ?? null : null;
  return (
    <div className="space-y-2 sm:space-y-0">
      <div className={`hidden gap-3 px-3 text-xs font-medium text-muted-foreground sm:grid ${COLS}`}>
        <span>Categoría</span><span className="text-right">Valor jornal</span><span />
      </div>
      {categorias.map((c) => (
        <div
          key={c.id}
          className={`relative grid grid-cols-1 items-center gap-1 rounded-lg border p-3 sm:gap-3 sm:rounded-none sm:border-0 sm:border-b sm:p-3 ${COLS}`}
        >
          <span className="pr-9 font-medium sm:pr-0">{c.nombre}</span>
          <span className="text-sm tabular-nums sm:text-right">
            <span className="text-muted-foreground sm:hidden">Jornal: </span>{money(Number(c.valorJornal))}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Editar ${c.nombre}`}
            onClick={() => setEditId(c.id)}
            className="absolute top-2.5 right-2.5 text-muted-foreground sm:static sm:justify-self-end"
          >
            <PencilIcon />
          </Button>
        </div>
      ))}

      <Dialog open={edit != null} onOpenChange={(o) => { if (!o) setEditId(null); }}>
        <DialogContent>
          {edit && <EditarCategoria key={edit.id} categoria={edit} onListo={() => setEditId(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditarCategoria({ categoria, onListo }: { categoria: CategoriaRow; onListo: () => void }) {
  const [nombre, setNombre] = useState(categoria.nombre);
  const [valorJornal, setValorJornal] = useState(categoria.valorJornal);
  const [guardando, setGuardando] = useState(false);

  async function onGuardar() {
    setGuardando(true);
    try {
      const fd = new FormData();
      fd.set("id", String(categoria.id));
      fd.set("nombre", nombre.trim());
      fd.set("valorJornal", valorJornal);
      await guardarCategoria(fd);
      toast.success("Categoría actualizada");
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
        <DialogTitle>{categoria.nombre}</DialogTitle>
        <DialogDescription>Nombre y valor del jornal (día de 8 hs).</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="cat-nombre">Nombre</Label>
          <Input id="cat-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cat-jornal">Valor jornal</Label>
          <Input id="cat-jornal" type="number" inputMode="decimal" step="0.01" value={valorJornal} onChange={(e) => setValorJornal(e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost">Cancelar</Button>} />
        <Button onClick={onGuardar} disabled={guardando || !nombre.trim()}>
          {guardando && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
          Guardar
        </Button>
      </DialogFooter>
    </>
  );
}
