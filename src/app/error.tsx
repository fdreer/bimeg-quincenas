"use client";
import { Button } from "@/components/ui/button";

// Si un Server Component falla (p.ej. Odoo no responde JSON), mostramos un
// error accionable en vez de dejar la página colgada en "Cargando…".
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-2xl space-y-3 p-4 sm:p-6">
      <h1 className="text-lg font-semibold">No se pudieron cargar los datos</h1>
      <p className="text-sm text-muted-foreground">
        Suele ser Odoo o la base que no respondieron. Reintentá.
      </p>
      <Button onClick={reset}>Reintentar</Button>
    </main>
  );
}
