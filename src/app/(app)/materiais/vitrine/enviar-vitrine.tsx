"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FILIAL_LABELS } from "@/lib/labels";
import { createClient } from "@/lib/supabase/client";
import type { FilialCvc } from "@/lib/supabase/types";
import { FILIAIS } from "@/lib/validation/caso";
import { VITRINE_PDF_TAMANHO_MAXIMO_BYTES } from "@/lib/validation/vitrine";
import type { CategoriaVitrine } from "@/lib/vitrine/listar";
import { processarPdfVitrine, type PaginaProcessada } from "@/lib/vitrine/processar-pdf";

import { nomePdfVitrine, nomesImagensVitrine } from "@/lib/vitrine/nomes";

import { prepararEnvioVitrine, salvarEnvioVitrine } from "./actions";
import { confirmarLinksExternos } from "./oferta-card";

type Linha = { pagina: number; titulo: string; link: string; validade: string; capa: boolean; miniatura: string };

type Etapa =
  | { tipo: "escolher" }
  | { tipo: "processando"; feitas: number; total: number }
  | { tipo: "enviando"; feitos: number; total: number }
  | { tipo: "revisao" };

/**
 * Envio da vitrine (PDF de até 25 MB). Tudo pesado acontece no navegador:
 * pdf.js gera o PNG e lê o texto de cada página; a revisão vem em seguida
 * (miniaturas locais) e, ao publicar, o PDF e os PNGs sobem direto para o
 * Supabase Storage por URL assinada de upload (o teto de corpo da Vercel é
 * 4,5 MB), já com os nomes legíveis — título da oferta e "{categoria} -
 * {titulo}" —, que são os nomes do "Salvar como". O servidor só gera as
 * URLs e grava a revisão.
 */
export function EnviarVitrine({
  filial,
  categorias,
  ehAdmin,
  aoConcluir,
  acoes = { prepararEnvioVitrine, salvarEnvioVitrine },
}: {
  filial: FilialCvc;
  categorias: CategoriaVitrine[];
  ehAdmin: boolean;
  aoConcluir: () => void;
  /** Só para o teste de navegador (sem Supabase); na tela, sempre as actions reais. */
  acoes?: { prepararEnvioVitrine: typeof prepararEnvioVitrine; salvarEnvioVitrine: typeof salvarEnvioVitrine };
}) {
  const [etapa, setEtapa] = useState<Etapa>({ tipo: "escolher" });
  const [arquivo, setArquivo] = useState<File | undefined>();
  const [categoriaId, setCategoriaId] = useState(categorias[0]?.id ?? "");
  const [titulo, setTitulo] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [pdfInteiro, setPdfInteiro] = useState(false);
  const [unica, setUnica] = useState({ titulo: "", link: "", validade: "" });
  const [copiarPara, setCopiarPara] = useState<FilialCvc[]>([]);
  const [erro, setErro] = useState<string | undefined>();
  const [salvando, setSalvando] = useState(false);

  // Miniaturas (blob:) liberadas só ao sair — editar uma linha não as recria.
  const miniaturas = useRef<string[]>([]);
  const pngs = useRef(new Map<number, Blob>());
  useEffect(() => () => miniaturas.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const enviar = async () => {
    setErro(undefined);
    if (!arquivo) return setErro("Escolha o PDF da vitrine.");
    if (arquivo.type !== "application/pdf") return setErro("O arquivo precisa ser PDF.");
    if (arquivo.size > VITRINE_PDF_TAMANHO_MAXIMO_BYTES) return setErro("PDF maior que 25 MB.");
    if (!categoriaId) return setErro("Escolha a categoria (crie uma em Nova categoria).");

    let paginas: PaginaProcessada[];
    try {
      setEtapa({ tipo: "processando", feitas: 0, total: 0 });
      paginas = await processarPdfVitrine(arquivo, (feitas, total) => setEtapa({ tipo: "processando", feitas, total }));
    } catch (e) {
      console.error(e);
      setEtapa({ tipo: "escolher" });
      return setErro("Não foi possível ler o PDF.");
    }

    const tituloVitrine = titulo.trim() || paginas[0]?.tituloSugerido || arquivo.name.replace(/\.pdf$/i, "");
    setTitulo(tituloVitrine);
    setUnica({ titulo: tituloVitrine, link: "", validade: "" });
    const novas = paginas.map((p) => ({
      pagina: p.numero,
      titulo: p.tituloSugerido,
      link: "",
      validade: "",
      capa: p.numero === 1 && paginas.length > 1,
      miniatura: URL.createObjectURL(p.png),
    }));
    miniaturas.current = novas.map((l) => l.miniatura);
    pngs.current = new Map(paginas.map((p) => [p.numero, p.png]));
    setLinhas(novas);
    setEtapa({ tipo: "revisao" });
  };

  const salvar = async () => {
    if (etapa.tipo !== "revisao" || !arquivo) return;
    setErro(undefined);
    const capa = pdfInteiro ? undefined : linhas.find((l) => l.capa);
    const paginasOferta = pdfInteiro
      ? [{ pagina: 1, ...unica }]
      : linhas.filter((l) => !l.capa).map(({ pagina, titulo, link, validade }) => ({ pagina, titulo, link, validade }));
    if (!confirmarLinksExternos(paginasOferta.map((o) => o.link))) return;

    // Nomes legíveis dos arquivos (são os nomes do "Salvar como").
    const pdfNome = nomePdfVitrine(categorias.find((c) => c.id === categoriaId)?.nome ?? "", titulo);
    const nomesPng = nomesImagensVitrine([
      ...(capa ? [{ pagina: capa.pagina, titulo: "", capa: true }] : []),
      ...paginasOferta.map(({ pagina, titulo }) => ({ pagina, titulo })),
    ]);
    const arquivos = [
      { nome: pdfNome, tipo: "application/pdf" as const, corpo: arquivo as Blob },
      ...[...nomesPng].map(([pagina, nome]) => ({ nome, tipo: "image/png" as const, corpo: pngs.current.get(pagina)! })),
    ];

    setSalvando(true);
    const preparado = await acoes.prepararEnvioVitrine(filial, arquivos.map(({ nome, tipo }) => ({ nome, tipo })));
    if ("error" in preparado) {
      setSalvando(false);
      return setErro(preparado.error);
    }

    const storage = createClient().storage.from("vitrine");
    const corpoPorNome = new Map(arquivos.map((a) => [a.nome, a.corpo]));
    let feitos = 0;
    setEtapa({ tipo: "enviando", feitos, total: preparado.uploads.length });
    for (const upload of preparado.uploads) {
      const { error } = await storage.uploadToSignedUrl(upload.caminho, upload.token, corpoPorNome.get(upload.nome)!, {
        contentType: upload.tipo,
      });
      if (error) {
        console.error("Erro ao enviar arquivo da vitrine:", error);
        setSalvando(false);
        setEtapa({ tipo: "revisao" });
        return setErro("Falha no envio para o armazenamento. Tente de novo.");
      }
      setEtapa({ tipo: "enviando", feitos: ++feitos, total: preparado.uploads.length });
    }

    const resultado = await acoes.salvarEnvioVitrine({
      arquivoId: preparado.arquivoId,
      filial,
      categoriaId,
      titulo,
      paginas: linhas.length,
      capaPagina: capa?.pagina ?? null,
      pdfNome,
      ofertas: paginasOferta.map((o) => ({ ...o, pagina: pdfInteiro ? null : o.pagina, imagem: nomesPng.get(o.pagina)! })),
      copiarPara,
      linksExternosConfirmados: true,
    });
    setSalvando(false);
    if (resultado.error) {
      setEtapa({ tipo: "revisao" });
      return setErro(resultado.error);
    }
    aoConcluir();
  };

  const atualizar = (pagina: number, campos: Partial<Linha>) =>
    setLinhas((atual) => atual.map((l) => (l.pagina === pagina ? { ...l, ...campos } : l)));

  if (etapa.tipo === "processando" || etapa.tipo === "enviando") {
    const [feito, total] = etapa.tipo === "processando" ? [etapa.feitas, etapa.total] : [etapa.feitos, etapa.total];
    return (
      <div className="flex flex-col gap-2 py-4" role="status">
        <p className="text-sm">
          {etapa.tipo === "processando" ? "Lendo o PDF e gerando as imagens das páginas" : "Enviando para o armazenamento"}… {feito}/{total || "?"}
        </p>
        <div className="bg-muted h-2 overflow-hidden rounded">
          <div className="bg-primary h-full transition-all" style={{ width: `${total ? (feito / total) * 100 : 5}%` }} />
        </div>
      </div>
    );
  }

  if (etapa.tipo === "escolher") {
    return (
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="vitrine-categoria">Categoria</Label>
            <Select value={categoriaId} onValueChange={setCategoriaId}>
              <SelectTrigger id="vitrine-categoria">
                <SelectValue placeholder="Crie uma categoria antes" />
              </SelectTrigger>
              <SelectContent>
                {categorias.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="vitrine-titulo">Título da vitrine (opcional)</Label>
            <Input id="vitrine-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Cruzeiros MSC" />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="vitrine-pdf">PDF da vitrine (até 25 MB)</Label>
          <Input id="vitrine-pdf" type="file" accept="application/pdf,.pdf" onChange={(e) => setArquivo(e.target.files?.[0])} />
          <p className="text-muted-foreground text-xs">
            A página 1 costuma ser a capa; cada página seguinte vira uma oferta. Você revisa tudo antes de publicar.
          </p>
        </div>
        {erro && <p className="text-destructive text-sm">{erro}</p>}
        <Button type="button" onClick={enviar} disabled={!arquivo || categorias.length === 0} className="w-fit">
          Ler PDF e revisar
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="revisao-titulo">Título da vitrine</Label>
          <Input id="revisao-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 pt-6">
          <Checkbox id="pdf-inteiro" checked={pdfInteiro} onCheckedChange={(v) => setPdfInteiro(v === true)} />
          <Label htmlFor="pdf-inteiro" className="font-normal">
            PDF inteiro como uma oferta só
          </Label>
        </div>
      </div>

      {pdfInteiro ? (
        <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-[12rem_1fr]">
          {/* eslint-disable-next-line @next/next/no-img-element -- blob: local */}
          <img src={linhas[0]?.miniatura} alt="Página 1" className="w-full rounded border bg-black object-contain" />
          <div className="grid gap-2 sm:grid-cols-3">
            <Input aria-label="Título da oferta" value={unica.titulo} onChange={(e) => setUnica({ ...unica, titulo: e.target.value })} />
            <Input aria-label="Link da oferta" type="url" placeholder="https://www.cvc.com.br/..." value={unica.link}
              onChange={(e) => setUnica({ ...unica, link: e.target.value })} />
            <Input aria-label="Validade" type="date" value={unica.validade} onChange={(e) => setUnica({ ...unica, validade: e.target.value })} />
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {linhas.map((l) => (
            <li key={l.pagina} className={`grid gap-3 rounded-md border p-3 sm:grid-cols-[12rem_1fr] ${l.capa ? "bg-muted/50" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- blob: local */}
              <img src={l.miniatura} alt={`Página ${l.pagina}`} className="w-full rounded border bg-black object-contain" />
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">Página {l.pagina}</span>
                  <div className="flex items-center gap-2">
                    <Checkbox id={`capa-${l.pagina}`} checked={l.capa}
                      onCheckedChange={(v) => setLinhas((atual) => atual.map((x) => ({ ...x, capa: x.pagina === l.pagina ? v === true : false })))} />
                    <Label htmlFor={`capa-${l.pagina}`} className="text-sm font-normal">
                      É capa (não vira oferta)
                    </Label>
                  </div>
                </div>
                {!l.capa && (
                  <div className="grid gap-2 sm:grid-cols-[2fr_2fr_10rem]">
                    <Input aria-label={`Título da página ${l.pagina}`} value={l.titulo} placeholder="Título da oferta"
                      onChange={(e) => atualizar(l.pagina, { titulo: e.target.value })} />
                    <Input aria-label={`Link da página ${l.pagina}`} type="url" value={l.link} placeholder="https://www.cvc.com.br/..."
                      onChange={(e) => atualizar(l.pagina, { link: e.target.value })} />
                    <Input aria-label={`Validade da página ${l.pagina}`} type="date" value={l.validade}
                      onChange={(e) => atualizar(l.pagina, { validade: e.target.value })} />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {ehAdmin && (
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span>Publicar também em:</span>
          {FILIAIS.filter((f) => f !== filial).map((f) => (
            <div key={f} className="flex items-center gap-2">
              <Checkbox id={`copiar-${f}`} checked={copiarPara.includes(f)}
                onCheckedChange={(v) => setCopiarPara((atual) => (v === true ? [...atual, f] : atual.filter((x) => x !== f)))} />
              <Label htmlFor={`copiar-${f}`} className="font-normal">
                {FILIAL_LABELS[f]}
              </Label>
            </div>
          ))}
          <span className="text-muted-foreground text-xs">Cada filial recebe uma cópia própria (link e validade editáveis por loja).</span>
        </div>
      )}

      {erro && <p className="text-destructive text-sm">{erro}</p>}
      <Button type="button" onClick={salvar} disabled={salvando} className="w-fit">
        {salvando ? "Publicando..." : "Publicar na vitrine"}
      </Button>
    </div>
  );
}
