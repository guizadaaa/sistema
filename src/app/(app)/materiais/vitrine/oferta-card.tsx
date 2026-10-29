"use client";

import { useActionState, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Copy, Download, ExternalLink, FileDown, Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatarDataBr } from "@/lib/formatacao";
import { validarLinkVitrine } from "@/lib/validation/vitrine";
import type { OfertaVitrine } from "@/lib/vitrine/listar";

import {
  alternarOfertaVitrine,
  editarOfertaVitrine,
  excluirOfertaVitrine,
  moverVitrine,
  urlArquivoVitrine,
  type VitrineFormState,
} from "./actions";

const initialState: VitrineFormState = {};

/** Nome de arquivo legível para "Baixar imagem"/"Baixar PDF". */
export function nomeArquivo(titulo: string, extensao: "png" | "pdf"): string {
  const base = titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 80);
  return `${base || "vitrine"}.${extensao}`;
}

/** Link fora de cvc.com.br: pede confirmação (devolve false se o usuário cancelar). */
export function confirmarLinksExternos(links: string[]): boolean {
  const externos = links
    .map((link) => validarLinkVitrine(link))
    .flatMap((r) => (r.ok && r.url && !r.dominioCvc ? [new URL(r.url).hostname] : []));
  if (externos.length === 0) return true;
  return window.confirm(
    `Link fora de cvc.com.br: ${[...new Set(externos)].join(", ")}.\n\nConfira se é mesmo o link da oferta. Salvar assim mesmo?`
  );
}

export function BotaoArquivo({
  caminho,
  nome,
  rotulo,
  icone: Icone,
}: {
  caminho: string;
  nome?: string;
  rotulo: string;
  icone: typeof Download;
}) {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | undefined>();

  const abrir = async () => {
    setCarregando(true);
    setErro(undefined);
    const resultado = await urlArquivoVitrine(caminho, nome);
    setCarregando(false);
    if (!resultado.url) {
      setErro(resultado.error ?? "Erro ao gerar o link.");
      return;
    }
    if (nome) window.location.assign(resultado.url);
    else window.open(resultado.url, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={abrir} disabled={carregando} title={erro}>
        <Icone className="size-4" /> {carregando ? "Gerando..." : rotulo}
      </Button>
      {erro && <span className="text-destructive text-xs">{erro}</span>}
    </>
  );
}

function EditarOfertaDialog({
  oferta,
  aberto,
  onOpenChange,
}: {
  oferta: OfertaVitrine;
  aberto: boolean;
  onOpenChange: (aberto: boolean) => void;
}) {
  const [state, formAction, isPending] = useActionState(async (prev: VitrineFormState, formData: FormData) => {
    const resultado = await editarOfertaVitrine(prev, formData);
    if (resultado.ok) onOpenChange(false);
    return resultado;
  }, initialState);

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar oferta</DialogTitle>
          <DialogDescription>{oferta.pagina ? `Página ${oferta.pagina} do PDF.` : "PDF inteiro."}</DialogDescription>
        </DialogHeader>
        <form
          action={formAction}
          onSubmit={(evento) => {
            // O FormData é montado logo depois deste handler: grava a confirmação direto no campo.
            const form = evento.currentTarget;
            const ok = confirmarLinksExternos([String(new FormData(form).get("link") ?? "")]);
            if (!ok) evento.preventDefault();
            (form.elements.namedItem("confirmarLinkExterno") as HTMLInputElement).value = ok ? "1" : "0";
          }}
          className="flex flex-col gap-3"
        >
          <input type="hidden" name="id" value={oferta.id} />
          <input type="hidden" name="confirmarLinkExterno" defaultValue="0" />
          <div className="flex flex-col gap-1">
            <Label htmlFor={`titulo-${oferta.id}`}>Título</Label>
            <Input id={`titulo-${oferta.id}`} name="titulo" defaultValue={oferta.titulo} required />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`link-${oferta.id}`}>Link (https://…cvc.com.br)</Label>
            <Input id={`link-${oferta.id}`} name="link" type="url" defaultValue={oferta.link ?? ""} placeholder="https://www.cvc.com.br/..." />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`validade-${oferta.id}`}>Validade (opcional)</Label>
            <Input id={`validade-${oferta.id}`} name="validade" type="date" defaultValue={oferta.validade ?? ""} className="w-48" />
          </div>
          {state.error && <p className="text-destructive text-sm">{state.error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function OfertaCard({
  oferta,
  pdfPath,
  podeEditar,
  primeira,
  ultima,
}: {
  oferta: OfertaVitrine;
  pdfPath: string | undefined;
  podeEditar: boolean;
  primeira: boolean;
  ultima: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | undefined>();
  const [pendente, startTransition] = useTransition();
  const esmaecida = oferta.vencida || !oferta.ativo;

  const executar = (acao: () => Promise<{ error?: string }>) => {
    setErro(undefined);
    startTransition(async () => {
      const resultado = await acao();
      if (resultado.error) setErro(resultado.error);
    });
  };

  const copiar = async () => {
    if (!oferta.link) return;
    await navigator.clipboard.writeText(oferta.link);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <li className={`flex flex-col overflow-hidden rounded-lg border ${esmaecida ? "opacity-60" : ""}`}>
      {oferta.imagemUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL assinada do Storage, next/image não se aplica
        <img src={oferta.imagemUrl} alt={oferta.titulo} className="aspect-[1190/425] w-full bg-black object-contain" />
      ) : (
        <div className="bg-muted aspect-[1190/425] w-full" />
      )}
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <span className="text-sm font-medium">{oferta.titulo}</span>
          <div className="flex flex-wrap gap-1">
            {oferta.vencida && <Badge variant="outline">vencida</Badge>}
            {!oferta.ativo && <Badge variant="outline">inativa</Badge>}
          </div>
        </div>
        {oferta.validade && (
          <span className="text-muted-foreground text-xs">Válida até {formatarDataBr(oferta.validade)}</span>
        )}

        <div className="mt-auto flex flex-wrap gap-1">
          {oferta.link && (
            <>
              <Button type="button" variant="outline" size="sm" onClick={copiar}>
                <Copy className="size-4" /> {copiado ? "Copiado!" : "Copiar link"}
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href={oferta.link} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" /> Abrir link
                </a>
              </Button>
            </>
          )}
          <BotaoArquivo caminho={oferta.imagem_path} nome={nomeArquivo(oferta.titulo, "png")} rotulo="Baixar imagem" icone={Download} />
          {pdfPath && <BotaoArquivo caminho={pdfPath} nome={nomeArquivo(oferta.titulo, "pdf")} rotulo="Baixar PDF" icone={FileDown} />}
        </div>

        {podeEditar && (
          <div className="flex flex-wrap items-center gap-1 border-t pt-2">
            <Button type="button" variant="ghost" size="sm" aria-label="Mover para a esquerda" disabled={primeira || pendente}
              onClick={() => executar(() => moverVitrine("oferta", oferta.id, -1))}>
              <ArrowLeft className="size-4" />
            </Button>
            <Button type="button" variant="ghost" size="sm" aria-label="Mover para a direita" disabled={ultima || pendente}
              onClick={() => executar(() => moverVitrine("oferta", oferta.id, 1))}>
              <ArrowRight className="size-4" />
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditando(true)}>
              <Pencil className="size-4" /> Editar
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={pendente}
              onClick={() => executar(() => alternarOfertaVitrine(oferta.id, !oferta.ativo))}>
              {oferta.ativo ? "Desativar" : "Ativar"}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="text-destructive" disabled={pendente}
              onClick={() => {
                if (!window.confirm(`Excluir a oferta "${oferta.titulo}"? A imagem é apagada; o PDF só sai quando nenhuma oferta usar mais.`)) return;
                executar(() => excluirOfertaVitrine(oferta.id));
              }}>
              <Trash2 className="size-4" /> Excluir
            </Button>
          </div>
        )}
        {erro && <p className="text-destructive text-xs">{erro}</p>}
      </div>
      {editando && <EditarOfertaDialog oferta={oferta} aberto={editando} onOpenChange={setEditando} />}
    </li>
  );
}
