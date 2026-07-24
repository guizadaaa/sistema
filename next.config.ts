import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Server Actions usam 1 MB por padrão. O formulário de novo caso aceita
      // até 3 anexos de até 10 MB cada (ver ANEXO_TAMANHO_MAXIMO_BYTES) no
      // mesmo envio — sem esse ajuste, qualquer anexo próximo do limite
      // padrão faz a requisição inteira ser rejeitada antes mesmo de chegar
      // ao server action, o que o Next.js expõe como falha genérica de rede
      // no navegador em vez de um erro tratado pela aplicação.
      bodySizeLimit: "35mb",
    },
  },
  // Causa raiz real do 500 ao gerar PDF, reproduzida localmente com
  // `next build && next start` (não em `next dev`, que não passa pelo
  // bundler de produção): pdfkit lê as métricas das fontes padrão
  // (Helvetica etc.) de arquivos .afm relativos a __dirname em runtime.
  // O Turbopack reescreve/relocaliza esse `__dirname` ao empacotar pdfkit
  // junto com o código da rota, e o caminho resultante não resolve pro
  // arquivo de verdade — reproduzido com o erro exato: "ENOENT: no such
  // file or directory, open '/ROOT/node_modules/pdfkit/js/data/Helvetica.afm'"
  // (o "/ROOT/" é um placeholder do bundler que não foi substituído
  // corretamente). Isso acontecia mesmo com os arquivos presentes no
  // output file tracing (tentativa anterior) — o problema nunca foi os
  // arquivos ficarem de fora do trace, foi o bundling do pdfkit em si.
  // serverExternalPackages tira o pacote do bundling do Turbopack/webpack
  // e usa `require()` nativo do Node em runtime — __dirname resolve
  // corretamente porque o código do pdfkit nunca é reescrito/movido.
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
