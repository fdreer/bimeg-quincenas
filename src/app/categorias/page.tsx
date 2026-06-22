import { TagIcon } from "lucide-react";
import { listarCategorias, crearCategoria } from "@/actions/categorias";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { CategoriasTabla } from "./categorias-tabla";
import { requireAdmin } from "@/lib/auth-server";

export const dynamic = "force-dynamic"; // lee datos vivos de la DB en cada request

export default async function CategoriasPage() {
  await requireAdmin();
  const filas = await listarCategorias();
  return (
    <main className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Categorías · valor del jornal</h1>

      <Card>
        <CardHeader><CardTitle>Nueva categoría</CardTitle></CardHeader>
        <CardContent>
          <form action={crearCategoria} className="flex flex-wrap items-end gap-3">
            <div className="grid w-full gap-1.5 sm:w-48">
              <Label htmlFor="nombre">Nombre</Label>
              <Input id="nombre" name="nombre" placeholder="HERRERO" required />
            </div>
            <div className="grid w-full gap-1.5 sm:w-40">
              <Label htmlFor="valorJornal">Valor jornal (día 8 hs)</Label>
              <Input id="valorJornal" name="valorJornal" type="number" inputMode="decimal" step="0.01" required />
            </div>
            <Button type="submit" className="w-full sm:w-auto">Agregar</Button>
          </form>
        </CardContent>
      </Card>

      {filas.length > 0 ? (
        <CategoriasTabla categorias={filas.map((c) => ({ id: c.id, nombre: c.nombre, valorJornal: c.valorJornal }))} />
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><TagIcon /></EmptyMedia>
            <EmptyTitle>Todavía no hay categorías</EmptyTitle>
            <EmptyDescription>Agregá la primera arriba (HERRERO, OFICIAL, CAPATAZ…).</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </main>
  );
}
