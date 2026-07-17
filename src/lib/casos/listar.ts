import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { FilialCvc, StatusCaso, TipoCaso } from "@/lib/supabase/types";

export type FiltrosCasos = {
  status?: StatusCaso;
  tipo?: TipoCaso;
  busca?: string;
  filial?: FilialCvc;
};

export type CasoListado = {
  id: string;
  protocolo: number;
  tipo_caso: TipoCaso;
  cliente_nome: string;
  status_atual: StatusCaso;
  prazo_vigencia: string;
  filial: FilialCvc;
  criado_em: string;
  vendedor_dono: string;
  donoNome: string;
};

/**
 * RLS já escopa as linhas por perfil (vendedor só vê as próprias, gerente só
 * da filial, admin vê tudo) — os filtros aqui são só refinamento em cima do
 * que o usuário já pode ver, nunca uma checagem de segurança adicional.
 */
export async function listarCasos(filtros: FiltrosCasos): Promise<CasoListado[]> {
  const supabase = await createClient();

  let query = supabase
    .from("casos")
    .select("id, protocolo, tipo_caso, cliente_nome, status_atual, prazo_vigencia, filial, criado_em, vendedor_dono, contrato_numero")
    .order("criado_em", { ascending: false });

  if (filtros.status) query = query.eq("status_atual", filtros.status);
  if (filtros.tipo) query = query.eq("tipo_caso", filtros.tipo);
  if (filtros.filial) query = query.eq("filial", filtros.filial);
  if (filtros.busca) {
    const termo = filtros.busca.trim();
    if (termo) {
      const termoEscapado = termo.replace(/[%,]/g, "");
      query = query.or(
        `cliente_nome.ilike.%${termoEscapado}%,contrato_numero.ilike.%${termoEscapado}%,protocolo.eq.${
          /^\d+$/.test(termoEscapado) ? termoEscapado : "-1"
        }`
      );
    }
  }

  const { data: casos, error } = await query;
  if (error) throw error;
  if (!casos || casos.length === 0) return [];

  const donoIds = [...new Set(casos.map((c) => c.vendedor_dono))];
  const { data: donos, error: donosError } = await supabase
    .from("usuarios")
    .select("id, nome_completo")
    .in("id", donoIds);
  if (donosError) throw donosError;

  const nomesPorId = new Map((donos ?? []).map((d) => [d.id, d.nome_completo]));

  return casos.map((c) => ({
    ...c,
    donoNome: nomesPorId.get(c.vendedor_dono) ?? "—",
  }));
}
