import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { ehPdfLegado } from "./listar";
import { nomePdfVitrine, nomesImagensVitrine } from "./nomes";

export type ResumoMigracaoNomes = { vitrines: number; arquivos: number; erros: string[] };

type Admin = ReturnType<typeof createAdminClient>;

/** Copia sem sobrescrever; destino já existente (migração repetida) conta como feito. */
async function copiar(admin: Admin, de: string, para: string): Promise<string | undefined> {
  const { error } = await admin.storage.from("vitrine").copy(de, para);
  if (!error || /exist/i.test(error.message)) return undefined;
  return `${de} → ${para}: ${error.message}`;
}

/**
 * Migra as vitrines enviadas no layout antigo ({filial}/{id}.pdf e
 * {filial}/{id}/p{n}.png) para os nomes legíveis da migration
 * 20261030000001: {filial}/{id}/{categoria} - {titulo}.pdf e
 * {filial}/{id}/{titulo-da-oferta}.png (capa: capa.png).
 *
 * Ordem segura, por vitrine: 1) copia tudo; 2) atualiza pdf_path de todas as
 * cópias (outras filiais incluídas) e imagem_path das ofertas; 3) só então
 * apaga os antigos. Qualquer erro numa vitrine para ela antes de apagar —
 * nada é removido sem a cópia e o banco já apontarem para o novo.
 *
 * Service role: as cópias publicadas em outras filiais apontam para a pasta
 * da filial de origem, e a migração precisa ver e mover todas. Chamar só
 * depois de checar adm_master (migrarNomesVitrineAction).
 */
export async function migrarNomesVitrine(): Promise<ResumoMigracaoNomes> {
  const admin = createAdminClient();
  const resumo: ResumoMigracaoNomes = { vitrines: 0, arquivos: 0, erros: [] };

  const [{ data: arquivos, error: erroArquivos }, { data: categorias, error: erroCategorias }] = await Promise.all([
    admin.from("vitrine_arquivos").select("id, filial, titulo, pdf_path, capa_pagina, categoria_id"),
    admin.from("vitrine_categorias").select("id, nome"),
  ]);
  if (erroArquivos) throw erroArquivos;
  if (erroCategorias) throw erroCategorias;
  const nomeCategoria = new Map((categorias ?? []).map((c) => [c.id, c.nome]));

  const porPdf = new Map<string, NonNullable<typeof arquivos>>();
  for (const a of arquivos ?? []) {
    if (ehPdfLegado(a.pdf_path)) porPdf.set(a.pdf_path, [...(porPdf.get(a.pdf_path) ?? []), a]);
  }

  for (const [pdfAntigo, grupo] of porPdf) {
    const pasta = pdfAntigo.slice(0, -4);
    // A vitrine original é a da pasta ({filial}/{id}.pdf); as demais são cópias.
    const original = grupo.find((a) => `${a.filial}/${a.id}.pdf` === pdfAntigo) ?? grupo[0];
    const pdfNovo = `${pasta}/${nomePdfVitrine(nomeCategoria.get(original.categoria_id) ?? "", original.titulo)}`;

    const { data: ofertas, error: erroOfertas } = await admin
      .from("vitrine_ofertas")
      .select("imagem_path, titulo, filial")
      .in("arquivo_id", grupo.map((a) => a.id));
    if (erroOfertas) {
      resumo.erros.push(`${pdfAntigo}: ${erroOfertas.message}`);
      continue;
    }

    // Uma imagem antiga (p{n}.png) por página usada; título da oferta da filial original.
    const imagens = new Map<string, { pagina: number; titulo: string }>();
    for (const o of [...(ofertas ?? [])].sort((x, y) => Number(y.filial === original.filial) - Number(x.filial === original.filial))) {
      const pagina = Number(/\/p(\d+)\.png$/.exec(o.imagem_path)?.[1]);
      if (o.imagem_path.startsWith(`${pasta}/`) && pagina && !imagens.has(o.imagem_path)) imagens.set(o.imagem_path, { pagina, titulo: o.titulo });
    }
    const capaAntiga = original.capa_pagina ? `${pasta}/p${original.capa_pagina}.png` : null;
    const comCapa = capaAntiga && !imagens.has(capaAntiga);
    const nomes = nomesImagensVitrine([
      ...(comCapa ? [{ pagina: original.capa_pagina!, titulo: "", capa: true }] : []),
      ...[...imagens.values()],
    ]);
    const movimentos: [string, string][] = [
      [pdfAntigo, pdfNovo],
      ...[...imagens].map(([antigo, { pagina }]): [string, string] => [antigo, `${pasta}/${nomes.get(pagina)}`]),
    ];
    if (comCapa) {
      const { data: existe } = await admin.storage.from("vitrine").list(pasta, { search: `p${original.capa_pagina}.png` });
      if (existe?.some((f) => f.name === `p${original.capa_pagina}.png`)) movimentos.push([capaAntiga!, `${pasta}/capa.png`]);
    }

    // 1) copia
    const errosCopia = (await Promise.all(movimentos.map(([de, para]) => copiar(admin, de, para)))).filter(Boolean) as string[];
    if (errosCopia.length) {
      resumo.erros.push(...errosCopia);
      continue;
    }

    // 2) aponta o banco para os novos
    const { error: erroPdf } = await admin.from("vitrine_arquivos").update({ pdf_path: pdfNovo }).eq("pdf_path", pdfAntigo);
    if (erroPdf) {
      resumo.erros.push(`${pdfAntigo}: ${erroPdf.message}`);
      continue;
    }
    let falhou = false;
    for (const [de, para] of movimentos.slice(1)) {
      const { error } = await admin.from("vitrine_ofertas").update({ imagem_path: para }).eq("imagem_path", de);
      if (error) {
        resumo.erros.push(`${de}: ${error.message}`);
        falhou = true;
      }
    }
    if (falhou) continue;

    // 3) só agora apaga os antigos
    const { error: erroRemocao } = await admin.storage.from("vitrine").remove(movimentos.map(([de]) => de));
    if (erroRemocao) resumo.erros.push(`${pdfAntigo} (remoção dos antigos): ${erroRemocao.message}`);

    resumo.vitrines += 1;
    resumo.arquivos += movimentos.length;
  }

  return resumo;
}
