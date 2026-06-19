import { listarObreros, sincronizarObreros, guardarObrero } from "@/actions/obreros";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic"; // lee datos vivos de la DB en cada request

export default async function ObrerosPage() {
  const { obreros, categorias } = await listarObreros();
  return (
    <main className="max-w-4xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Obreros</h1>
        <form action={sincronizarObreros}>
          <Button type="submit" variant="secondary">Actualizar contactos</Button>
        </form>
      </div>

      {obreros.length === 0 ? (
        <p className="text-muted-foreground">
          No hay obreros todavía. Etiquetá los contactos como &quot;Obrero&quot; en Odoo y tocá &quot;Actualizar contactos&quot;.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2">Obrero</th>
              <th>Categoría</th>
              <th>Jornal propio (opc.)</th>
              <th>Alias / CBU</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {obreros.map((o) => (
              <tr key={o.id} className="border-b">
                <td className="py-2 align-middle">{o.nombre}</td>
                <td colSpan={4}>
                  <form action={guardarObrero} className="flex flex-wrap gap-2 items-center py-1">
                    <input type="hidden" name="id" value={o.id} />
                    <select name="categoriaId" defaultValue={o.categoriaId ?? ""} className="border rounded px-2 py-1">
                      <option value="">— sin categoría —</option>
                      {categorias.map((c) => (
                        <option key={c.id} value={c.id}>{c.nombre}</option>
                      ))}
                    </select>
                    <Input name="valorJornal" type="number" step="0.01" placeholder="usa categoría" defaultValue={o.valorJornal ?? ""} className="w-32" />
                    <Input name="aliasCbu" placeholder="alias o CBU" defaultValue={o.aliasCbu ?? ""} className="w-56" />
                    <Button type="submit" size="sm">Guardar</Button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {categorias.length === 0 && obreros.length > 0 && (
        <p className="text-muted-foreground">Tip: cargá las categorías en /categorias para poder asignarlas acá.</p>
      )}
    </main>
  );
}
