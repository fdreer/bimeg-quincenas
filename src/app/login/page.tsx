"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function LoginInner() {
  const sp = useSearchParams();
  const from = sp.get("from") ?? "/";
  const [loading, setLoading] = useState(false);
  // signIn.social NO tira: devuelve { error }. Si no lo miramos, el spinner queda girando para siempre.
  const [error, setError] = useState(sp.get("error"));

  return (
    <>
      <Button
        size="lg"
        variant="outline"
        className="w-full gap-3 font-medium"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          setError(null);
          const { error } = await authClient.signIn.social({ provider: "google", callbackURL: from });
          if (error) {
            setError(error.message ?? "unknown");
            setLoading(false);
          }
          // si no hay error, el cliente redirige a Google y este componente se desmonta.
        }}
      >
        {loading ? <Loader2Icon className="size-5 animate-spin" /> : <GoogleIcon />}
        Continuar con Google
      </Button>
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error === "access_denied" || error === "forbidden"
            ? "Tu cuenta no está autorizada para esta app."
            : `No pudimos iniciar sesión: ${error}`}
        </p>
      )}
    </>
  );
}

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-b from-muted/40 via-background to-background px-4">
      <Card className="w-full max-w-sm gap-0 p-0 shadow-lg">
        <div className="space-y-2 px-7 pt-8 pb-2 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-bimeg.svg" alt="BIMEG" className="mx-auto h-11 w-auto" />
          <h1 className="text-xl font-semibold tracking-tight">Quincenas</h1>
          <p className="text-sm text-muted-foreground">Ingresá con tu cuenta de Google para continuar.</p>
        </div>
        <CardContent className="space-y-3 px-7 pt-6 pb-7">
          <Suspense>
            <LoginInner />
          </Suspense>
          <p className="pt-1 text-center text-xs text-muted-foreground">
            Solo cuentas autorizadas. Si no podés entrar, hablá con un admin.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
