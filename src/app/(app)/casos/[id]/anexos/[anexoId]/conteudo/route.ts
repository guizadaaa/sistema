import { requireCurrentUser } from "@/lib/auth/current-user";
import { buscarAnexoHtml, CSP_ANEXO_HTML, lerConteudoAnexoHtml } from "@/lib/casos/anexo-html";

/**
 * HTML do anexo, já limpo, para o <iframe sandbox> do visualizador. Nunca a
 * URL do Storage: lá o arquivo abriria como página com a origem do Storage.
 * CSP com `sandbox` e sem script; quem não vê o caso recebe 404.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; anexoId: string }> }) {
  await requireCurrentUser();
  const { id, anexoId } = await params;

  const anexo = await buscarAnexoHtml(id, anexoId);
  const html = anexo ? await lerConteudoAnexoHtml(anexo) : null;
  if (!html) return new Response("Anexo não encontrado.", { status: 404 });

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": CSP_ANEXO_HTML,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "private, no-store",
    },
  });
}
