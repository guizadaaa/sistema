import "server-only";

import { carregarNomesUsuariosCasos } from "@/lib/casos/nomes";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type CasoRow = Database["public"]["Tables"]["casos"]["Row"];
type AnexoRow = Database["public"]["Tables"]["anexos"]["Row"];
type ContratoAdicionalRow = Database["public"]["Tables"]["casos_contratos_adicionais"]["Row"];
type ComplementoRow = Database["public"]["Tables"]["casos_complementos"]["Row"];
type StatusHistoricoComDuracaoRow = Database["public"]["Views"]["status_historico_com_duracao"]["Row"];
export type DesfechoVisivelRow = Database["public"]["Views"]["desfechos_visivel"]["Row"];
type ImplicacaoRow = Database["public"]["Tables"]["implicacoes"]["Row"];

export type HistoricoComNome = StatusHistoricoComDuracaoRow & { alteradoPorNome: string };
export type ComplementoComNome = ComplementoRow & { criadoPorNome: string };

export type ImagemDescricao = { id: string; nome: string; url: string };

export type DetalheCaso = {
  caso: CasoRow;
  /** Imagens coladas na Descrição ao criar o caso (anexos tipo imagem_descricao), com signed URL curta. */
  imagensDescricao: ImagemDescricao[];
  donoNome: string;
  criadoPorNome: string;
  historico: HistoricoComNome[];
  anexos: AnexoRow[];
  contratosAdicionais: ContratoAdicionalRow[];
  complementos: ComplementoComNome[];
  desfechos: DesfechoVisivelRow[];
  implicacao: ImplicacaoRow | null;
};

/**
 * Retorna null quando o caso não existe OU quando o usuário atual não tem
 * RLS para vê-lo — os dois casos são indistinguíveis de propósito (RLS
 * simplesmente filtra a linha), e a página trata ambos como 404 em vez de
 * vazar se o id existe para quem não deveria saber disso (evita IDOR por
 * enumeração de ids).
 */
export async function buscarDetalheCaso(id: string): Promise<DetalheCaso | null> {
  const supabase = await createClient();

  const { data: caso, error: casoError } = await supabase.from("casos").select("*").eq("id", id).maybeSingle();

  if (casoError) throw casoError;
  if (!caso) return null;

  const [
    { data: historico, error: historicoError },
    { data: anexos, error: anexosError },
    { data: contratosAdicionais, error: contratosAdicionaisError },
    { data: complementos, error: complementosError },
    { data: desfechos, error: desfechosError },
    { data: implicacao, error: implicacaoError },
  ] = await Promise.all([
    supabase
      .from("status_historico_com_duracao")
      .select("*")
      .eq("caso_id", id)
      .order("entrou_em", { ascending: true }),
    supabase.from("anexos").select("*").eq("caso_id", id).order("enviado_em", { ascending: false }),
    supabase
      .from("casos_contratos_adicionais")
      .select("*")
      .eq("caso_id", id)
      .order("criado_em", { ascending: true }),
    supabase.from("casos_complementos").select("*").eq("caso_id", id).order("criado_em", { ascending: true }),
    supabase.from("desfechos_visivel").select("*").eq("caso_id", id).order("criado_em", { ascending: false }),
    supabase.from("implicacoes").select("*").eq("caso_id", id).maybeSingle(),
  ]);

  if (historicoError) throw historicoError;
  if (anexosError) throw anexosError;
  if (contratosAdicionaisError) throw contratosAdicionaisError;
  if (complementosError) throw complementosError;
  if (desfechosError) throw desfechosError;
  if (implicacaoError) throw implicacaoError;

  const nomesPorId = await carregarNomesUsuariosCasos(supabase, [caso.id]);

  // imagem_descricao é anexo só por herança de RLS/Storage/retenção — na tela
  // vai abaixo da Descrição, nunca na lista de Anexos. Purgada por retenção
  // (storage_path nulo) simplesmente some.
  const todosAnexos = anexos ?? [];
  const anexosDocumentos = todosAnexos.filter((a) => a.tipo_documento !== "imagem_descricao");
  const imagensDescricao = await gerarUrlsImagensDescricao(
    supabase,
    todosAnexos.filter((a) => a.tipo_documento === "imagem_descricao" && a.storage_path)
  );

  return {
    caso,
    imagensDescricao,
    donoNome: nomesPorId.get(caso.vendedor_dono) ?? "—",
    criadoPorNome: nomesPorId.get(caso.criado_por) ?? "—",
    historico: (historico ?? []).map((h) => ({ ...h, alteradoPorNome: nomesPorId.get(h.alterado_por) ?? "—" })),
    anexos: anexosDocumentos,
    contratosAdicionais: contratosAdicionais ?? [],
    complementos: (complementos ?? []).map((c) => ({ ...c, criadoPorNome: nomesPorId.get(c.criado_por) ?? "—" })),
    desfechos: desfechos ?? [],
    implicacao: implicacao ?? null,
  };
}

// Mesmo prazo curto de gerarUrlAssinadaAnexo, com folga para a página ficar aberta.
const VALIDADE_URL_IMAGEM_SEGUNDOS = 600;

async function gerarUrlsImagensDescricao(
  supabase: Awaited<ReturnType<typeof createClient>>,
  imagens: AnexoRow[]
): Promise<ImagemDescricao[]> {
  if (imagens.length === 0) return [];

  const caminhos = imagens.map((i) => i.storage_path as string);
  const { data, error } = await supabase.storage
    .from("anexos")
    .createSignedUrls(caminhos, VALIDADE_URL_IMAGEM_SEGUNDOS);
  if (error) {
    // Imagem é complemento visual — falha aqui não derruba a tela do caso.
    console.error("Erro ao gerar signed URLs das imagens da descrição:", error);
    return [];
  }

  const urlPorCaminho = new Map((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
  return imagens.flatMap((i) => {
    const url = urlPorCaminho.get(i.storage_path as string);
    return url ? [{ id: i.id, nome: i.nome_arquivo ?? "imagem", url }] : [];
  });
}
