import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Roda só nas páginas e rotas que dependem da sessão por cookie. Fica de
     * fora (cada execução chama supabase.auth.getUser(), que é rede + CPU):
     *   - _next/* (chunks, CSS, imagens e dados do Next);
     *   - arquivos estáticos (ícones, imagens, fontes, mapas, robots...);
     *   - /api/conferencia/* — extensão Aura Conferência, autentica por
     *     Bearer token, sem cookie (o redirect para /login quebraria o
     *     service worker);
     *   - /api/saude — health check do Render, sem sessão.
     */
    "/((?!_next/|api/conferencia(?:/|$)|api/saude(?:/|$)|favicon\\.ico$|robots\\.txt$|sitemap\\.xml$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|woff2?|ttf)$).*)",
  ],
};
