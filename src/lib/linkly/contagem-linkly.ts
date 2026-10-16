// Lógica pura da tela "Definir base do mês" (/cliques/base) — sem fetch,
// testável com vitest.
//
// Formato ESPERADO de /api/v1/workspace/{id}/clicks/counters/link_id, segundo
// a documentação (via espelhos de terceiros — o OpenAPI oficial não pôde ser
// consultado deste ambiente):
//   { "total": 123, "values": [ { "value": <link_id>, "count": <cliques> }, ... ] }
// NÃO confirmado contra uma resposta real (em julho os nomes tirados da
// documentação estavam errados). Por isso nada aqui adivinha campos: se a
// resposta não tiver exatamente esse formato, extrairContagensPorLink devolve
// null e a tela mostra o trecho bruto para ajuste com base na resposta real.

export const LINKLY_API_BASE = "https://app.linklyhq.com/api/v1";

/** Uma requisição por workspace: contadores agrupados por link_id no intervalo. */
export function urlContadoresPorLink(workspaceId: string, apiKey: string, inicio: string, fim: string): string {
  const params = new URLSearchParams({ api_key: apiKey, start: inicio, end: fim, timezone: "America/Sao_Paulo" });
  return `${LINKLY_API_BASE}/workspace/${encodeURIComponent(workspaceId)}/clicks/counters/link_id?${params.toString()}`;
}

/** Map link_id (como texto) -> cliques, ou null se o formato não for reconhecido. */
export function extrairContagensPorLink(payload: unknown): Map<string, number> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const values = (payload as { values?: unknown }).values;
  if (!Array.isArray(values)) return null;

  const contagens = new Map<string, number>();
  for (const item of values) {
    if (!item || typeof item !== "object") return null;
    const { value, count } = item as { value?: unknown; count?: unknown };
    if ((typeof value !== "string" && typeof value !== "number") || typeof count !== "number" || !Number.isInteger(count) || count < 0) {
      return null;
    }
    contagens.set(String(value), count);
  }
  return contagens;
}

/** Trecho da resposta para diagnóstico: sem a API key e com tamanho limitado. */
export function trechoBrutoSeguro(texto: string, apiKey: string, limite = 1500): string {
  const semChave = apiKey ? texto.split(apiKey).join("***") : texto;
  return semChave.length > limite ? `${semChave.slice(0, limite)}… (truncado)` : semChave;
}

export type PreviaBase =
  | { ok: true; base: number }
  | { ok: false; motivo: string };

/** Mesma regra de linkly_definir_base_mes: 0 <= cliques <= total atual. */
export function calcularPreviaBase(totalAtual: number | null, cliquesNoMes: number | null): PreviaBase {
  if (totalAtual === null) return { ok: false, motivo: "Link sem total sincronizado." };
  if (cliquesNoMes === null || Number.isNaN(cliquesNoMes)) return { ok: false, motivo: "Informe os cliques do mês." };
  if (!Number.isInteger(cliquesNoMes) || cliquesNoMes < 0) return { ok: false, motivo: "Valor inválido." };
  if (cliquesNoMes > totalAtual) {
    return { ok: false, motivo: `Maior que o total atual (${totalAtual}) — confira o número (a contagem do Linkly pode estar defasada).` };
  }
  return { ok: true, base: totalAtual - cliquesNoMes };
}
