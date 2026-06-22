"use client";
import { Combobox } from "@base-ui/react/combobox";
import { CheckIcon, ChevronsUpDownIcon, SearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EstadoCargaObrero } from "@/lib/calc";

export type ObreroOpcion = { id: number; nombre: string; dni: string | null };

// Sin tildes ni mayúsculas, para que "gomez" matchee "Gómez".
const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

// El filtro por defecto de Base UI matchea solo el label (nombre); este suma el DNI.
function matchObrero(o: ObreroOpcion, query: string) {
  const q = norm(query.trim());
  return q === "" || norm(`${o.nombre} ${o.dni ?? ""}`).includes(q);
}

// Chip de estado por obrero dentro de la lista: "sin cargar" o "✓ hasta DD/MM".
function ChipEstado({ e }: { e: EstadoCargaObrero | undefined }) {
  if (!e || e.movimientos === 0)
    return <span className="shrink-0 text-xs text-muted-foreground">sin cargar</span>;
  const dm = e.ultimaFecha ? `${e.ultimaFecha.slice(8, 10)}/${e.ultimaFecha.slice(5, 7)}` : null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
      <CheckIcon className="size-3" />
      {dm ? `hasta ${dm}` : "cargado"}
    </span>
  );
}

// Buscá por nombre o DNI; el filtrado lo hace Base UI con Intl.Collator (ignora mayúsculas y tildes).
export function ObreroCombobox({ obreros, value, onSelect, estado, disabled }: {
  obreros: ObreroOpcion[];
  value: number;
  onSelect: (id: number) => void;
  estado: Record<number, EstadoCargaObrero>;
  disabled?: boolean;
}) {
  const seleccionado = obreros.find((o) => o.id === value) ?? null;
  return (
    <Combobox.Root
      items={obreros}
      value={seleccionado}
      onValueChange={(o: ObreroOpcion | null) => o && onSelect(o.id)}
      itemToStringLabel={(o: ObreroOpcion | null) => o?.nombre ?? ""}
      isItemEqualToValue={(a: ObreroOpcion | null, b: ObreroOpcion | null) => a?.id === b?.id}
      filter={(o: ObreroOpcion, query: string) => matchObrero(o, query)}
      disabled={disabled}
    >
      <div className="relative w-full sm:w-64">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Combobox.Input
          placeholder="Buscar obrero o DNI…"
          aria-label="Obrero"
          className={cn(
            "h-8 w-full rounded-lg border border-input bg-transparent pr-8 pl-8 text-sm outline-none transition-colors",
            "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            "disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
          )}
        />
        <Combobox.Trigger
          aria-label="Abrir lista de obreros"
          className="absolute top-1/2 right-1 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
        >
          <ChevronsUpDownIcon className="size-4" />
        </Combobox.Trigger>
      </div>

      <Combobox.Portal>
        <Combobox.Positioner side="bottom" align="start" sideOffset={4} className="isolate z-50">
          <Combobox.Popup
            style={{ maxHeight: "min(22rem, var(--available-height))" }}
            className="w-(--anchor-width) min-w-72 overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
          >
            <Combobox.Empty className="px-2 py-6 text-center text-sm text-muted-foreground">Sin resultados</Combobox.Empty>
            <Combobox.List>
              {(o: ObreroOpcion, i: number) => (
                <Combobox.Item
                  key={o.id}
                  value={o}
                  index={i}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  <span className="flex-1 truncate">{o.nombre}</span>
                  <ChipEstado e={estado[o.id]} />
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
