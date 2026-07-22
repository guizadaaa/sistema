import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // O pacote "server-only" lança erro fora do build do Next (que o
      // substitui por um no-op via resolve condition própria) — sem isso,
      // todo módulo de src/lib que faz `import "server-only"` quebraria a
      // simples importação em teste, mesmo sem tocar em nada server-side de
      // verdade.
      "server-only": path.resolve(__dirname, "./vitest.server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
  },
});
