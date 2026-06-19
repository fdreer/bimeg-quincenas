import Link from "next/link";

export default function Home() {
  return (
    <main className="max-w-md mx-auto p-6 space-y-3">
      <h1 className="text-2xl font-semibold">BIMEG · Quincenas</h1>
      <nav className="flex flex-col gap-2">
        <Link className="underline" href="/categorias">1) Categorías · valor jornal</Link>
        <Link className="underline" href="/obreros">2) Obreros · categoría y alias/CBU</Link>
        <Link className="underline" href="/carga">3) Cargar horas</Link>
      </nav>
    </main>
  );
}
