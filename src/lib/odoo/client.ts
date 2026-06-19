const URL = process.env.ODOO_URL!;
const DB = process.env.ODOO_DB!;
const USUARIO = process.env.ODOO_USERNAME!;
const CLAVE = process.env.ODOO_API_KEY!;

let uidCache: number | null = null;

async function llamarJsonRpc(servicio: string, metodo: string, args: unknown[]) {
  const res = await fetch(`${URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service: servicio, method: metodo, args }, id: 1 }),
    cache: "no-store",
  });
  const json = await res.json();
  if (json.error) throw new Error(`Odoo error: ${JSON.stringify(json.error)}`);
  return json.result;
}

export async function obtenerUid(): Promise<number> {
  if (uidCache) return uidCache;
  const uid = await llamarJsonRpc("common", "login", [DB, USUARIO, CLAVE]);
  if (!uid) throw new Error("Odoo: autenticación fallida (revisá ODOO_DB/USERNAME/API_KEY)");
  uidCache = uid as number;
  return uidCache;
}

export async function ejecutar(
  modelo: string,
  metodo: string,
  params: unknown[],
  kwargs: Record<string, unknown> = {},
) {
  const uid = await obtenerUid();
  return llamarJsonRpc("object", "execute_kw", [DB, uid, CLAVE, modelo, metodo, params, kwargs]);
}
