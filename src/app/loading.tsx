import { Loader2Icon } from "lucide-react";

// Boundary raíz: feedback instantáneo al navegar mientras el server trae datos.
export default function Loading() {
  return (
    <main className="mx-auto flex max-w-6xl items-center gap-2 p-4 text-sm text-muted-foreground sm:p-6">
      <Loader2Icon className="size-4 animate-spin" /> Cargando…
    </main>
  );
}
