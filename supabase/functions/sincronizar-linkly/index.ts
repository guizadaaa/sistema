// Sincronização de cliques do Linkly (item de divulgação/vendedor, 28/07):
// lê linkly_links, agrupa por workspace (workspace_secret = nome do secret no
// Vault com a API key daquele workspace/conta Linkly) e atualiza
// linkly_cliques_totais com o total de cliques atual de cada link.
//
// Disparada por pg_cron via a procedure disparar_sincronizacao_linkly()
// (net.http_post) OU diretamente pelo botão "Atualizar agora" (Adm/Adm
// Master), que chama esta função via supabase-js .functions.invoke() com a
// service_role_key já disponível no servidor Next.js — ver
// src/lib/linkly/sincronizar.ts. Nunca chamada pelo browser.
//
// AVISO IMPORTANTE (deixado deliberadamente explícito): o formato exato da
// API do Linkly usado aqui (buscarWorkspaceId/buscarLinks/
// extrairContagemDeCliques) foi montado a partir da documentação pública
// (linklyhq.com/support/api, /support/analytics-api,
// /url-shortener-api-reference), sem acesso a uma conta/API key real pra
// testar — o sandbox de desenvolvimento não tem acesso de rede a
// linklyhq.com. Cada função abaixo foi isolada e comentada exatamente pra
// ficar fácil de ajustar assim que o primeiro teste com uma chave real
// mostrar o formato de resposta verdadeiro. Rode manualmente uma vez (ver
// supabase/linkly/ATIVACAO.md) e confira o campo `erros` do retorno antes de
// confiar no agendamento do pg_cron.

import { createClient } from "jsr:@supabase/supabase-js@2";

const LINKLY_API_BASE = "https://app.linklyhq.com/api/v1";

type LinklyLinkRow = {
  id: string;
  workspace_secret: string;
  linkly_link_id: string;
  short_url: string;
};

type ResultadoSincronizacao = {
  ok: boolean;
  atualizados: { link_id: string; linkly_link_id: string; total_cliques: number }[];
  erros: { escopo: string; mensagem: string }[];
};

// A doc pública do Linkly não deixa 100% claro o nome do campo do id do
// workspace na resposta de GET /workspaces — tenta as variações mais
// prováveis antes de desistir.
function extrairWorkspaceId(payload: unknown): string | null {
  const lista = Array.isArray(payload) ? payload : (payload as { workspaces?: unknown[] })?.workspaces;
  if (!Array.isArray(lista) || lista.length === 0) return null;
  const primeiro = lista[0] as Record<string, unknown>;
  const candidato = primeiro.id ?? primeiro.workspace_id;
  return candidato != null ? String(candidato) : null;
}

async function buscarWorkspaceId(apiKey: string): Promise<string> {
  const resp = await fetch(`${LINKLY_API_BASE}/workspaces?api_key=${encodeURIComponent(apiKey)}`);
  if (!resp.ok) throw new Error(`GET /workspaces falhou (HTTP ${resp.status}): ${await resp.text()}`);
  const workspaceId = extrairWorkspaceId(await resp.json());
  if (!workspaceId) throw new Error("Não foi possível identificar o workspace_id na resposta de /workspaces.");
  return workspaceId;
}

// Mesma incerteza de nome de campo pro array de links e pra contagem de
// cliques em cada um — tenta as variações mais prováveis (id/link_id,
// clicks/click_count/total_clicks/visits) e falha alto (não assume 0) se
// nenhuma bater, pra nunca gravar um total errado silenciosamente.
function extrairLista(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  const links = (payload as { links?: unknown[] })?.links;
  return Array.isArray(links) ? (links as Record<string, unknown>[]) : [];
}

async function buscarLinks(workspaceId: string, apiKey: string): Promise<Record<string, unknown>[]> {
  const resp = await fetch(
    `${LINKLY_API_BASE}/workspace/${encodeURIComponent(workspaceId)}/list_links?api_key=${encodeURIComponent(apiKey)}`
  );
  if (!resp.ok) throw new Error(`GET /list_links falhou (HTTP ${resp.status}): ${await resp.text()}`);
  return extrairLista(await resp.json());
}

function idDoLink(link: Record<string, unknown>): string | null {
  const candidato = link.id ?? link.link_id;
  return candidato != null ? String(candidato) : null;
}

// Fallback de correspondência: se o id retornado pela API não bater com o
// linkly_link_id cadastrado (formato ainda incerto — ver aviso no topo do
// arquivo), tenta casar pelo último segmento da URL curta (o "slug", ex.:
// "2nlst9" em https://linkly.link/2nlst9) — algo que o Adm Master lê direto
// da tela do Linkly, então tende a ser mais confiável de cadastrar certo do
// que um id interno opaco.
function ultimoSegmento(url: string): string | null {
  const partes = url.split("/").filter(Boolean);
  return partes.length > 0 ? partes[partes.length - 1] : null;
}

function slugDoLinkApi(link: Record<string, unknown>): string | null {
  for (const campo of ["slug", "short_url", "url", "path"]) {
    const valor = link[campo];
    if (typeof valor === "string") {
      const segmento = ultimoSegmento(valor);
      if (segmento) return segmento;
    }
  }
  return null;
}

function extrairContagemDeCliques(link: Record<string, unknown>): number | null {
  for (const campo of ["clicks", "click_count", "total_clicks", "visits"]) {
    const valor = link[campo];
    if (typeof valor === "number") return valor;
    if (typeof valor === "string" && /^\d+$/.test(valor)) return Number(valor);
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const resultado: ResultadoSincronizacao = { ok: true, atualizados: [], erros: [] };

  try {
    const { data: linksData, error: linksError } = await supabase
      .from("linkly_links")
      .select("id, workspace_secret, linkly_link_id, short_url");
    if (linksError) throw new Error(`Falha ao ler linkly_links: ${linksError.message}`);

    const links = (linksData ?? []) as LinklyLinkRow[];
    const porWorkspace = new Map<string, LinklyLinkRow[]>();
    for (const link of links) {
      const grupo = porWorkspace.get(link.workspace_secret) ?? [];
      grupo.push(link);
      porWorkspace.set(link.workspace_secret, grupo);
    }

    for (const [workspaceSecret, linksDoWorkspace] of porWorkspace) {
      try {
        const { data: apiKey, error: apiKeyError } = await supabase.rpc("obter_linkly_api_key", {
          p_nome_secret: workspaceSecret,
        });
        if (apiKeyError || !apiKey) {
          throw new Error(`Secret "${workspaceSecret}" não encontrado no Vault: ${apiKeyError?.message ?? "vazio"}`);
        }

        const workspaceId = await buscarWorkspaceId(apiKey as string);
        const linksDaApi = await buscarLinks(workspaceId, apiKey as string);
        const porLinklyId = new Map(
          linksDaApi.map((l) => [idDoLink(l), l]).filter((par): par is [string, Record<string, unknown>] => par[0] !== null)
        );
        const porSlug = new Map(
          linksDaApi.map((l) => [slugDoLinkApi(l), l]).filter((par): par is [string, Record<string, unknown>] => par[0] !== null)
        );

        for (const linkRow of linksDoWorkspace) {
          const slugCadastrado = ultimoSegmento(linkRow.short_url);
          const linkDaApi = porLinklyId.get(linkRow.linkly_link_id) ?? (slugCadastrado ? porSlug.get(slugCadastrado) : undefined);
          if (!linkDaApi) {
            resultado.erros.push({
              escopo: `${workspaceSecret}/${linkRow.linkly_link_id}`,
              mensagem: "Link não encontrado na resposta da API do Linkly (nem por id, nem por slug da URL curta).",
            });
            continue;
          }

          const cliques = extrairContagemDeCliques(linkDaApi);
          if (cliques === null) {
            resultado.erros.push({
              escopo: `${workspaceSecret}/${linkRow.linkly_link_id}`,
              mensagem: `Nenhum campo de contagem de cliques reconhecido. Campos disponíveis: ${Object.keys(linkDaApi).join(", ")}`,
            });
            continue;
          }

          const { error: upsertError } = await supabase
            .from("linkly_cliques_totais")
            .upsert({ link_id: linkRow.id, total_cliques: cliques, atualizado_em: new Date().toISOString() }, { onConflict: "link_id" });
          if (upsertError) throw new Error(`Falha ao gravar linkly_cliques_totais (${linkRow.id}): ${upsertError.message}`);

          resultado.atualizados.push({ link_id: linkRow.id, linkly_link_id: linkRow.linkly_link_id, total_cliques: cliques });
        }
      } catch (erroWorkspace) {
        resultado.erros.push({ escopo: workspaceSecret, mensagem: String(erroWorkspace) });
      }
    }

    resultado.ok = resultado.erros.length === 0;

    return new Response(JSON.stringify(resultado), {
      status: resultado.ok ? 200 : 207,
      headers: { "Content-Type": "application/json" },
    });
  } catch (erro) {
    console.error("Erro na sincronização do Linkly:", erro);
    return new Response(JSON.stringify({ ok: false, erro: String(erro) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
