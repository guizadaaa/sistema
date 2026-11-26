import { describe, expect, it } from "vitest";

import { ANEXO_TIPO_LABELS } from "@/lib/labels";
import { anexoObrigatorioFaltando } from "@/lib/validation/desfecho";
import { ANEXO_TIPOS_DOCUMENTO } from "@/lib/validation/caso";

import { enviarImagensDescricao, isTipoDocumentoAnexo, validarEEnviarAnexos } from "./anexos";

function criarSupabaseFake() {
  const uploads: string[] = [];
  const inserts: Record<string, unknown>[] = [];
  const supabase = {
    storage: {
      from: (bucket: string) => ({
        upload: (path: string) => {
          uploads.push(`${bucket}:${path}`);
          return Promise.resolve({ error: null });
        },
      }),
    },
    from: () => ({
      insert: (linha: Record<string, unknown>) => {
        inserts.push(linha);
        return Promise.resolve({ error: null });
      },
    }),
  };
  return { supabase: supabase as unknown as Parameters<typeof enviarImagensDescricao>[0], uploads, inserts };
}

function formCom(arquivos: File[]): FormData {
  const fd = new FormData();
  for (const a of arquivos) fd.append("descricaoImagem", a);
  return fd;
}

describe("enviarImagensDescricao", () => {
  it("grava cada imagem como anexo imagem_descricao no path <caso_id>/ do bucket anexos", async () => {
    const { supabase, uploads, inserts } = criarSupabaseFake();
    const avisos = await enviarImagensDescricao(
      supabase,
      "caso-1",
      formCom([new File(["x"], "imagem-colada-1.png", { type: "image/png" })])
    );

    expect(avisos).toEqual([]);
    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toMatch(/^anexos:caso-1\/.+-imagem-colada-1\.png$/);
    expect(inserts).toEqual([
      expect.objectContaining({ caso_id: "caso-1", tipo_documento: "imagem_descricao", nome_arquivo: "imagem-colada-1.png" }),
    ]);
  });

  it("recusa o que não é JPG/PNG e o que passa de 10 MB, sem gravar", async () => {
    const { supabase, uploads, inserts } = criarSupabaseFake();
    const grande = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "grande.png", { type: "image/png" });
    const avisos = await enviarImagensDescricao(
      supabase,
      "caso-1",
      formCom([new File(["x"], "doc.pdf", { type: "application/pdf" }), grande])
    );

    expect(avisos).toHaveLength(2);
    expect(uploads).toEqual([]);
    expect(inserts).toEqual([]);
  });

  it("limita a 5 imagens", async () => {
    const { supabase, inserts } = criarSupabaseFake();
    const seis = Array.from({ length: 6 }, (_, i) => new File(["x"], `img-${i}.png`, { type: "image/png" }));
    const avisos = await enviarImagensDescricao(supabase, "caso-1", formCom(seis));

    expect(inserts).toHaveLength(5);
    expect(avisos).toEqual(["Só as 5 primeiras imagens da descrição foram enviadas."]);
  });

  it("sem imagem coladas, não faz nada", async () => {
    const { supabase, uploads } = criarSupabaseFake();
    expect(await enviarImagensDescricao(supabase, "caso-1", new FormData())).toEqual([]);
    expect(uploads).toEqual([]);
  });
});

describe("categorias de anexo dos sistemas (FastZap, Orbium, Systur, Atlas)", () => {
  it("ordem do select: as 3 documentais, os 4 sistemas e Outro por último", () => {
    expect(ANEXO_TIPOS_DOCUMENTO.map((t) => ANEXO_TIPO_LABELS[t])).toEqual([
      "Carta de cancelamento",
      "Atestado de saúde",
      "Certidão de óbito",
      "FastZap",
      "Orbium",
      "Systur",
      "Atlas",
      "Outro",
    ]);
  });

  it("aceitas no envio (mesma função da criação do caso e do protocolo já criado)", async () => {
    const { supabase, uploads, inserts } = criarSupabaseFake();
    const fd = new FormData();
    for (const tipo of ["fastzap", "orbium", "systur", "atlas"]) {
      fd.append("anexoArquivo", new File(["%PDF-1.4"], `${tipo}.pdf`, { type: "application/pdf" }));
      fd.append("anexoTipo", tipo);
    }
    const avisos = await validarEEnviarAnexos(supabase as unknown as Parameters<typeof validarEEnviarAnexos>[0], "caso-1", fd);
    expect(avisos).toEqual([]);
    expect(uploads).toHaveLength(4);
    expect(inserts.map((i) => i.tipo_documento)).toEqual(["fastzap", "orbium", "systur", "atlas"]);
    expect(["fastzap", "orbium", "systur", "atlas"].every(isTipoDocumentoAnexo)).toBe(true);
    expect(isTipoDocumentoAnexo("whatsapp")).toBe(false);
  });

  it("não contam como documento exigido do desfecho de saúde/óbito", () => {
    const reembolsoSaude = { tipo: "reembolso", subtipoReembolso: "integral", origemReembolsoIntegral: "saude" } as Parameters<typeof anexoObrigatorioFaltando>[0];
    const remarcacaoSaude = { tipo: "remarcacao", subtipoRemarcacao: "com_custo", origemRemarcacaoComCusto: "saude" } as Parameters<typeof anexoObrigatorioFaltando>[0];
    expect(anexoObrigatorioFaltando(reembolsoSaude, ["systur", "fastzap", "orbium", "atlas"])).toEqual(["atestado_saude", "certidao_obito"]);
    expect(anexoObrigatorioFaltando(remarcacaoSaude, ["systur"])).toEqual(["atestado_saude"]);
    expect(anexoObrigatorioFaltando(reembolsoSaude, ["systur", "certidao_obito"])).toBeNull();
  });
});
