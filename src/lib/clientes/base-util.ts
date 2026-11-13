// Utilitários puros da tela "Base de clientes" (sem server-only: usados no
// navegador e na exportação).

import { isTipoServico } from "./tipos-servico";

/** Chaves aceitas na URL / no filtro salvo (mesmas de base_clientes_buscar). */
export const CHAVES_FILTRO = [
  "loja",
  "vendedor",
  "destino",
  "tipo",
  "valor_de",
  "valor_ate",
  "total_de",
  "total_ate",
  "embarque_de",
  "embarque_ate",
  "compra_de",
  "compra_ate",
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
  "cr_b_de",
  "cr_b_ate",
  "cr_escopo",
] as const;

export type FiltrosBase = Partial<Record<(typeof CHAVES_FILTRO)[number], string>>;

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const NUMERO = /^\d+([.,]\d+)?$/;
const CHAVES_DATA = new Set(["embarque_de", "embarque_ate", "compra_de", "compra_ate", "ca_de", "ca_ate", "cr_a_de", "cr_a_ate", "cr_b_de", "cr_b_ate"]);
const CHAVES_NUMERO = new Set(["valor_de", "valor_ate", "total_de", "total_ate"]);
const CHAVES_TIPO = new Set(["tipo", "ca_tipo", "ca_sem_tipo", "cr_tipo"]);

/** Só as chaves conhecidas, com valor válido (o resto é ignorado). */
export function lerFiltros(params: Record<string, string | string[] | undefined>): FiltrosBase {
  const filtros: FiltrosBase = {};
  for (const chave of CHAVES_FILTRO) {
    const bruto = params[chave];
    const valor = (Array.isArray(bruto) ? bruto[0] : bruto)?.trim();
    if (!valor || valor === "todos" || valor === "todas") continue;
    if (CHAVES_DATA.has(chave) && !DATA.test(valor)) continue;
    if (CHAVES_NUMERO.has(chave)) {
      if (!NUMERO.test(valor)) continue;
      filtros[chave] = valor.replace(",", ".");
      continue;
    }
    if (CHAVES_TIPO.has(chave) && !isTipoServico(valor)) continue;
    if (chave === "camp" && valor !== "adicional" && valor !== "recompra") continue;
    if (chave === "cr_escopo" && valor !== "nada" && valor !== "mesmo") continue;
    if (chave === "futura" && valor !== "1") continue;
    filtros[chave] = valor.slice(0, 120);
  }
  // Campos de campanha só valem com a campanha escolhida.
  for (const chave of Object.keys(filtros) as (keyof FiltrosBase)[]) {
    if (chave.startsWith("ca_") && filtros.camp !== "adicional") delete filtros[chave];
    if (chave.startsWith("cr_") && filtros.camp !== "recompra") delete filtros[chave];
  }
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

/** wa.me: só dígitos, com 55 quando o número for nacional (10–11 dígitos). */
export function linkWhatsapp(numero: string): string | null {
  const digitos = numero.replace(/\D/g, "");
  if (digitos.length < 10) return null;
  return `https://wa.me/${digitos.length <= 11 ? `55${digitos}` : digitos}`;
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
