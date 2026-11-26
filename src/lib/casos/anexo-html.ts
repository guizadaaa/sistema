import "server-only";

import { ehNomeHtml } from "@/lib/casos/anexo-tipo";
import { decodificarHtml, limparHtmlAnexo } from "@/lib/casos/html-anexo";
import { createClient } from "@/lib/supabase/server";

/**
 * CSP do conteúdo de anexo HTML: nada roda e nada externo carrega além de
 * imagens; `sandbox` (sem allow-scripts / allow-same-origin) vale mesmo se
 * alguém abrir a rota do conteúdo direto, fora do iframe.
 */
export const CSP_ANEXO_HTML = "default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; sandbox";

export type AnexoHtmlMeta = { id: string; casoId: string; nome: string; storagePath: string };

/** Metadados do anexo HTML do caso — RLS de anexos (= quem vê o caso). null se não existe/não vê/não é HTML. */
export async function buscarAnexoHtml(casoId: string, anexoId: string): Promise<AnexoHtmlMeta | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("anexos")
    .select("id, caso_id, nome_arquivo, storage_path")
    .eq("id", anexoId)
    .eq("caso_id", casoId)
    .maybeSingle();
  if (error) throw error;
  if (!data || !ehNomeHtml(data.nome_arquivo)) return null;
  return { id: data.id, casoId: data.caso_id, nome: data.nome_arquivo, storagePath: data.storage_path };
}

/**
 * Conteúdo para o visualizador: registra o acesso (log_anexo_signed_url —
 * mesma auditoria e checagem de visibilidade do "Baixar"), baixa do Storage
 * (RLS do bucket) e limpa de novo (defesa em profundidade: vale também para
 * arquivo gravado por outro caminho).
 */
export async function lerConteudoAnexoHtml(anexo: AnexoHtmlMeta): Promise<string | null> {
  const supabase = await createClient();
  const { error: logError } = await supabase.rpc("log_anexo_signed_url", { p_anexo_id: anexo.id });
  if (logError) return null;

  const { data, error } = await supabase.storage.from("anexos").download(anexo.storagePath);
  if (error || !data) {
    console.error("Erro ao baixar anexo HTML:", error);
    return null;
  }
  return limparHtmlAnexo(decodificarHtml(new Uint8Array(await data.arrayBuffer())));
}
