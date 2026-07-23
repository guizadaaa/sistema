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
  // pdfkit (usado em src/lib/relatorios/pdf-util.ts) lê as métricas das
  // fontes padrão (Helvetica etc.) de arquivos .afm em node_modules/pdfkit/js/data
  // via fs em runtime, não via import/require estático — um padrão de acesso
  // conhecido por escapar do output file tracing em builds na Vercel (ENOENT
  // ao gerar PDF, mesmo funcionando local). Garantir a inclusão explícita
  // aqui é a mitigação documentada pelo próprio Next.js para esse tipo de
  // caso. Ressalva: build local (.next/server/.../route.js.nft.json) já
  // inclui esses arquivos mesmo SEM esta opção — não consegui reproduzir a
  // ausência localmente, então isto é defensivo/best-effort enquanto não
  // temos confirmação via logs reais da Vercel do erro 500 relatado.
  outputFileTracingIncludes: {
    "/*": ["./node_modules/pdfkit/js/data/**/*"],
  },
};

export default nextConfig;
