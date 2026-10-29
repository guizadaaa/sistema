/** Um trecho de texto da página, como o pdf.js entrega (getTextContent). */
export type TrechoTexto = { texto: string; tamanho: number; fimDeLinha: boolean };

const MARCADOR = /a\s+partir\s+de\s*:?/i;
const ATE_VALOR = /\bvalor\b/i;

// Preço e condições: "R$ 3.499", "10x de", "por pessoa", "+ taxas", "*".
const RUIDO = [/R\$\s*[\d.,]+/gi, /\b\d+\s*x\s*(de|sem juros)?\b/gi, /\bp(or|\/)\s*pessoa\b/gi, /\+\s*taxas?\b/gi, /\bsem\s+juros\b/gi, /\*/g];
const PARECE_PRECO = /R\$|^\s*\d+\s*x\b|^[\s\d.,%x$R*+-]+$/i;

const TAMANHO_MAXIMO = 120;
const PROPORCAO_FONTE_GRANDE = 0.8;
const MAX_LINHAS_FONTE_GRANDE = 3;

function limpar(texto: string): string {
  let t = texto;
  for (const padrao of RUIDO) t = t.replace(padrao, " ");
  t = t
    .replace(/\s+/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, "");
  return t.length > TAMANHO_MAXIMO ? `${t.slice(0, TAMANHO_MAXIMO - 1).trimEnd()}…` : t;
}

/** Junta os trechos em linhas, guardando o maior tamanho de fonte de cada linha. */
function linhas(trechos: TrechoTexto[]): { texto: string; tamanho: number }[] {
  const resultado: { texto: string; tamanho: number }[] = [];
  let atual = { texto: "", tamanho: 0 };
  for (const trecho of trechos) {
    if (trecho.texto.trim()) {
      atual.texto += (atual.texto ? " " : "") + trecho.texto.trim();
      atual.tamanho = Math.max(atual.tamanho, trecho.tamanho);
    }
    if (trecho.fimDeLinha && atual.texto) {
      resultado.push(atual);
      atual = { texto: "", tamanho: 0 };
    }
  }
  if (atual.texto) resultado.push(atual);
  return resultado;
}

/**
 * Título sugerido da oferta (editável na revisão):
 *   1. o nome da oferta entre "A partir de:" e "Valor"
 *      (ex.: "MSC VIRTUOSA BÚZIOS, SALVADOR E MACEIÓ");
 *   2. sem "Valor" (ou sem o marcador): as primeiras linhas com fonte grande
 *      da página, ignorando preço e o próprio "A partir de:" — também é o
 *      que dá o nome da capa ("PARTIU VIAJAR").
 */
export function sugerirTituloOferta(trechos: TrechoTexto[]): string {
  const texto = trechos.map((t) => t.texto + (t.fimDeLinha ? "\n" : " ")).join("");

  const marcador = MARCADOR.exec(texto);
  if (marcador) {
    const depois = texto.slice(marcador.index + marcador[0].length);
    const valor = ATE_VALOR.exec(depois);
    if (valor) {
      const nome = limpar(depois.slice(0, valor.index));
      if (nome) return nome;
    }
  }

  const candidatas = linhas(trechos).filter(
    (l) => /\p{L}{2,}/u.test(l.texto) && !PARECE_PRECO.test(l.texto) && !/^\s*a\s+partir\s+de\s*:?\s*$/i.test(l.texto)
  );
  if (candidatas.length === 0) return "";
  const maior = Math.max(...candidatas.map((l) => l.tamanho));
  const inicio = candidatas.findIndex((l) => l.tamanho >= maior * PROPORCAO_FONTE_GRANDE);
  const selecionadas = [];
  for (const linha of candidatas.slice(inicio)) {
    if (linha.tamanho < maior * PROPORCAO_FONTE_GRANDE || selecionadas.length === MAX_LINHAS_FONTE_GRANDE) break;
    selecionadas.push(linha.texto.replace(MARCADOR, ""));
  }
  return limpar(selecionadas.join(" "));
}

/**
 * Mesma regra aplicada a um título já gravado que começa com
 * "A partir de:" (sem as fontes da página: só o corte até "Valor"). Mesma
 * lógica da correção em SQL da migration 20261030000001.
 */
export function corrigirTituloGravado(titulo: string): string {
  if (!/^\s*a\s+partir\s+de\b/i.test(titulo)) return titulo;
  const depois = titulo.replace(/^\s*a\s+partir\s+de\s*:?\s*/i, "");
  const valor = ATE_VALOR.exec(depois);
  return limpar(valor ? depois.slice(0, valor.index) : depois) || titulo;
}
