"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

function LoginInner() {
  const sp = useSearchParams();
  const from = sp.get("from") ?? "/";
  const error = sp.get("error");
  const [loading, setLoading] = useState(false);

  return (
    <>
      <Button
        size="lg"
        className="w-full"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          await authClient.signIn.social({ provider: "google", callbackURL: from });
        }}
      >
        {loading && <Loader2Icon className="animate-spin" />}
        Continuar con Google
      </Button>
      {error && (
        <p className="text-sm text-destructive">
          {error === "access_denied" || error === "forbidden"
            ? "Tu cuenta no está autorizada para esta app."
            : "No pudimos iniciar sesión. Probá de nuevo."}
        </p>
      )}
    </>
  );
}

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-sm flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">BIMEG · Quincenas</h1>
        <p className="text-sm text-muted-foreground">Ingresá con tu cuenta de Google.</p>
      </div>
      <Suspense>
        <LoginInner />
      </Suspense>
    </main>
  );
}
