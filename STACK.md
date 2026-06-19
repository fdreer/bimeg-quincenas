# BIMEG · Liquidación de quincenas — Stack técnico

> Estado: **definición de stack (jun 2026)**. Diseño funcional acordado en la sesión de brainstorming.
> Control **operativo** de tarjas (horas de obreros por obra → saldo por obrero + costo de mano de obra por obra). NO es nómina formal.

## Dos entregables (no mezclar)
1. **App web** — la usa un **admin no técnico** para cargar las horas (reemplaza el papel). Escribe el resultado a Odoo.
2. **Skill de Claude** (Python + MCP de Odoo, estilo `bimeg-flujo-fondos`) — la usa **Franco** para liquidar/consultar y generar **planilla consolidada + constancias** (Excel).

La app **no liquida**; la skill **no carga**.

## Reparto de datos (regla: cada hecho en un solo lado)
**La app LEE de Odoo (vivo, no copia):**
- Obras = cuentas analíticas.
- Obreros = empleados (puesto = categoría: capataz/oficial/herrero…).
- Adelantos = **pago a cuenta a nombre del obrero** (read-only: la app los muestra y resta, **no** los crea).

**La app POSEE (su DB):**
- Tabla **categoría → valor hora** (hueco real de Odoo: no tiene costo por categoría, solo por empleado).
- **Horas** trabajadas por obrero/obra/día de la quincena (carga, editable, en borrador hasta cerrar).
- Opcional: estados que Odoo no modela (NO TRABAJÓ / feriado / ausente).

**La app ESCRIBE en Odoo (al cerrar la quincena):**
- Costo de mano de obra por obra (documento por obrero o asiento con distribución analítica). Mecanismo factura vs asiento = a definir con el contador.

Consecuencia: como las horas viven en la app, **no se usa la pantalla de hojas de horas de Odoo** (la que no convencía). Odoo recibe el resultado financiero, no la carga.

## Stack de la app web
| Capa | Elección | Nota |
|---|---|---|
| Lenguaje | **TypeScript** | tipado en el borde Odoo↔DB |
| Framework | **Next.js** (App Router + Server Actions) | llamadas a Odoo y DB server-side; credenciales nunca en el browser |
| Hosting | **Vercel** (primario) | first-class para Next. Alt: Cloudflare (ver abajo) |
| DB | **Supabase** (Postgres) | usado como **Postgres pelado** (+ Storage opcional para fotos de tarja). **NO** se usa Supabase Auth (ya hay better-auth) **ni RLS** (acceso server-side). Serverless → usar el **pooler en modo transaction (puerto 6543)**. Alt: Neon |
| ORM | **Drizzle** | liviano, type-safe, migraciones simples. Anda igual con Supabase o Neon |
| Auth | **better-auth + Google**, allowlist de mails | TS-first, agnóstico, adapter de Drizzle. Real pero mínimo (es dato de sueldos) |
| Estado global | **Zustand** | SOLO estado de UI / borrador de la quincena. **No** cachear datos de Odoo/DB acá (eso es server-side / TanStack Query) |
| Fechas | **date-fns** | liviano, tree-shakeable; quincenas = rangos de fecha |
| Tablas | **TanStack Table** | headless; se integra con el patrón data-table de shadcn |
| UI | **Tailwind + shadcn/ui** | limpia y ordenada, accesible |
| Validación | **Zod** | valida formulario y payload a Odoo |
| Cliente Odoo | wrapper fino **JSON-RPC** server-side (o `odoo-await`) | el **MCP de Odoo NO se usa acá** (es solo para la skill de Claude); credenciales en env vars |

## Vercel vs Cloudflare
Primario: **Vercel** (menos fricción con Next; la app es chica). La DB es **Supabase** en ambos casos (Postgres gestionado, anda desde los dos). Si se va a **Cloudflare**: solo cambia el adaptador → **OpenNext**. El resto no cambia.

## Descartado a propósito (ponytail)
- **Módulo Nómina de Odoo**: no registra asistencia, no imputa a analítica, sin localización AR. Descartado.
- **DB propia para maestros** (obreros/obras): se leen de Odoo, no se duplican.
- **Prisma / microservicios / login propio robusto**: overkill para 1–2 usuarios.
- **OCR de la foto**: el admin carga por formulario de tipeo (sin IA en la carga).

## Pendientes antes de construir
- Definir mecanismo fiscal del documento (factura vs asiento) con el contador.
- Verificar por MCP: obras = analíticas, módulos instalados, cruce obrero↔contacto del pago a cuenta.
- Confirmar granularidad de carga del form (recomendado: **por día**, espeja la tarja).
