// Tipo de serviço de uma reserva — a regra fica TODA aqui (sem imports, só
// sintaxe que o Node remove sozinho): a API grava o resultado em
// cliente_excursoes.tipos_servico ao receber os dados, e
// `npm run recalcular-tipos` reaplica em toda a base quando a regra mudar.

/**
 * Termos de TRANSFER no serviço do receptivo (sem acento, maiúsculas). Lista
 * única para completar depois: qualquer um deles marca transfer.
 */
export const TERMOS_TRANSFER = [
  "TRANSFER",
  "TRASLADO",
  "IN E OUT",
  "IN/OUT",
  "CHEGADA E SAIDA",
  "TRANSPORTE COMPARTILHADO",
  "TRANSPORTE PRIVATIVO",
  "TRANSPORTE INDIVIDUAL",
  "TRANSPORTE REGULAR",
];

/** "AEROPORTO" junto com "HOTEL" no serviço também é transfer. */
export const TERMOS_TRANSFER_PAR: [string, string][] = [["AEROPORTO", "HOTEL"]];

/** Transfer individual (comum em pacote exclusivo): um destes + TRANSPORTE/TRANSFER/TRASLADO. */
export const TERMOS_TRANSFER_INDIVIDUAL = ["PRIVATIVO", "INDIVIDUAL", "EXCLUSIVO"];
const TERMOS_TRANSPORTE = ["TRANSPORTE", "TRANSFER", "TRASLADO"];

/** Categoria aérea (o grupo "Transporte Aéreo" nunca vira transfer). */
const TERMOS_AEREO = ["AERE", "VOO", "PASSAGEM"];

export const TIPOS_SERVICO = ["aereo", "hotel", "ingresso", "passeio", "transfer", "seguro", "cruzeiro", "carro"] as const;
export type TipoServico = (typeof TIPOS_SERVICO)[number];

export const TIPO_SERVICO_LABELS: Record<TipoServico, string> = {
  aereo: "Aéreo",
  hotel: "Hotel",
  ingresso: "Ingresso",
  passeio: "Passeio",
  transfer: "Transfer",
  seguro: "Seguro",
  cruzeiro: "Cruzeiro",
  carro: "Carro",
};

/** Mesmo formato de FornecedorReserva em @/lib/supabase/types (aqui sem import, para o script rodar no Node). */
export type FornecedorReserva = {
  categoria?: string | null;
  receptivo?: string | null;
  cidade?: string | null;
  servico?: string | null;
  data_inicial?: string | null;
  data_final?: string | null;
  acordo?: string | null;
};

export type DadosTipoServico = {
  fornecedores?: FornecedorReserva[] | null;
  descricao_roteiro?: string | null;
  tipo_produto?: string | null;
  tem_voo?: boolean | null;
  /** 1º dígito da excursão (ex.: "9.06246325.26092201" -> 9). */
  categoria_codigo?: number | null;
  /** Reserva com apólice de seguro (dados da conferência). */
  tem_apolice?: boolean | null;
};

/** Maiúsculas, sem acento, espaços simples. */
function normalizar(texto: string | null | undefined): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

const contem = (texto: string, termos: string[]) => termos.some((t) => texto.includes(t));

/**
 * Transfer: categoria de TRANSPORTE que não é aérea (ex.: "TRANSPORTES
 * COMPARTILHADOS") ou serviço com algum termo de TERMOS_TRANSFER, "AEROPORTO"
 * + "HOTEL", ou transfer individual (PRIVATIVO/INDIVIDUAL/EXCLUSIVO +
 * TRANSPORTE/TRANSFER/TRASLADO). Quem chama já descartou categoria aérea.
 */
function ehTransfer(categoria: string, servico: string): boolean {
  if (contem(categoria, ["TRANSPORTE", "TRANSFER", "TRASLADO"])) return true;
  if (contem(servico, TERMOS_TRANSFER)) return true;
  if (TERMOS_TRANSFER_PAR.some(([a, b]) => servico.includes(a) && servico.includes(b))) return true;
  return contem(servico, TERMOS_TRANSFER_INDIVIDUAL) && contem(servico, TERMOS_TRANSPORTE);
}

/** "DISNEY - PARIS - 1 Dias 0 Noites" -> 0; "... 7 NOITES" -> 7; sem menção -> null. */
export function noitesDaDescricao(descricao: string | null | undefined): number | null {
  const m = normalizar(descricao).match(/(\d+)\s*NOITES?\b/);
  return m ? Number(m[1]) : null;
}

/**
 * Lista de tipos (na ordem de TIPOS_SERVICO, sem repetição).
 *
 * categoria_codigo 5/9/3 (aéreo) só vale quando a reserva não traz
 * fornecedores: a excursão "9.xxx" do ingresso da Disneyland Paris tem
 * fornecedor ATIVIDADE e nenhum voo, e é só ["ingresso"].
 */
export function calcularTiposServico(dados: DadosTipoServico): TipoServico[] {
  const tipos = new Set<TipoServico>();
  const fornecedores = (dados.fornecedores ?? []).filter(Boolean);

  for (const f of fornecedores) {
    const categoria = normalizar(f.categoria);
    const servico = normalizar(f.servico);
    const receptivo = normalizar(f.receptivo);

    const aereo = contem(categoria, TERMOS_AEREO);
    if (aereo) tipos.add("aereo");
    if (contem(categoria, ["HOTEL", "HOSPEDAGEM"])) tipos.add("hotel");

    const ingresso = contem(servico, ["INGRESSO", "PARQUE"]);
    if (ingresso) tipos.add("ingresso");
    if (!ingresso && (contem(categoria, ["ATIVIDADE", "PASSEIO"]) || contem(servico, ["PASSEIO", "TOUR"]))) {
      tipos.add("passeio");
    }

    // Um mesmo receptivo pode dar transfer + passeio ("In e Out ... + City Tour").
    if (!aereo && ehTransfer(categoria, servico)) tipos.add("transfer");
    if (contem(categoria, ["SEGURO"])) tipos.add("seguro");
    if (contem(categoria, ["CRUZEIRO"]) || contem(receptivo, ["CRUZEIRO"]) || contem(servico, ["CRUZEIRO"])) {
      tipos.add("cruzeiro");
    }
    if (contem(categoria, ["LOCACAO", "LOCADORA", "CARRO"]) || contem(servico, ["LOCACAO", "ALUGUEL DE CARRO"])) {
      tipos.add("carro");
    }
  }

  if (dados.tem_voo) tipos.add("aereo");
  if (fornecedores.length === 0 && [3, 5, 9].includes(dados.categoria_codigo ?? -1)) tipos.add("aereo");

  const noites = noitesDaDescricao(dados.descricao_roteiro);
  if (noites !== null && noites > 0) tipos.add("hotel");

  if (dados.tem_apolice) tipos.add("seguro");
  if (dados.categoria_codigo === 8) tipos.add("cruzeiro");

  return TIPOS_SERVICO.filter((t) => tipos.has(t));
}

export function isTipoServico(valor: string): valor is TipoServico {
  return (TIPOS_SERVICO as readonly string[]).includes(valor);
}
