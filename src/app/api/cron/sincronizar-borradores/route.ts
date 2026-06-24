import { NextResponse } from "next/server";
import { sincronizarBorradores } from "@/lib/comprobantes-core";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // la sync puede tardar con varios obreros (I/O contra Odoo)

// Disparado a diario por Vercel Cron (manda Authorization: Bearer ${CRON_SECRET}) o cron externo.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }
  try {
    const r = await sincronizarBorradores();
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
