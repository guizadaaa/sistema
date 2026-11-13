import { calcularTiposServico, type FornecedorReserva } from "@/lib/clientes/tipos-servico";

export const LIMITE_RESERVAS_BASE = 200;

type ReservaBase = Record<string, unknown> & {
  excursao?: unknown;
  fornecedores?: unknown;
  descricao_roteiro?: unknown;
  tipo_produto?: unknown;
  tem_voo?: unknown;
};

const texto = (v: unknown) => (typeof v === "string" ? v : null);

/** 1º dígito da excursão ("9.06246325.26092201" -> 9). */
export function categoriaDaExcursao(excursao: unknown): number | null {
  const digito = texto(excursao)?.replace(/\D/g, "").charAt(0);
  return digito ? Number(digito) : null;
}

/** Reserva do bot + tipos_servico calculados (a regra fica em tipos-servico.ts). */
export function comTiposServico(reserva: ReservaBase): ReservaBase & { tipos_servico: string[] } {
  return {
    ...reserva,
    tipos_servico: calcularTiposServico({
      fornecedores: Array.isArray(reserva.fornecedores) ? (reserva.fornecedores as FornecedorReserva[]) : [],
      descricao_roteiro: texto(reserva.descricao_roteiro),
      tipo_produto: texto(reserva.tipo_produto),
      tem_voo: reserva.tem_voo === true,
      categoria_codigo: categoriaDaExcursao(reserva.excursao),
    }),
  };
}

const temConteudo = (v: unknown) =>
  Array.isArray(v) ? v.length > 0 : v !== null && typeof v === "object" ? Object.keys(v).length > 0 : false;

/**
 * Tipos de uma excursão do sync da conferência (menos dados que o bot: sem
 * fornecedores). Gravados só onde a reserva ainda não tem tipos.
 */
export function tiposDaExcursaoSync(excursao: Record<string, unknown>): { reserva: string; tipos: string[] } | null {
  const reserva = texto(excursao.reserva)?.trim();
  if (!reserva) return null;
  return {
    reserva,
    tipos: calcularTiposServico({
      fornecedores: [],
      descricao_roteiro: texto(excursao.descricao),
      tem_voo: temConteudo(excursao.retrato_voos),
      categoria_codigo: categoriaDaExcursao(excursao.excursao),
      tem_apolice: temConteudo(excursao.apolices),
    }),
  };
}
