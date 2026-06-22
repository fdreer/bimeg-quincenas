"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ClockIcon, ReceiptTextIcon, UsersIcon, TagIcon, LogOutIcon, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

type NavUser = { name: string; email: string; role: string };

const LINKS_ADMIN: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/carga", label: "Carga", icon: ClockIcon },
  { href: "/saldos", label: "Saldos", icon: ReceiptTextIcon },
  { href: "/obreros", label: "Obreros", icon: UsersIcon },
  { href: "/categorias", label: "Categorías", icon: TagIcon },
];

const LINKS_USER: typeof LINKS_ADMIN = [
  { href: "/carga", label: "Carga", icon: ClockIcon },
  { href: "/obreros", label: "Obreros", icon: UsersIcon },
];

export function Nav({ user }: { user: NavUser }) {
  const path = usePathname();
  const router = useRouter();
  const links = user.role === "admin" ? LINKS_ADMIN : LINKS_USER;
  const isActive = (href: string) => path === href || path.startsWith(href + "/");

  async function salir() {
    await authClient.signOut({
      fetchOptions: { onSuccess: () => router.push("/login") },
    });
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-6xl items-center gap-1 px-4 sm:px-6">
          <Link href={user.role === "admin" ? "/" : "/carga"} className="mr-3 font-semibold tracking-tight">
            BIMEG <span className="hidden font-normal text-muted-foreground sm:inline">· Quincenas</span>
          </Link>
          <nav className="hidden items-center gap-1 text-sm md:flex">
            {links.map((l) => {
              const active = isActive(l.href);
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
          <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
            <span className="hidden max-w-[14rem] truncate sm:inline">{user.email}</span>
            <Button variant="ghost" size="icon-sm" aria-label="Salir" onClick={salir}>
              <LogOutIcon />
            </Button>
          </div>
        </div>
      </header>

      <nav
        aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <div
          className="mx-auto grid max-w-md"
          style={{ gridTemplateColumns: `repeat(${links.length}, minmax(0, 1fr))` }}
        >
          {links.map((l) => {
            const active = isActive(l.href);
            const Icon = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors",
                  active ? "text-foreground" : "text-muted-foreground active:bg-muted/60",
                )}
              >
                <Icon className={cn("size-5", active && "stroke-[2.25]")} />
                <span className={cn(active && "font-medium")}>{l.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
