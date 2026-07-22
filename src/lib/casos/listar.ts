import "server-only";

import { createClient } from "@/lib/supabase/server";
import { somenteDigitos } from "@/lib/validation/cpf";
import type { FilialCvc, StatusCaso, TipoCaso } from "@/lib/supabase/types";

export type FiltrosCasos = {
  status?: StatusCaso;
  tipo?: TipoCaso;
  busca?: string;
  filial?: FilialCvc;
  /** CPF do cliente — aceita com ou sem máscara, comparado só pelos dígitos (match exato). */
  cpf?: string;
  /** Número de contrato — aceita com ou sem máscara; casa o contrato principal ou qualquer adicional. */
  contrato?: string;
  /** Data de abertura (criado_em), formato yyyy-mm-dd, inclusive nas duas pontas. */
  dataInicio?: string;
  dataFim?: string;
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

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

const DATA_FORMATO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * ids de casos cujo contrato adicional (tabela filha, não dá pra filtrar
 * via a mesma query de `casos`) bate com o termo — RLS de
 * casos_contratos_adicionais espelha a de casos, então só volta caso_id que
 * este usuário já pode ver.
 */
async function idsCasosPorContratoAdicional(supabase: SupabaseClient, termo: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("casos_contratos_adicionais")
    .select("caso_id")
    .ilike("contrato_numero", `%${termo}%`);
  if (error) throw error;
  return [...new Set((data ?? []).map((c) => c.caso_id))];
}

/**
 * ids de casos cujo contrato (principal ou adicional) bate com o termo
 * (já só dígitos). Reaproveitado pelo filtro dedicado "Contrato" e pela
 * busca geral.
 */
async function idsCasosPorContrato(supabase: SupabaseClient, termoDigitos: string): Promise<string[]> {
  const ids = new Set<string>();

  const { data: porPrincipal, error: porPrincipalError } = await supabase
    .from("casos")
    .select("id")
    .ilike("contrato_numero", `%${termoDigitos}%`);
  if (porPrincipalError) throw porPrincipalError;
  for (const c of porPrincipal ?? []) ids.add(c.id);

  for (const id of await idsCasosPorContratoAdicional(supabase, termoDigitos)) ids.add(id);

  return [...ids];
}

/**
 * ids de casos que batem com a busca geral (cliente, contrato ou
 * protocolo). Implementado como várias queries de coluna única (nunca
 * `.or()` com o termo bruto interpolado) — cada `.ilike()`/`.eq()` do
 * supabase-js escapa o valor sozinho; a fragilidade só existia na sintaxe
 * combinada de `.or()`, que tratava vírgula/parênteses no termo digitado
 * como separador/agrupador de condições (bug B1 da auditoria de 22/07: um
 * nome de cliente com parênteses quebrava a query).
 */
async function idsCasosPorBusca(supabase: SupabaseClient, termoBruto: string): Promise<string[]> {
  const termo = termoBruto.trim();
  if (!termo) return [];

  const ids = new Set<string>();

  const { data: porNome, error: porNomeError } = await supabase
    .from("casos")
    .select("id")
    .ilike("cliente_nome", `%${termo}%`);
  if (porNomeError) throw porNomeError;
  for (const c of porNome ?? []) ids.add(c.id);

  for (const id of await idsCasosPorContrato(supabase, termo)) ids.add(id);

  if (/^\d+$/.test(termo)) {
    const { data: porProtocolo, error: porProtocoloError } = await supabase
      .from("casos")
      .select("id")
      .eq("protocolo", Number(termo));
    if (porProtocoloError) throw porProtocoloError;
    for (const c of porProtocolo ?? []) ids.add(c.id);
  }

  return [...ids];
}

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

  if (filtros.cpf) {
    const cpfDigitos = somenteDigitos(filtros.cpf);
    if (cpfDigitos) query = query.eq("cliente_cpf", cpfDigitos);
  }

  if (filtros.dataInicio && DATA_FORMATO.test(filtros.dataInicio)) {
    query = query.gte("criado_em", `${filtros.dataInicio}T00:00:00`);
  }
  if (filtros.dataFim && DATA_FORMATO.test(filtros.dataFim)) {
    query = query.lte("criado_em", `${filtros.dataFim}T23:59:59.999`);
  }

  // busca (nome/contrato/protocolo) e contrato (dedicado) são filtros
  // independentes baseados em ids pré-calculados — combinados por
  // interseção em JS, nunca por dois `.in("id", ...)` empilhados na mesma
  // query (ambíguo pra AND na mesma coluna).
  let idsPermitidos: string[] | undefined;
  const intersecta = (novo: string[]) => {
    idsPermitidos = idsPermitidos === undefined ? novo : idsPermitidos.filter((id) => novo.includes(id));
  };

  if (filtros.busca?.trim()) {
    intersecta(await idsCasosPorBusca(supabase, filtros.busca));
  }

  if (filtros.contrato) {
    const contratoDigitos = somenteDigitos(filtros.contrato);
    if (contratoDigitos) {
      intersecta(await idsCasosPorContrato(supabase, contratoDigitos));
    }
  }

  if (idsPermitidos !== undefined) {
    if (idsPermitidos.length === 0) return [];
    query = query.in("id", idsPermitidos);
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
