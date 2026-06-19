import { listarCategorias, guardarValorCategoria } from "@/actions/categorias";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default async function CategoriasPage() {
  const filas = await listarCategorias();
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-4">
      <h1 className="text-xl font-semibold">Categorías · valor hora</h1>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2">Categoría</th>
            <th>Valor hora</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.odooPuestoId} className="border-b">
              <td className="py-2">{f.nombre}</td>
              <td colSpan={2}>
                <form action={guardarValorCategoria} className="flex gap-2 items-center">
                  <input type="hidden" name="odooPuestoId" value={f.odooPuestoId} />
                  <input type="hidden" name="nombre" value={f.nombre} />
                  <Input name="valorHora" type="number" step="0.01" defaultValue={f.valorHora} className="w-32" />
                  <Button type="submit" size="sm">Guardar</Button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {filas.length === 0 && (
        <p className="text-muted-foreground">
          No hay puestos en Odoo. Creá los puestos (HERRERO, OFICIAL, CAPATAZ…) en Empleados → Configuración → Puestos.
        </p>
      )}
    </main>
  );
}
