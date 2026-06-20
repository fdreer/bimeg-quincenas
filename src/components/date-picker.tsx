"use client";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function DatePicker({ value, onChange, disabled, "aria-label": ariaLabel }: {
  value: string; // "yyyy-MM-dd"
  onChange: (v: string) => void;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const date = value ? parseISO(value) : undefined;
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" disabled={disabled} aria-label={ariaLabel} className="w-full justify-between px-2.5 font-normal tabular-nums">
            {date ? format(date, "dd/MM/yyyy") : <span className="text-muted-foreground">Elegir fecha</span>}
            <CalendarIcon data-icon="inline-end" className="text-muted-foreground" />
          </Button>
        }
      />
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => d && onChange(format(d, "yyyy-MM-dd"))}
          locale={es}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
