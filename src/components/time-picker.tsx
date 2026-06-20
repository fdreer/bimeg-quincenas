"use client";
import { ClockIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const HORAS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
// ponytail: pasos de 15 min cubren el 95% de los turnos; para 5 min cambiar este array.
const MINUTOS = ["00", "15", "30", "45"];

export function TimePicker({ value, onChange, disabled, "aria-label": ariaLabel }: {
  value: string; // "HH:MM" o ""
  onChange: (v: string) => void;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const [h, m] = value ? value.split(":") : ["", ""];
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" disabled={disabled} aria-label={ariaLabel} className="w-full justify-between px-2.5 font-normal tabular-nums">
            {value || <span className="text-muted-foreground">--:--</span>}
            <ClockIcon data-icon="inline-end" className="text-muted-foreground" />
          </Button>
        }
      />
      <PopoverContent className="flex w-auto gap-1 p-1.5" align="start">
        <Columna label="Hora" items={HORAS} selected={h} onSelect={(nh) => onChange(`${nh}:${m || "00"}`)} />
        <Columna label="Minutos" items={MINUTOS} selected={m} onSelect={(nm) => onChange(`${h || "00"}:${nm}`)} />
      </PopoverContent>
    </Popover>
  );
}

function Columna({ label, items, selected, onSelect }: {
  label: string; items: string[]; selected: string; onSelect: (v: string) => void;
}) {
  return (
    <div role="listbox" aria-label={label} className="flex max-h-52 w-12 flex-col gap-0.5 overflow-y-auto">
      {items.map((it) => (
        <Button
          key={it}
          type="button"
          size="sm"
          variant={selected === it ? "default" : "ghost"}
          aria-selected={selected === it}
          className="w-full justify-center tabular-nums"
          onClick={() => onSelect(it)}
        >
          {it}
        </Button>
      ))}
    </div>
  );
}
