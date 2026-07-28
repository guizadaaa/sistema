// Lógica pura de parsing/correspondência da API do Linkly — isolada em
// arquivo próprio (sem `fetch`, sem `Deno.*`, sem import "jsr:...") pra poder
// ser testada com vitest a partir do Node normal, igual a qualquer módulo de
// src/lib. index.ts importa este arquivo pra fazer o trabalho de rede.
//
// Campos confirmados contra uma resposta REAL da API (28/07, workspace 1710
// da CVC) — ver matching.test.ts, que usa essa mesma resposta como fixture:
//   - Contagem de cliques: "clicks_total" (não "clicks"/"click_count"/etc.,
//     que eram só suposições da documentação pública).
//   - Identificador único do link: "id" (numérico).
//   - URL curta completa: "full_url" (ex.: "https://linkly.link/2nlqB") — o
//     campo "slug" existe mas vem sempre null nesta conta, e o campo "url"
//     é o DESTINO do link (ex.: o grupo de WhatsApp), não a URL curta do
//     Linkly — usar "url" pra correspondência seria um bug silencioso.

export type LinkDaApi = Record<string, unknown>;

export function extrairWorkspaceId(payload: unknown): string | null {
  const lista = Array.isArray(payload) ? payload : (payload as { workspaces?: unknown[] })?.workspaces;
  if (!Array.isArray(lista) || lista.length === 0) return null;
  const primeiro = lista[0] as Record<string, unknown>;
  const candidato = primeiro.id ?? primeiro.workspace_id;
  return candidato != null ? String(candidato) : null;
}

export function extrairLista(payload: unknown): LinkDaApi[] {
  if (Array.isArray(payload)) return payload as LinkDaApi[];
  const links = (payload as { links?: unknown[] })?.links;
  return Array.isArray(links) ? (links as LinkDaApi[]) : [];
}

function idDoLink(link: LinkDaApi): string | null {
  const candidato = link.id ?? link.link_id;
  return candidato != null ? String(candidato) : null;
}

function normalizarUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

function urlDoLinkApi(link: LinkDaApi): string | null {
  const valor = link.full_url;
  return typeof valor === "string" ? normalizarUrl(valor) : null;
}

/**
 * Casa um link cadastrado (linkly_link_id/short_url) contra a lista de links
 * retornada pela API — por id primeiro (quando o Adm Master soube informar o
 * identificador exato do Linkly), com fallback pra URL curta completa
 * normalizada (o que qualquer Adm Master cadastra com confiança, mesmo sem
 * saber o id interno).
 */
export function encontrarLinkCorrespondente(linksDaApi: LinkDaApi[], linklyLinkId: string, shortUrl: string): LinkDaApi | null {
  const porId = new Map(
    linksDaApi.map((l) => [idDoLink(l), l] as const).filter((par): par is [string, LinkDaApi] => par[0] !== null)
  );
  const porUrl = new Map(
    linksDaApi.map((l) => [urlDoLinkApi(l), l] as const).filter((par): par is [string, LinkDaApi] => par[0] !== null)
  );
  return porId.get(linklyLinkId) ?? porUrl.get(normalizarUrl(shortUrl)) ?? null;
}

export function extrairContagemDeCliques(link: LinkDaApi): number | null {
  // "clicks_total" é o campo real confirmado — os demais ficam só como
  // fallback defensivo caso a API mude no futuro.
  for (const campo of ["clicks_total", "clicks", "click_count", "total_clicks", "visits"]) {
    const valor = link[campo];
    if (typeof valor === "number") return valor;
    if (typeof valor === "string" && /^\d+$/.test(valor)) return Number(valor);
  }
  return null;
}
