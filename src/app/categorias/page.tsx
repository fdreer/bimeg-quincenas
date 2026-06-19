import { listarCategorias, crearCategoria, guardarCategoria } from "@/actions/categorias";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic"; // lee datos vivos de la DB en cada request

export default async function CategoriasPage() {
  const filas = await listarCategorias();
  return (
    <main className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
      <h1 className="text-xl font-semibold">Categorías · valor del jornal</h1>

      <Card>
        <CardHeader><CardTitle>Nueva categoría</CardTitle></CardHeader>
        <CardContent>
          <form action={crearCategoria} className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="nombre">Nombre</Label>
              <Input id="nombre" name="nombre" placeholder="HERRERO" className="w-48" required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="valorJornal">Valor jornal (día 8 hs)</Label>
              <Input id="valorJornal" name="valorJornal" type="number" step="0.01" className="w-40" required />
            </div>
            <Button type="submit">Agregar</Button>
          </form>
        </CardContent>
      </Card>

      {filas.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Categoría</TableHead>
              <TableHead className="w-40">Valor jornal</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((c) => {
              const fid = `cat-${c.id}`;
              return (
                <TableRow key={c.id}>
                  <TableCell><Input form={fid} name="nombre" defaultValue={c.nombre} /></TableCell>
                  <TableCell><Input form={fid} name="valorJornal" type="number" step="0.01" defaultValue={Number(c.valorJornal)} className="w-40" /></TableCell>
                  <TableCell>
                    <form id={fid} action={guardarCategoria}>
                      <input type="hidden" name="id" value={c.id} />
                      <Button type="submit" size="sm" variant="secondary">Guardar</Button>
                    </form>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : (
        <p className="text-muted-foreground">Todavía no hay categorías. Agregá la primera arriba (HERRERO, OFICIAL, CAPATAZ…).</p>
      )}
    </main>
  );
}
