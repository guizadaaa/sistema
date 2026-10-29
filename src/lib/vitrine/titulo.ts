const MARCADOR = /a\s+partir\s+de\s*:?/i;

// Preço e condições que costumam vir junto: "R$ 3.499", "10x de R$ 349,90",
// "por pessoa", "+ taxas", "*".
const RUIDO = [
  /R\$\s*[\d.,]+/gi,
  /\b\d+\s*x\s*(de|sem juros)?\b/gi,
  /\bpor\s+pessoa\b/gi,
  /\bp\/\s*pessoa\b/gi,
  /\+\s*taxas?\b/gi,
  /\bsem\s+juros\b/gi,
  /\*/g,
];

const TAMANHO_MAXIMO = 120;

/**
 * Sugere o título da oferta a partir do texto da página do PDF: o texto que
 * vem depois de "A partir de:" (ex.: "MSC VIRTUOSA BÚZIOS, SALVADOR E
 * MACEIÓ"), sem preço nem condições. Sem o marcador, usa a primeira linha
 * com letras. É só sugestão — o título é editável na revisão.
 */
export function sugerirTituloOferta(texto: string): string {
  const normalizado = texto.replace(/\r/g, "");
  const marcador = MARCADOR.exec(normalizado);

  let candidato: string;
  if (marcador) {
    candidato = normalizado.slice(marcador.index + marcador[0].length);
  } else {
    candidato = normalizado.split("\n").find((linha) => /\p{L}{3,}/u.test(linha)) ?? "";
  }

  for (const padrao of RUIDO) candidato = candidato.replace(padrao, " ");
  candidato = candidato
    .split("\n")
    .map((linha) => linha.replace(/\s+/g, " ").trim())
    .filter((linha) => /\p{L}/u.test(linha))
    .join(" ")
    .replace(/\s+([,.])/g, "$1")
    .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, "");

  return candidato.length > TAMANHO_MAXIMO ? `${candidato.slice(0, TAMANHO_MAXIMO - 1).trimEnd()}…` : candidato;
}
