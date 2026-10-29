import "server-only";

import { hojeSaoPaulo } from "@/lib/linkly/mes";
import { createClient } from "@/lib/supabase/server";
import type { Database, FilialCvc } from "@/lib/supabase/types";
import { ofertaVencida } from "@/lib/validation/vitrine";

export type CategoriaVitrine = Database["public"]["Tables"]["vitrine_categorias"]["Row"];
export type ArquivoVitrine = Database["public"]["Tables"]["vitrine_arquivos"]["Row"];
export type OfertaVitrine = Database["public"]["Tables"]["vitrine_ofertas"]["Row"] & {
  /** URL assinada do PNG da página (1 h) — só para exibir. */
  imagemUrl: string | null;
  vencida: boolean;
};

export type DadosVitrine = {
  categorias: CategoriaVitrine[];
  arquivos: ArquivoVitrine[];
  ofertas: OfertaVitrine[];
};

const VALIDADE_URL_IMAGEM_S = 60 * 60;

/**
 * Vitrine de uma filial, com a RLS do usuário: vendedor não recebe oferta
 * inativa, vencida nem de categoria inativa; gerente/adm recebem tudo (a tela
 * esmaece). As cópias de "publicar também em" apontam para PNGs da pasta de
 * outra filial — a policy de leitura do bucket segue as vitrines visíveis.
 */
export async function carregarVitrine(filial: FilialCvc): Promise<DadosVitrine> {
  const supabase = await createClient();

  const [categorias, arquivos, ofertas] = await Promise.all([
    supabase.from("vitrine_categorias").select("*").eq("filial", filial).order("ordem").order("nome"),
    supabase.from("vitrine_arquivos").select("*").eq("filial", filial).order("enviado_em", { ascending: false }),
    supabase.from("vitrine_ofertas").select("*").eq("filial", filial).order("ordem").order("criado_em"),
  ]);
  if (categorias.error) throw categorias.error;
  if (arquivos.error) throw arquivos.error;
  if (ofertas.error) throw ofertas.error;

  const caminhos = [...new Set((ofertas.data ?? []).map((o) => o.imagem_path))];
  const urlPorCaminho = new Map<string, string>();
  if (caminhos.length > 0) {
    const { data, error } = await supabase.storage.from("vitrine").createSignedUrls(caminhos, VALIDADE_URL_IMAGEM_S);
    if (error) throw error;
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) urlPorCaminho.set(item.path, item.signedUrl);
    }
  }

  const hoje = hojeSaoPaulo();
  return {
    categorias: categorias.data ?? [],
    arquivos: arquivos.data ?? [],
    ofertas: (ofertas.data ?? []).map((o) => ({
      ...o,
      imagemUrl: urlPorCaminho.get(o.imagem_path) ?? null,
      vencida: ofertaVencida(o.validade, hoje),
    })),
  };
}
