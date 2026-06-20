import * as React from "react";
import { cn } from "@/lib/utils";

// Campo con etiqueta: visible en mobile (apilado), sr-only cuando la fila de encabezados
// toma el control visual. hideLabelAt = el breakpoint en que aparece esa fila de encabezados.
export function Field({ label, className, children, hideLabelAt = "md" }: {
  label: string;
  className?: string;
  children: React.ReactNode;
  hideLabelAt?: "md" | "lg";
}) {
  return (
    <label className={cn("grid gap-1", className)}>
      <span className={cn("text-xs text-muted-foreground", hideLabelAt === "lg" ? "lg:sr-only" : "md:sr-only")}>{label}</span>
      {children}
    </label>
  );
}
