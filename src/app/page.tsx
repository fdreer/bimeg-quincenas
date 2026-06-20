import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

const PASOS = [
  { n: 1, href: "/categorias", title: "Categorías", desc: "Valor del jornal por categoría (HERRERO, OFICIAL, CAPATAZ…)." },
  { n: 2, href: "/obreros", title: "Obreros", desc: "Asigná categoría y alias/CBU a cada obrero." },
  { n: 3, href: "/carga", title: "Cargar horas", desc: "Registrá los días trabajados de la quincena.", primary: true },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Quincenas</h1>
        <p className="text-sm text-muted-foreground">Tres pasos: configurar una vez, cargar cada quincena.</p>
      </div>

      <div className="space-y-2">
        {PASOS.map((p) => (
          <Link key={p.href} href={p.href} className="block">
            <Card
              size="sm"
              className="flex-row items-center gap-3 px-4 transition-colors hover:bg-muted/50 data-[primary=true]:ring-foreground/20"
              data-primary={p.primary || undefined}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium tabular-nums">
                {p.n}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{p.title}</span>
                <span className="block text-sm text-muted-foreground">{p.desc}</span>
              </span>
              <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
