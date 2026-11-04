// Nomes legíveis dos arquivos no bucket "vitrine" — a URL de visualização é
// inline (sem "download"), então "Salvar como" usa o nome do objeto:
//   {filial}/{arquivo_id}/{categoria} - {titulo da vitrine}.pdf
//   {filial}/{arquivo_id}/{titulo-da-oferta}.webp        (ou .jpg; .png nas antigas)
//   {filial}/{arquivo_id}/{titulo-da-oferta}-mini.webp   miniatura do card
// Sem acento e só com [A-Za-z0-9 ._-] (mesmo padrão validado no banco).

const TAMANHO_MAXIMO = 90;

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Texto livre -> trecho de nome de arquivo (espaços preservados). */
export function nomeSeguro(texto: string): string {
  return semAcento(texto)
    .replace(/[^A-Za-z0-9 ._-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s.-]+|[\s.-]+$/g, "")
    .slice(0, TAMANHO_MAXIMO)
    .trim();
}

/** Texto livre -> slug (minúsculas, hífens). */
export function slugArquivo(texto: string): string {
  return semAcento(texto)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, TAMANHO_MAXIMO)
    .replace(/-+$/, "");
}

export function nomePdfVitrine(categoria: string, tituloVitrine: string): string {
  const nome = [nomeSeguro(categoria), nomeSeguro(tituloVitrine)].filter(Boolean).join(" - ");
  return `${nome || "vitrine"}.pdf`;
}

export type ExtensaoImagem = "png" | "webp" | "jpg";

/**
 * Nome da imagem de cada página: "{titulo-da-oferta}.{extensao}" (capa =
 * "capa.{extensao}"). Repetidos ganham "-2", "-3"...
 */
export function nomesImagensVitrine(
  paginas: { pagina: number; titulo: string; capa?: boolean }[],
  extensao: ExtensaoImagem = "png"
): Map<number, string> {
  const usados = new Set<string>();
  const nomes = new Map<number, string>();
  for (const { pagina, titulo, capa } of paginas) {
    const base = (capa ? "capa" : slugArquivo(titulo)) || `pagina-${pagina}`;
    let nome = base;
    for (let n = 2; usados.has(nome); n++) nome = `${base}-${n}`;
    usados.add(nome);
    nomes.set(pagina, `${nome}.${extensao}`);
  }
  return nomes;
}

/** Miniatura ao lado da imagem: "msc-virtuosa.webp" -> "msc-virtuosa-mini.webp". */
export function nomeMiniatura(nomeImagem: string, extensao: Exclude<ExtensaoImagem, "png">): string {
  return `${nomeImagem.replace(/\.(png|webp|jpg)$/, "")}-mini.${extensao}`;
}

/** Extensão do arquivo pelo tipo gerado no navegador. */
export function extensaoDaImagem(tipo: string): Exclude<ExtensaoImagem, "png"> {
  return tipo === "image/webp" ? "webp" : "jpg";
}

/** Mesma regra do banco (vitrine_salvar_envio): só o nome do arquivo, sem pasta. */
export function nomeArquivoValido(nome: string, extensao: ExtensaoImagem | "pdf"): boolean {
  return new RegExp(`^[A-Za-z0-9][A-Za-z0-9 ._-]*\\.${extensao}$`).test(nome) && nome.length <= 120;
}
