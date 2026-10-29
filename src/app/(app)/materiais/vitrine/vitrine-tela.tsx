"use client";

import { useActionState, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Eye, Plus, Search, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FILIAL_LABELS } from "@/lib/labels";
import type { FilialCvc } from "@/lib/supabase/types";
import { FILIAIS } from "@/lib/validation/caso";
import type { CategoriaVitrine, DadosVitrine } from "@/lib/vitrine/listar";

import {
  atualizarCategoriaVitrine,
  criarCategoriaVitrine,
  excluirCategoriaVitrine,
  migrarNomesVitrineAction,
  moverVitrine,
  type VitrineFormState,
} from "./actions";
import { EnviarVitrine } from "./enviar-vitrine";
import { OfertaCard } from "./oferta-card";

const initialState: VitrineFormState = {};

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function NovaCategoriaDialog({ filial, aberto, onOpenChange }: { filial: FilialCvc; aberto: boolean; onOpenChange: (v: boolean) => void }) {
  const [state, formAction, isPending] = useActionState(async (prev: VitrineFormState, formData: FormData) => {
    const resultado = await criarCategoriaVitrine(prev, formData);
    if (resultado.ok) onOpenChange(false);
    return resultado;
  }, initialState);

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova categoria</DialogTitle>
          <DialogDescription>Na vitrine da {FILIAL_LABELS[filial]}.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="filial" value={filial} />
          <div className="flex flex-col gap-1">
            <Label htmlFor="nova-categoria-vitrine">Nome</Label>
            <Input id="nova-categoria-vitrine" name="nome" placeholder="Ex.: Cruzeiros" required />
          </div>
          {state.error && <p className="text-destructive text-sm">{state.error}</p>}
          <Button type="submit" disabled={isPending} className="w-fit">
            {isPending ? "Criando..." : "Criar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CabecalhoCategoria({
  categoria,
  podeEditar,
  primeira,
  ultima,
  vazia,
}: {
  categoria: CategoriaVitrine;
  podeEditar: boolean;
  primeira: boolean;
  ultima: boolean;
  vazia: boolean;
}) {
  const [erro, setErro] = useState<string | undefined>();
  const [pendente, startTransition] = useTransition();

  const executar = (acao: () => Promise<{ error?: string }>) => {
    setErro(undefined);
    startTransition(async () => {
      const resultado = await acao();
      if (resultado.error) setErro(resultado.error);
    });
  };

  return (
    <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
      <CardTitle className="flex items-center gap-2">
        {categoria.nome}
        {!categoria.ativo && <Badge variant="outline">inativa</Badge>}
      </CardTitle>
      {podeEditar && (
        <div className="flex flex-wrap items-center gap-1">
          <Button type="button" variant="ghost" size="sm" aria-label="Subir categoria" disabled={primeira || pendente}
            onClick={() => executar(() => moverVitrine("categoria", categoria.id, -1))}>
            <ArrowUp className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="sm" aria-label="Descer categoria" disabled={ultima || pendente}
            onClick={() => executar(() => moverVitrine("categoria", categoria.id, 1))}>
            <ArrowDown className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={pendente}
            onClick={() => {
              const nome = window.prompt("Novo nome da categoria", categoria.nome);
              if (nome && nome.trim() !== categoria.nome) executar(() => atualizarCategoriaVitrine(categoria.id, { nome }));
            }}>
            Renomear
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={pendente}
            onClick={() => executar(() => atualizarCategoriaVitrine(categoria.id, { ativo: !categoria.ativo }))}>
            {categoria.ativo ? "Desativar" : "Ativar"}
          </Button>
          {vazia && (
            <Button type="button" variant="ghost" size="sm" className="text-destructive" disabled={pendente}
              onClick={() => window.confirm(`Excluir a categoria "${categoria.nome}"?`) && executar(() => excluirCategoriaVitrine(categoria.id))}>
              Excluir
            </Button>
          )}
        </div>
      )}
      {erro && <p className="text-destructive w-full text-xs">{erro}</p>}
    </CardHeader>
  );
}

/** Vitrines enviadas antes dos nomes legíveis: o adm_master migra (copia, atualiza, apaga o antigo). */
function AvisoMigrarNomes() {
  const [mensagem, setMensagem] = useState<string | undefined>();
  const [pendente, startTransition] = useTransition();

  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          Há vitrines enviadas antes dos nomes legíveis (o arquivo salvo sai como “p2.png”). Migrar renomeia os
          arquivos de todas as filiais — copia, atualiza e só depois apaga o antigo.
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pendente}
          onClick={() =>
            startTransition(async () => {
              const resultado = await migrarNomesVitrineAction();
              if (resultado.error) return setMensagem(resultado.error);
              const r = resultado.resumo!;
              setMensagem(
                `${r.vitrines} vitrine(s) e ${r.arquivos} arquivo(s) migrados.${r.erros.length ? ` Erros: ${r.erros.join("; ")}` : ""}`
              );
            })
          }
        >
          {pendente ? "Migrando..." : "Migrar nomes dos arquivos"}
        </Button>
        {mensagem && <p className="w-full text-xs">{mensagem}</p>}
      </CardContent>
    </Card>
  );
}

export function VitrineTela({
  filial,
  ehAdmin,
  ehAdmMaster = false,
  podeEditar,
  dados,
}: {
  filial: FilialCvc;
  ehAdmin: boolean;
  ehAdmMaster?: boolean;
  podeEditar: boolean;
  dados: DadosVitrine;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [busca, setBusca] = useState("");
  const [novaCategoria, setNovaCategoria] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const termo = semAcento(busca.trim());
  const ofertasFiltradas = termo ? dados.ofertas.filter((o) => semAcento(o.titulo).includes(termo)) : dados.ofertas;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold">Vitrine · {FILIAL_LABELS[filial]}</h1>
          {ehAdmin && (
            <div className="flex items-center gap-2">
              <Label htmlFor="vitrine-filial" className="text-sm">
                Filial
              </Label>
              <Select value={filial} onValueChange={(f) => router.push(`${pathname}?filial=${f}`)}>
                <SelectTrigger id="vitrine-filial" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FILIAIS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {FILIAL_LABELS[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-2.5 left-2 size-4" />
            <Input aria-label="Buscar oferta" placeholder="Buscar por título" value={busca} onChange={(e) => setBusca(e.target.value)}
              className="w-64 pl-8" />
          </div>
          {podeEditar && (
            <>
              <Button type="button" variant="outline" onClick={() => setNovaCategoria(true)}>
                <Plus className="size-4" /> Nova categoria
              </Button>
              <Button type="button" onClick={() => setEnviando((v) => !v)}>
                <Upload className="size-4" /> Enviar vitrine (PDF)
              </Button>
            </>
          )}
        </div>
      </div>

      {ehAdmMaster && dados.arquivos.some((a) => a.legado) && <AvisoMigrarNomes />}

      {podeEditar && enviando && (
        <Card>
          <CardHeader>
            <CardTitle>Enviar vitrine</CardTitle>
          </CardHeader>
          <CardContent>
            <EnviarVitrine
              key={filial}
              filial={filial}
              categorias={dados.categorias}
              ehAdmin={ehAdmin}
              aoConcluir={() => {
                setEnviando(false);
                router.refresh();
              }}
            />
          </CardContent>
        </Card>
      )}

      {dados.categorias.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {podeEditar ? "Nenhuma categoria ainda — comece por Nova categoria." : "Nenhuma oferta na vitrine desta filial."}
        </p>
      ) : (
        dados.categorias.map((categoria, i) => {
          const ofertas = ofertasFiltradas.filter((o) => o.categoria_id === categoria.id);
          const arquivos = dados.arquivos.filter((a) => a.categoria_id === categoria.id);
          if (termo && ofertas.length === 0) return null;
          if (!podeEditar && ofertas.length === 0) return null;
          return (
            <Card key={categoria.id} className={categoria.ativo ? "" : "opacity-70"}>
              <CabecalhoCategoria
                categoria={categoria}
                podeEditar={podeEditar}
                primeira={i === 0}
                ultima={i === dados.categorias.length - 1}
                vazia={arquivos.length === 0 && !dados.ofertas.some((o) => o.categoria_id === categoria.id)}
              />
              <CardContent className="flex flex-col gap-3">
                {arquivos.length > 0 && (
                  <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                    {arquivos.map((a) => (
                      <span key={a.id} className="flex items-center gap-1">
                        {a.titulo} ({a.paginas} pág.)
                        {a.pdfUrl && (
                          // URL assinada sem "download": abre no visualizador de PDF do navegador.
                          <Button asChild variant="outline" size="sm">
                            <a href={a.pdfUrl} target="_blank" rel="noopener noreferrer">
                              <Eye className="size-4" /> Ver vitrine completa
                            </a>
                          </Button>
                        )}
                      </span>
                    ))}
                  </div>
                )}
                {ofertas.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Nenhuma oferta nesta categoria.</p>
                ) : (
                  <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {ofertas.map((oferta, j) => (
                      <OfertaCard
                        key={oferta.id}
                        oferta={oferta}
                        podeEditar={podeEditar}
                        primeira={j === 0}
                        ultima={j === ofertas.length - 1}
                      />
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      {termo && ofertasFiltradas.length === 0 && <p className="text-muted-foreground text-sm">Nenhuma oferta com “{busca}”.</p>}

      {podeEditar && <NovaCategoriaDialog filial={filial} aberto={novaCategoria} onOpenChange={setNovaCategoria} />}
    </div>
  );
}
