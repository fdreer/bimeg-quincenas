import { listarCategorias, crearCategoria, guardarCategoria } from "@/actions/categorias";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic"; // lee datos vivos de la DB en cada request

export default async function CategoriasPage() {
  const filas = await listarCategorias();
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-xl font-semibold">Categorías · valor del jornal</h1>

      <form action={crearCategoria} className="flex gap-2 items-end">
        <label className="text-sm">
          Nueva categoría
          <Input name="nombre" placeholder="HERRERO" className="w-48" required />
        </label>
        <label className="text-sm">
          Valor jornal (día 8 hs)
          <Input name="valorJornal" type="number" step="0.01" className="w-36" required />
        </label>
        <Button type="submit">Agregar</Button>
      </form>

      {filas.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2">Categoría</th>
              <th>Valor jornal</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((c) => (
              <tr key={c.id} className="border-b">
                <td colSpan={3}>
                  <form action={guardarCategoria} className="flex gap-2 items-center py-1">
                    <input type="hidden" name="id" value={c.id} />
                    <Input name="nombre" defaultValue={c.nombre} className="w-48" />
                    <Input name="valorJornal" type="number" step="0.01" defaultValue={Number(c.valorJornal)} className="w-36" />
                    <Button type="submit" size="sm">Guardar</Button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {filas.length === 0 && <p className="text-muted-foreground">Todavía no hay categorías. Agregá la primera arriba (HERRERO, OFICIAL, CAPATAZ…).</p>}
    </main>
  );
}
