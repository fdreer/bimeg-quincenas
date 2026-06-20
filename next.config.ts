import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Reusa páginas ya visitadas durante la sesión: al volver, no re-fetchea (sin "Cargando…")
  // por 30 min. Subí el número para cachear más, bajalo para datos más frescos.
  // Las mutaciones (revalidatePath en las actions) refrescan igual la página afectada.
  experimental: {
    staleTimes: { dynamic: 1800 },
  },
};

export default nextConfig;
