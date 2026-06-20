"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Carga primero: es la pantalla de uso diario. Obreros/Categorías son setup.
const LINKS = [
  { href: "/carga", label: "Carga" },
  { href: "/obreros", label: "Obreros" },
  { href: "/categorias", label: "Categorías" },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-12 max-w-6xl items-center gap-1 px-4 sm:px-6">
        <Link href="/" className="mr-3 font-semibold tracking-tight">
          BIMEG <span className="hidden font-normal text-muted-foreground sm:inline">· Quincenas</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {LINKS.map((l) => {
            const active = path === l.href || path.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md px-2.5 py-1.5 transition-colors",
                  active
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
