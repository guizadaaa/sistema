// Compressão de imagem no navegador antes do envio (anexos e imagens da
// descrição dos protocolos): WebP (fallback JPEG), lado maior até 2000 px,
// qualidade 0,85. Mesma lógica da Vitrine (lib/vitrine/processar-pdf.ts).
// Só troca quando fica menor que o original; PDF e outros tipos passam
// direto.

export const COMPRESSAO_LADO_MAXIMO = 2000;
export const COMPRESSAO_QUALIDADE = 0.85;

const TIPOS_COMPRIMIVEIS = ["image/png", "image/jpeg", "image/webp"];

export type Dimensoes = { largura: number; altura: number };

/** Lado maior até `ladoMaximo`, mantendo a proporção; nunca aumenta. */
export function dimensoesAlvo({ largura, altura }: Dimensoes, ladoMaximo = COMPRESSAO_LADO_MAXIMO): Dimensoes {
  const maior = Math.max(largura, altura);
  if (maior <= ladoMaximo) return { largura, altura };
  const fator = ladoMaximo / maior;
  return { largura: Math.max(1, Math.round(largura * fator)), altura: Math.max(1, Math.round(altura * fator)) };
}

/** Acesso ao navegador (decodificar e codificar), injetável nos testes. */
export type CodecImagem = {
  dimensoes: (arquivo: Blob) => Promise<Dimensoes>;
  /** Redimensiona e codifica; o `type` do Blob diz o que saiu de fato (sem WebP, vem PNG). */
  codificar: (arquivo: Blob, alvo: Dimensoes, tipo: string, qualidade: number) => Promise<Blob>;
};

export const codecNavegador: CodecImagem = {
  async dimensoes(arquivo) {
    const bitmap = await createImageBitmap(arquivo);
    const dimensoes = { largura: bitmap.width, altura: bitmap.height };
    bitmap.close();
    return dimensoes;
  },
  async codificar(arquivo, alvo, tipo, qualidade) {
    const bitmap = await createImageBitmap(arquivo);
    const canvas = document.createElement("canvas");
    canvas.width = alvo.largura;
    canvas.height = alvo.altura;
    const contexto = canvas.getContext("2d")!;
    contexto.imageSmoothingQuality = "high";
    if (tipo === "image/jpeg") {
      // JPEG não tem transparência: fundo branco em vez de preto.
      contexto.fillStyle = "#fff";
      contexto.fillRect(0, 0, alvo.largura, alvo.altura);
    }
    contexto.drawImage(bitmap, 0, 0, alvo.largura, alvo.altura);
    bitmap.close();
    return new Promise((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Falha ao comprimir a imagem."))), tipo, qualidade)
    );
  },
};

function trocarExtensao(nome: string, tipo: string): string {
  const extensao = tipo === "image/webp" ? "webp" : "jpg";
  return /\.[A-Za-z0-9]+$/.test(nome) ? nome.replace(/\.[A-Za-z0-9]+$/, `.${extensao}`) : `${nome}.${extensao}`;
}

/**
 * Versão comprimida da imagem, ou o próprio arquivo quando não é imagem,
 * quando não dá para comprimir ou quando o resultado não fica menor.
 */
export async function comprimirImagem(
  arquivo: File,
  codec: CodecImagem = codecNavegador,
  { ladoMaximo = COMPRESSAO_LADO_MAXIMO, qualidade = COMPRESSAO_QUALIDADE } = {}
): Promise<File> {
  if (!TIPOS_COMPRIMIVEIS.includes(arquivo.type)) return arquivo;

  try {
    const alvo = dimensoesAlvo(await codec.dimensoes(arquivo), ladoMaximo);
    let resultado = await codec.codificar(arquivo, alvo, "image/webp", qualidade);
    if (resultado.type !== "image/webp") resultado = await codec.codificar(arquivo, alvo, "image/jpeg", qualidade);
    if (resultado.type !== "image/webp" && resultado.type !== "image/jpeg") return arquivo;
    if (resultado.size >= arquivo.size) return arquivo;
    return new File([resultado], trocarExtensao(arquivo.name, resultado.type), { type: resultado.type });
  } catch {
    // Sem createImageBitmap, imagem corrompida etc.: envia como veio.
    return arquivo;
  }
}
