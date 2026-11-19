// Utilitários puros da tela "Base de clientes" (sem server-only: usados no
// navegador e na exportação).

import { isTipoServico } from "./tipos-servico";

/** Chaves aceitas na URL / no filtro salvo (as que base_clientes_buscar usa). */
export const CHAVES_FILTRO = [
  "loja",
  "vendedor",
  "valor_de",
  "valor_ate",
  "total_de",
  "total_ate",
  "futura",
  "camp",
  "ca_tipo",
  "ca_destino",
  "ca_de",
  "ca_ate",
  "ca_sem_tipo",
  "cr_tipo",
  "cr_destino",
  "cr_a_de",
  "cr_a_ate",
  "cr_sem",
  "cr_mesmo_destino",
  "cr_b_de",
  "cr_b_ate",
] as const;

export type ChaveFiltro = (typeof CHAVES_FILTRO)[number];
export type FiltrosBase = Partial<Record<ChaveFiltro, string>>;
export type Campanha = "adicional" | "recompra";

/** Campos da frase de cada campanha (o bloco de baixo é o resto). */
export const CAMPOS_FRASE: Record<Campanha, ChaveFiltro[]> = {
  adicional: ["ca_tipo", "ca_destino", "ca_de", "ca_ate", "ca_sem_tipo"],
  recompra: ["cr_tipo", "cr_destino", "cr_a_de", "cr_a_ate", "cr_sem", "cr_mesmo_destino", "cr_b_de", "cr_b_ate"],
};

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const NUMERO = /^\d+([.,]\d+)?$/;
const CHAVES_DATA = new Set(["embarque_de", "embarque_ate", "compra_de", "compra_ate", "ca_de", "ca_ate", "cr_a_de", "cr_a_ate", "cr_b_de", "cr_b_ate"]);
const CHAVES_NUMERO = new Set(["valor_de", "valor_ate", "total_de", "total_ate"]);
const CHAVES_TIPO = new Set(["tipo", "ca_tipo", "ca_sem_tipo", "cr_tipo"]);

/** Valor válido de uma chave (atual ou antiga) ou undefined. */
function lerValor(chave: string, bruto: string | string[] | undefined): string | undefined {
  const valor = (Array.isArray(bruto) ? bruto[0] : bruto)?.trim();
  if (!valor || valor === "todos" || valor === "todas") return undefined;
  if (CHAVES_DATA.has(chave)) return DATA.test(valor) ? valor : undefined;
  if (CHAVES_NUMERO.has(chave)) return NUMERO.test(valor) ? valor.replace(",", ".") : undefined;
  if (CHAVES_TIPO.has(chave)) return isTipoServico(valor) ? valor : undefined;
  if (chave === "cr_sem") return valor === "nada" || isTipoServico(valor) ? valor : undefined;
  if (chave === "camp") return valor === "adicional" || valor === "recompra" ? valor : undefined;
  if (chave === "cr_escopo") return valor === "nada" || valor === "mesmo" ? valor : undefined;
  if (chave === "futura" || chave === "cr_mesmo_destino") return valor === "1" ? valor : undefined;
  return valor.slice(0, 120);
}

/** "vazia" (base geral), "incompleta" (falta o "não comprou": não busca) ou "completa". */
export function estadoFrase(filtros: FiltrosBase): "vazia" | "incompleta" | "completa" {
  const camp: Campanha = filtros.camp === "recompra" ? "recompra" : "adicional";
  if (!CAMPOS_FRASE[camp].some((c) => filtros[c])) return "vazia";
  return (camp === "adicional" ? filtros.ca_sem_tipo : filtros.cr_sem) ? "completa" : "incompleta";
}

/** "Só com viagem futura" vale com a frase vazia e na Recompra (na Venda adicional preenchida o período já é a viagem). */
export function mostraViagemFutura(filtros: FiltrosBase): boolean {
  return filtros.camp === "recompra" || estadoFrase(filtros) === "vazia";
}

/**
 * Só as chaves conhecidas, com valor válido (o resto é ignorado). Campanha é
 * sempre "adicional" ou "recompra": sem camp (ou com o antigo "Nenhuma", que
 * mandava camp vazio) abre em Venda adicional.
 *
 * Filtros salvos antigos: o que saiu do bloco de baixo vai para a frase
 * quando cabe — destino → destino da frase; tipo → tipo do "Comprou";
 * embarque → período de embarque (Venda adicional); data da compra → 1º
 * período (Recompra); cr_escopo → "não comprou" (nada / mesmo tipo e mesmo
 * destino). O que não cabe é descartado. Frase incompleta (sem "não
 * comprou") abre com a dica e o Filtrar desligado.
 */
export function lerFiltros(params: Record<string, string | string[] | undefined>): FiltrosBase {
  const filtros: FiltrosBase = {};
  for (const chave of CHAVES_FILTRO) {
    const valor = lerValor(chave, params[chave]);
    if (valor) filtros[chave] = valor;
  }
  filtros.camp ??= "adicional";
  const antigo = (chave: string) => lerValor(chave, params[chave]);

  if (filtros.camp === "adicional") {
    filtros.ca_destino ??= antigo("destino");
    filtros.ca_tipo ??= antigo("tipo");
    filtros.ca_de ??= antigo("embarque_de");
    filtros.ca_ate ??= antigo("embarque_ate");
  } else {
    filtros.cr_destino ??= antigo("destino");
    filtros.cr_tipo ??= antigo("tipo");
    filtros.cr_a_de ??= antigo("compra_de");
    filtros.cr_a_ate ??= antigo("compra_ate");
    const escopo = antigo("cr_escopo");
    if (escopo && !filtros.cr_sem && CAMPOS_FRASE.recompra.some((c) => filtros[c])) {
      // "nada daquele tipo/destino" vira "não comprou <o mesmo tipo> para o mesmo destino".
      filtros.cr_sem = escopo === "mesmo" ? (filtros.cr_tipo ?? "nada") : "nada";
      if (escopo === "mesmo") filtros.cr_mesmo_destino = "1";
    }
  }

  // Campos de campanha só valem com a campanha escolhida.
  for (const chave of Object.keys(filtros) as ChaveFiltro[]) {
    if (filtros[chave] === undefined) delete filtros[chave];
    else if (chave.startsWith("ca_") && filtros.camp !== "adicional") delete filtros[chave];
    else if (chave.startsWith("cr_") && filtros.camp !== "recompra") delete filtros[chave];
  }
  if (!mostraViagemFutura(filtros)) delete filtros.futura;
  return filtros;
}

export function filtrosParaQuery(filtros: FiltrosBase, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams();
  for (const [chave, valor] of Object.entries({ ...filtros, ...extra })) if (valor) q.set(chave, valor);
  return q.toString();
}

/** dd/mm/aaaa a partir de aaaa-mm-dd (sem fuso). */
export function dataBr(iso: string | null | undefined): string {
  if (!iso) return "";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

const DIAS_NO_MES = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate();

/** aaaa-mm-dd + n meses, com o dia limitado ao fim do mês (31/01 + 1 = 28/02 ou 29/02). */
function somarMeses(a: number, m: number, d: number, n: number): string {
  const total = m - 1 + n;
  const ano = a + Math.floor(total / 12);
  const mes = (total % 12 + 12) % 12 + 1;
  const dia = Math.min(d, DIAS_NO_MES(ano, mes));
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** aaaa-mm-dd + n meses (dia limitado ao fim do mês). */
export function somarMesesIso(iso: string, n: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  return somarMeses(a, m, d, n);
}

/** aaaa-mm-dd + n dias. */
export function somarDiasIso(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

export type Atalho = { rotulo: string; de: string; ate: string };

/** Venda adicional: embarque de hoje até daqui a 30/60/90 dias ou 6 meses. */
export function atalhosEmbarque(hoje: string): Atalho[] {
  return [
    { rotulo: "próx. 30 dias", de: hoje, ate: somarDiasIso(hoje, 30) },
    { rotulo: "60 dias", de: hoje, ate: somarDiasIso(hoje, 60) },
    { rotulo: "90 dias", de: hoje, ate: somarDiasIso(hoje, 90) },
    { rotulo: "6 meses", de: hoje, ate: somarMesesIso(hoje, 6) },
  ];
}

/**
 * Recompra (1º período, data da compra): "ano passado" = 01/01 a 31/12 do ano
 * anterior; "mesmo período do ano passado" = os 3 meses que começam em hoje
 * há um ano (quem comprou nesta época no ano passado).
 */
export function atalhosRecompra(hoje: string): Atalho[] {
  const ano = Number(hoje.slice(0, 4)) - 1;
  const inicio = somarMesesIso(hoje, -12);
  return [
    { rotulo: "ano passado", de: `${ano}-01-01`, ate: `${ano}-12-31` },
    { rotulo: "mesmo período do ano passado", de: inicio, ate: somarDiasIso(somarMesesIso(inicio, 3), -1) },
  ];
}

/** 2º período padrão da Recompra: do dia seguinte ao fim do 1º até hoje (null se o 1º não terminou antes de hoje). */
export function segundoPeriodo(fimPrimeiro: string | undefined, hoje: string): { de: string; ate: string } | null {
  if (!fimPrimeiro || !DATA.test(fimPrimeiro) || fimPrimeiro >= hoje) return null;
  return { de: somarDiasIso(fimPrimeiro, 1), ate: hoje };
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * Tempo de calendário de `data` até `hoje` (aaaa-mm-dd, hoje de São Paulo):
 * anos e meses completos, depois os dias — "2 anos, 3 meses, 15 dias". Mês
 * completo conta pelo mesmo dia do mês seguinte, limitado ao fim do mês
 * (31/01 → 28/02 = 1 mês). Partes zeradas somem; no mesmo dia, "hoje".
 * Data futura ou inválida: "".
 */
export function tempoDesde(data: string | null | undefined, hoje: string): string {
  if (!data || !DATA.test(data.slice(0, 10)) || !DATA.test(hoje)) return "";
  const [a, m, d] = data.slice(0, 10).split("-").map(Number);
  const [ha, hm] = hoje.split("-").map(Number);
  if (data.slice(0, 10) > hoje) return "";
  let meses = (ha - a) * 12 + (hm - m);
  if (somarMeses(a, m, d, meses) > hoje) meses -= 1;
  const base = somarMeses(a, m, d, meses);
  const dias = Math.round((Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${base}T00:00:00Z`)) / 86_400_000);
  const anos = Math.floor(meses / 12);
  const partes = [
    anos > 0 && plural(anos, "ano", "anos"),
    meses % 12 > 0 && plural(meses % 12, "mês", "meses"),
    dias > 0 && plural(dias, "dia", "dias"),
  ].filter(Boolean);
  return partes.length ? partes.join(", ") : "hoje";
}

/** wa.me: só dígitos, com 55 quando o número for nacional (10–11 dígitos). */
export function linkWhatsapp(numero: string): string | null {
  const digitos = numero.replace(/\D/g, "");
  if (digitos.length < 10) return null;
  return `https://wa.me/${digitos.length <= 11 ? `55${digitos}` : digitos}`;
}

/** Telefone nacional (DDD + número, sem o 55), como o FastZap pede no campo "Telefone". */
export function telefoneNacional(numero: string): string | null {
  let d = numero.replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  return d.length === 10 || d.length === 11 ? d : null;
}

/**
 * Abre o FastZap (CRM de WhatsApp) com o pedido de novo atendimento no "#".
 * A extensão Aura Conferência lê o pedido, abre "Novo Atendimento" e preenche nome, telefone e origem
 * "Loja" — quem clica em "Iniciar" é o vendedor. Sem a extensão, abre só o FastZap.
 */
export function linkFastzap(nome: string, numero: string): string | null {
  const telefone = telefoneNacional(numero);
  if (!telefone) return null;
  const json = JSON.stringify({ nome: nome.trim(), telefone });
  const b64 = typeof btoa === "function"
    ? btoa(unescape(encodeURIComponent(json)))
    : Buffer.from(json, "utf8").toString("base64");
  return `https://gestor.fastzap.chat/chat/#aura-novo=${encodeURIComponent(b64)}`;
}

export type DadosMensagem = { nome: string; destino?: string | null; vendedor?: string | null; data_embarque?: string | null };

/** Troca {nome}, {destino}, {vendedor} e {data_embarque} (dd/mm/aaaa). */
export function montarMensagem(modelo: string, dados: DadosMensagem): string {
  const valores: Record<string, string> = {
    nome: dados.nome,
    destino: dados.destino ?? "",
    vendedor: dados.vendedor ?? "",
    data_embarque: dataBr(dados.data_embarque),
  };
  return modelo.replace(/\{(nome|destino|vendedor|data_embarque)\}/g, (_, chave: string) => valores[chave]);
}

/** CSV para Excel pt-BR: ";" como separador, aspas quando preciso, BOM UTF-8. */
export function montarCsv(cabecalho: string[], linhas: (string | number | null | undefined)[][]): string {
  const celula = (v: string | number | null | undefined) => {
    const texto = v === null || v === undefined ? "" : typeof v === "number" ? String(v).replace(".", ",") : v;
    return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  return "﻿" + [cabecalho, ...linhas].map((l) => l.map(celula).join(";")).join("\r\n") + "\r\n";
}
