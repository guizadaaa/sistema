"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardPaste, File as FileIcon, FileCode, FileText, Image as ImageIcon, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { tipoVisualAnexo } from "@/lib/casos/anexo-tipo";
import { ANEXO_TIPO_LABELS } from "@/lib/labels";
import { imagensDaAreaDeTransferencia } from "@/lib/colar-imagem";
import { comprimirImagem } from "@/lib/comprimir-imagem";
import { ANEXO_COMENTARIO_MAXIMO, ANEXO_IMAGEM_MIME_TYPES, ANEXO_TAMANHO_MAXIMO_BYTES, ANEXO_TIPOS_DOCUMENTO } from "@/lib/validation/caso";
import type { Database } from "@/lib/supabase/types";

import { CampoArquivoAnexo, CampoComentarioAnexo, CLASSE_LINHA_ANEXO, definirArquivoNoInput, PreviaAnexo } from "../campo-arquivo-anexo";
import { editarComentarioAnexo, enviarAnexoAoCaso, gerarUrlAssinadaAnexo, type EnviarAnexoState } from "./actions";

type AnexoRow = Database["public"]["Tables"]["anexos"]["Row"];

type AcoesAnexos = {
  enviar: typeof enviarAnexoAoCaso;
  gerarUrl: typeof gerarUrlAssinadaAnexo;
  editarComentario?: typeof editarComentarioAnexo;
};

function BotaoDownload({ anexo, gerarUrl }: { anexo: AnexoRow; gerarUrl: AcoesAnexos["gerarUrl"] }) {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | undefined>();

  const baixar = async () => {
    setCarregando(true);
    setErro(undefined);
    const resultado = await gerarUrl(anexo.id, anexo.storage_path);
    setCarregando(false);
    if (resultado.error || !resultado.url) {
      setErro(resultado.error ?? "Erro ao gerar link");
      return;
    }
    window.open(resultado.url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" size="sm" onClick={baixar} disabled={carregando}>
        {carregando ? "Gerando link..." : "Baixar"}
      </Button>
      {erro && <span className="text-destructive text-xs">{erro}</span>}
    </div>
  );
}

const ICONE_ANEXO = { html: FileCode, pdf: FileText, imagem: ImageIcon, outro: FileIcon } as const;
const ROTULO_ICONE = { html: "Página HTML", pdf: "PDF", imagem: "Imagem", outro: "Arquivo" } as const;

/**
 * HTML nunca abre pela URL do Storage: "Abrir" leva ao visualizador da Aura
 * (iframe com sandbox, sem scripts — casos/[id]/anexos/[anexoId]).
 */
function BotaoAbrirHtml({ casoId, anexo }: { casoId: string; anexo: AnexoRow }) {
  return (
    <Button asChild variant="outline" size="sm">
      <Link href={`/casos/${casoId}/anexos/${anexo.id}`} target="_blank" rel="noopener noreferrer">
        Abrir
      </Link>
    </Button>
  );
}

/**
 * "Categoria · data — comentário" e, para quem pode (quem enviou, gerente da
 * filial, admin), o lápis que abre a edição. Vazio apaga o comentário.
 */
function LinhaInfoAnexo({
  casoId,
  anexo,
  podeEditar,
  editar,
}: {
  casoId: string;
  anexo: AnexoRow;
  podeEditar: boolean;
  editar: typeof editarComentarioAnexo;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(anexo.comentario ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | undefined>();

  const salvar = async () => {
    setSalvando(true);
    setErro(undefined);
    const resultado = await editar(casoId, anexo.id, texto);
    setSalvando(false);
    if (resultado.error) {
      setErro(resultado.error);
      return;
    }
    setEditando(false);
  };

  const data = new Date(anexo.enviado_em).toLocaleDateString("pt-BR");

  if (editando) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-xs">
            {ANEXO_TIPO_LABELS[anexo.tipo_documento]} · {data}
          </span>
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={ANEXO_COMENTARIO_MAXIMO}
            placeholder="Comentário (opcional)"
            aria-label="Comentário do anexo"
            className="h-8 w-72 max-w-full"
            autoFocus
            data-testid="editar-comentario-input"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void salvar();
              }
              if (e.key === "Escape") setEditando(false);
            }}
          />
          <Button type="button" size="sm" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setTexto(anexo.comentario ?? "");
              setEditando(false);
              setErro(undefined);
            }}
          >
            Cancelar
          </Button>
        </div>
        {erro && <span className="text-destructive text-xs">{erro}</span>}
      </div>
    );
  }

  return (
    <span className="text-muted-foreground flex items-center gap-1 text-xs" data-testid="anexo-info">
      <span>
        {ANEXO_TIPO_LABELS[anexo.tipo_documento]} · {data}
        {anexo.comentario && (
          <>
            {" — "}
            <span className="text-foreground" data-testid="anexo-comentario-texto">
              {anexo.comentario}
            </span>
          </>
        )}
      </span>
      {podeEditar && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6"
          aria-label={anexo.comentario ? `Editar comentário de ${anexo.nome_arquivo}` : `Adicionar comentário em ${anexo.nome_arquivo}`}
          title={anexo.comentario ? "Editar comentário" : "Adicionar comentário"}
          onClick={() => setEditando(true)}
          data-testid="editar-comentario"
        >
          <Pencil className="size-3.5" />
        </Button>
      )}
    </span>
  );
}

const initialState: EnviarAnexoState = {};

/** Linha de anexo: escolhida pelo "Escolher arquivo" ou colada (Ctrl+V), já com o arquivo. */
type LinhaAnexo = { id: string; colada?: File };

/** Foco num campo de texto: colar ali segue o comportamento normal do navegador. */
function ehCampoDeTexto(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false;
  if (alvo.isContentEditable || alvo instanceof HTMLTextAreaElement) return true;
  return alvo instanceof HTMLInputElement && !["file", "checkbox", "radio", "button", "submit"].includes(alvo.type);
}

export function AnexosSecao({
  casoId,
  anexos,
  usuarioId,
  podeGerenciarCaso = false,
  acoes = { enviar: enviarAnexoAoCaso, gerarUrl: gerarUrlAssinadaAnexo, editarComentario: editarComentarioAnexo },
}: {
  casoId: string;
  anexos: AnexoRow[];
  /** Quem está vendo — edita o comentário dos anexos que enviou. */
  usuarioId?: string;
  /** Admin ou gerente da filial do caso: edita o comentário de qualquer anexo. */
  podeGerenciarCaso?: boolean;
  /** Só para o teste de navegador (sem Supabase); na tela, sempre as actions reais. */
  acoes?: AcoesAnexos;
}) {
  const enviarAnexoAction = acoes.enviar.bind(null, casoId);
  const [rows, setRows] = useState<LinhaAnexo[]>([]);
  const [erros, setErros] = useState<Record<string, string | undefined>>({});
  // Depois de cada envio (o form é resetado pelo React), as linhas somem —
  // as coladas não podem ser reenviadas por engano.
  const [state, formAction, isPending] = useActionState(async (prev: EnviarAnexoState, formData: FormData) => {
    const resultado = await enviarAnexoAction(prev, formData);
    setRows([]);
    setErros({});
    return resultado;
  }, initialState);
  const [avisoColar, setAvisoColar] = useState<string | undefined>();

  const adicionarRow = () => setRows((prev) => [...prev, { id: crypto.randomUUID() }]);
  const removerRow = (rowId: string) => {
    setRows((prev) => prev.filter((row) => row.id !== rowId));
    setErros((prev) => {
      const { [rowId]: _removido, ...resto } = prev;
      return resto;
    });
  };

  // Ctrl+V de imagem na página do protocolo (fora de campo de texto) ou na
  // área "Cole imagens aqui": cada imagem vira uma linha, como o + Adicionar.
  useEffect(() => {
    const aoColar = async (evento: ClipboardEvent) => {
      if (ehCampoDeTexto(evento.target)) return;
      const coladas = imagensDaAreaDeTransferencia(evento.clipboardData, ANEXO_IMAGEM_MIME_TYPES);
      if (coladas.length === 0) return;
      evento.preventDefault();

      const comprimidas = await Promise.all(coladas.map((f) => comprimirImagem(f)));
      const aceitas = comprimidas.filter((f) => f.size <= ANEXO_TAMANHO_MAXIMO_BYTES);
      setAvisoColar(aceitas.length < comprimidas.length ? "Imagem maior que 10 MB não foi adicionada." : undefined);
      if (aceitas.length > 0) setRows((prev) => [...prev, ...aceitas.map((colada) => ({ id: crypto.randomUUID(), colada }))]);
    };
    document.addEventListener("paste", aoColar);
    return () => document.removeEventListener("paste", aoColar);
  }, []);

  const bloquearSeInvalido = (event: React.FormEvent<HTMLFormElement>) => {
    if (Object.values(erros).some(Boolean)) {
      event.preventDefault();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Anexos</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {anexos.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum anexo enviado ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {anexos.map((a) => {
              const tipo = tipoVisualAnexo(a.nome_arquivo);
              const Icone = ICONE_ANEXO[tipo];
              return (
                <li key={a.id} className="flex items-center justify-between gap-2 rounded-md border p-2" data-testid="anexo" data-tipo={tipo}>
                  <div className="flex items-center gap-2">
                    <Icone className="text-muted-foreground size-5 shrink-0" aria-label={ROTULO_ICONE[tipo]} role="img" />
                    <div className="flex min-w-0 flex-col">
                      <span className="text-sm font-medium">{a.nome_arquivo}</span>
                      <LinhaInfoAnexo
                        casoId={casoId}
                        anexo={a}
                        podeEditar={Boolean(acoes.editarComentario) && (podeGerenciarCaso || a.enviado_por === usuarioId)}
                        editar={acoes.editarComentario ?? editarComentarioAnexo}
                      />
                    </div>
                  </div>
                  {tipo === "html" ? <BotaoAbrirHtml casoId={casoId} anexo={a} /> : <BotaoDownload anexo={a} gerarUrl={acoes.gerarUrl} />}
                </li>
              );
            })}
          </ul>
        )}

        <form action={formAction} onSubmit={bloquearSeInvalido} className="@container flex flex-col gap-3 border-t pt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Adicionar anexo</span>
            <Button type="button" variant="outline" size="sm" onClick={adicionarRow}>
              <Plus /> Adicionar
            </Button>
          </div>

          <div
            tabIndex={0}
            className="text-muted-foreground focus-visible:ring-ring flex items-center gap-2 rounded-md border border-dashed p-3 text-sm outline-none focus-visible:ring-2"
            aria-label="Área para colar imagens"
          >
            <ClipboardPaste className="size-4 shrink-0" />
            <span>
              Cole imagens aqui (Ctrl+V) — prints de tela, JPG, PNG ou WebP, até 10 MB cada. Também funciona em qualquer
              ponto da página fora de um campo de texto.
            </span>
          </div>
          {avisoColar && <p className="text-destructive text-xs">{avisoColar}</p>}

          {rows.map((row) => (
            <div key={row.id} className={CLASSE_LINHA_ANEXO} data-testid="linha-novo-anexo">
              <div className="flex flex-col gap-1">
                {row.colada ? (
                  <>
                    <input
                      type="file"
                      name="anexoArquivo"
                      hidden
                      tabIndex={-1}
                      aria-hidden
                      ref={(input) => definirArquivoNoInput(input, row.colada!)}
                    />
                    <span className="text-sm">{row.colada.name}</span>
                    <PreviaAnexo arquivo={row.colada} />
                  </>
                ) : (
                  <CampoArquivoAnexo onErro={(erro) => setErros((prev) => ({ ...prev, [row.id]: erro }))} />
                )}
                {erros[row.id] && <p className="text-destructive text-sm">{erros[row.id]}</p>}
              </div>
              <Select name="anexoTipo" defaultValue="outro">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ANEXO_TIPOS_DOCUMENTO.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ANEXO_TIPO_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <CampoComentarioAnexo />
              <Button type="button" variant="ghost" size="icon" aria-label="Remover anexo" onClick={() => removerRow(row.id)}>
                <Trash2 />
              </Button>
            </div>
          ))}

          {rows.length > 0 && (
            <Button type="submit" disabled={isPending} className="w-fit">
              {isPending ? "Enviando..." : "Enviar anexos"}
            </Button>
          )}

          {state.avisos && (
            <ul className="text-destructive list-disc pl-4 text-sm">
              {state.avisos.map((aviso) => (
                <li key={aviso}>{aviso}</li>
              ))}
            </ul>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
