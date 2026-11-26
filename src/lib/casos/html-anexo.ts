// Limpeza de anexo HTML (página salva, ex.: tela de erro do Systur). Roda no
// servidor antes de gravar e de novo ao servir (defesa em profundidade).
// Biblioteca: sanitize-html (lista de permissões — nada de regex caseira
// para o HTML em si).
//
// 1. Sem código: <script>, <iframe>, <object>, <embed>, <form>/<input> e
//    afins não estão na lista; atributos on* não estão na lista; links só
//    com http/https/mailto (javascript: some); imagens só http/https/data.
// 2. Sem dados de sessão: some o bloco inteiro (linha de tabela, item de
//    lista, parágrafo...) e a linha de texto que mencionam cookie/sessão/
//    token — páginas de erro do Systur trazem HTTP_COOKIE com o JSESSIONID.

import sanitizeHtml from "sanitize-html";

/** Termos de dado de sessão (sem acento, qualquer caixa). Lista única para completar depois. */
export const TERMOS_SESSAO = ["HTTP_COOKIE", "COOKIE", "SET-COOKIE", "SESSION", "JSESSIONID", "TOKEN", "CFID", "CFTOKEN"];

const RE_SESSAO = new RegExp(TERMOS_SESSAO.map((t) => t.replace(/[-]/g, "\\-")).join("|"), "i");

export function temDadoDeSessao(texto: string | null | undefined): boolean {
  return RE_SESSAO.test(texto ?? "");
}

/** Blocos que somem inteiros quando o texto deles tem dado de sessão. */
const BLOCOS_SESSAO = new Set(["tr", "li", "p", "dt", "dd"]);

const TAGS = [
  "html", "head", "body", "title", "style",
  "h1", "h2", "h3", "h4", "h5", "h6", "p", "div", "span", "br", "hr", "pre", "code", "blockquote",
  "b", "strong", "i", "em", "u", "s", "small", "big", "sub", "sup", "font", "center", "label",
  "ul", "ol", "li", "dl", "dt", "dd",
  "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col",
  "a", "img", "figure", "figcaption", "section", "article", "header", "footer", "nav", "main", "aside",
];

const ATRIBUTOS_COMUNS = ["style", "class", "id", "align", "valign", "width", "height", "border", "bgcolor", "color", "title", "dir", "lang"];

const OPCOES: sanitizeHtml.IOptions = {
  allowedTags: TAGS,
  allowedAttributes: {
    "*": ATRIBUTOS_COMUNS,
    a: [...ATRIBUTOS_COMUNS, "href", "name"],
    img: [...ATRIBUTOS_COMUNS, "src", "alt"],
    td: [...ATRIBUTOS_COMUNS, "colspan", "rowspan", "nowrap"],
    th: [...ATRIBUTOS_COMUNS, "colspan", "rowspan", "nowrap"],
    table: [...ATRIBUTOS_COMUNS, "cellpadding", "cellspacing", "summary"],
    font: [...ATRIBUTOS_COMUNS, "face", "size"],
    col: [...ATRIBUTOS_COMUNS, "span"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["http", "https", "data"] },
  allowProtocolRelative: false,
  // <style> fica (a página aparece como foi salva); o visualizador bloqueia
  // qualquer carga externa pela CSP.
  allowVulnerableTags: true,
  // Conteúdo de <script>, <noscript>, <textarea> etc. some junto com a tag.
  nonTextTags: ["script", "noscript", "textarea", "option", "template", "iframe", "object", "embed", "applet", "svg", "math"],
  // Bloco inteiro com cookie/sessão/token some (ex.: <tr><td>HTTP_COOKIE</td><td>JSESSIONID=…</td></tr>).
  exclusiveFilter: (frame) => BLOCOS_SESSAO.has(frame.tag) && temDadoDeSessao(frame.text),
  // Texto solto: some a linha com cookie/sessão/token.
  textFilter: (texto) =>
    texto
      .split(/\r?\n/)
      .filter((linha) => !temDadoDeSessao(linha))
      .join("\n"),
  transformTags: {
    // Link com dado de sessão na URL (ex.: ;jsessionid=…) perde o href.
    a: (tagName, attribs) => {
      const { href, ...resto } = attribs;
      return { tagName, attribs: href && !temDadoDeSessao(href) ? { ...resto, href } : resto };
    },
    img: (tagName, attribs) => {
      const { src, ...resto } = attribs;
      return { tagName, attribs: src && !temDadoDeSessao(src) ? { ...resto, src } : resto };
    },
  },
};

/** HTML limpo: sem código e sem dados de sessão. */
export function limparHtmlAnexo(html: string): string {
  return sanitizeHtml(html, OPCOES);
}

/**
 * Bytes do arquivo → texto, respeitando o charset declarado no próprio HTML
 * (páginas do Systur costumam vir em ISO-8859-1). Sem declaração, UTF-8.
 */
export function decodificarHtml(bytes: Uint8Array): string {
  const inicio = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
  const charset = inicio.match(/<meta[^>]+charset\s*=\s*["']?\s*([A-Za-z0-9_-]+)/i)?.[1]?.toLowerCase();
  try {
    return new TextDecoder(charset || "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}
