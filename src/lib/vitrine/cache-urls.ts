// Cache em memória das URLs assinadas da Vitrine, por caminho no bucket.
// O token da URL assinada muda a cada createSignedUrls: sem reaproveitar, o
// navegador nunca usa o cache e cada visita baixa todas as imagens de novo.
// Um processo só no Render basta; se reiniciar, as URLs são geradas de novo.
//
// Só guarda a URL: quem pode ver o arquivo continua decidido antes, pelo
// select com RLS (só se pede URL de caminho de linha que o usuário enxerga).

/** Validade das URLs geradas: 7 dias. */
export const VALIDADE_URL_S = 7 * 24 * 60 * 60;
/** Reaproveita enquanto faltar mais que isto para vencer: 24 h. */
export const FOLGA_MINIMA_S = 24 * 60 * 60;

type Entrada = { url: string; venceEm: number };

export class CacheUrlsAssinadas {
  private readonly entradas = new Map<string, Entrada>();

  constructor(private readonly agora: () => number = Date.now) {}

  /**
   * URLs para os caminhos pedidos: as do cache que ainda têm mais de 24 h, e
   * as que faltam geradas de uma vez por `gerar` (validade de 7 dias).
   */
  async obter(
    caminhos: string[],
    gerar: (faltando: string[], validadeS: number) => Promise<Map<string, string>>
  ): Promise<Map<string, string>> {
    const agora = this.agora();
    const resultado = new Map<string, string>();
    const faltando: string[] = [];

    for (const caminho of new Set(caminhos)) {
      const entrada = this.entradas.get(caminho);
      if (entrada && entrada.venceEm - agora > FOLGA_MINIMA_S * 1000) resultado.set(caminho, entrada.url);
      else faltando.push(caminho);
    }

    if (faltando.length > 0) {
      const novas = await gerar(faltando, VALIDADE_URL_S);
      const venceEm = agora + VALIDADE_URL_S * 1000;
      for (const [caminho, url] of novas) {
        this.entradas.set(caminho, { url, venceEm });
        resultado.set(caminho, url);
      }
    }

    // Limpeza simples: some com o que já venceu.
    for (const [caminho, entrada] of this.entradas) {
      if (entrada.venceEm <= agora) this.entradas.delete(caminho);
    }
    return resultado;
  }
}
