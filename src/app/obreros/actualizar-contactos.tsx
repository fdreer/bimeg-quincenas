"use client";
import { useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sincronizarObreros } from "@/actions/obreros";

// Botón cliente: spinner mientras sincroniza + toast al terminar. La action revalida
// /obreros, así que la lista se actualiza sola al volver.
export function ActualizarContactos() {
  const [pendiente, startTransition] = useTransition();
  return (
    <Button
      variant="secondary"
      disabled={pendiente}
      onClick={() =>
        startTransition(async () => {
          try {
            const n = await sincronizarObreros();
            toast.success(n > 0 ? `${n} obreros cargados / actualizados` : "No hay contactos etiquetados como “Obrero” en Odoo");
          } catch {
            toast.error("No se pudieron actualizar los contactos. Reintentá.");
          }
        })
      }
    >
      {pendiente && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
      {pendiente ? "Actualizando…" : "Actualizar contactos"}
    </Button>
  );
}
