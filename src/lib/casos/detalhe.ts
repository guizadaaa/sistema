import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type CasoRow = Database["public"]["Tables"]["casos"]["Row"];
type AnexoRow = Database["public"]["Tables"]["anexos"]["Row"];
type StatusHistoricoComDuracaoRow = Database["public"]["Views"]["status_historico_com_duracao"]["Row"];
type DesfechoVisivelRow = Database["public"]["Views"]["desfechos_visivel"]["Row"];
type ImplicacaoRow = Database["public"]["Tables"]["implicacoes"]["Row"];

export type HistoricoComNome = StatusHistoricoComDuracaoRow & { alteradoPorNome: string };

export type DetalheCaso = {
  caso: CasoRow;
  donoNome: string;
  criadoPorNome: string;
  historico: HistoricoComNome[];
  anexos: AnexoRow[];
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
    { data: desfechos, error: desfechosError },
    { data: implicacao, error: implicacaoError },
  ] = await Promise.all([
    supabase
      .from("status_historico_com_duracao")
      .select("*")
      .eq("caso_id", id)
      .order("entrou_em", { ascending: true }),
    supabase.from("anexos").select("*").eq("caso_id", id).order("enviado_em", { ascending: false }),
    supabase.from("desfechos_visivel").select("*").eq("caso_id", id).order("criado_em", { ascending: false }),
    supabase.from("implicacoes").select("*").eq("caso_id", id).maybeSingle(),
  ]);

  if (historicoError) throw historicoError;
  if (anexosError) throw anexosError;
  if (desfechosError) throw desfechosError;
  if (implicacaoError) throw implicacaoError;

  const idsParaNome = [
    ...new Set([caso.vendedor_dono, caso.criado_por, ...(historico ?? []).map((h) => h.alterado_por)]),
  ];
  const { data: usuarios, error: usuariosError } = await supabase
    .from("usuarios")
    .select("id, nome_completo")
    .in("id", idsParaNome);
  if (usuariosError) throw usuariosError;

  const nomesPorId = new Map((usuarios ?? []).map((u) => [u.id, u.nome_completo]));

  return {
    caso,
    donoNome: nomesPorId.get(caso.vendedor_dono) ?? "—",
    criadoPorNome: nomesPorId.get(caso.criado_por) ?? "—",
    historico: (historico ?? []).map((h) => ({ ...h, alteradoPorNome: nomesPorId.get(h.alterado_por) ?? "—" })),
    anexos: anexos ?? [],
    desfechos: desfechos ?? [],
    implicacao: implicacao ?? null,
  };
}
