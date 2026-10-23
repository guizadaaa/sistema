import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Roda em todas as rotas exceto assets estáticos e a própria API do
     * Next.js, para não gastar ciclo revalidando sessão em requisições que
     * não precisam disso. /api/conferencia/* (extensão Aura Conferência)
     * autentica por Bearer token, sem cookie — o redirect para /login
     * quebraria as chamadas do service worker.
     */
    "/((?!_next/static|_next/image|favicon.ico|api/conferencia|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
