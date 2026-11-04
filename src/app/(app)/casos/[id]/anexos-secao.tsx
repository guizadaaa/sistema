"use client";

import { useActionState, useEffect, useState } from "react";
import { ClipboardPaste, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ANEXO_TIPO_LABELS } from "@/lib/labels";
import { imagensDaAreaDeTransferencia } from "@/lib/colar-imagem";
import { comprimirImagem } from "@/lib/comprimir-imagem";
import { ANEXO_IMAGEM_MIME_TYPES, ANEXO_TAMANHO_MAXIMO_BYTES, ANEXO_TIPOS_DOCUMENTO } from "@/lib/validation/caso";
import type { Database } from "@/lib/supabase/types";

import { CampoArquivoAnexo, definirArquivoNoInput, PreviaAnexo } from "../campo-arquivo-anexo";
import { enviarAnexoAoCaso, gerarUrlAssinadaAnexo, type EnviarAnexoState } from "./actions";

type AnexoRow = Database["public"]["Tables"]["anexos"]["Row"];

type AcoesAnexos = { enviar: typeof enviarAnexoAoCaso; gerarUrl: typeof gerarUrlAssinadaAnexo };

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
  acoes = { enviar: enviarAnexoAoCaso, gerarUrl: gerarUrlAssinadaAnexo },
}: {
  casoId: string;
  anexos: AnexoRow[];
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
            {anexos.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{a.nome_arquivo}</span>
                  <span className="text-muted-foreground text-xs">
                    {ANEXO_TIPO_LABELS[a.tipo_documento]} · {new Date(a.enviado_em).toLocaleDateString("pt-BR")}
                  </span>
                </div>
                <BotaoDownload anexo={a} gerarUrl={acoes.gerarUrl} />
              </li>
            ))}
          </ul>
        )}

        <form action={formAction} onSubmit={bloquearSeInvalido} className="flex flex-col gap-3 border-t pt-4">
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
            <div key={row.id} className="grid grid-cols-[1fr_1fr_auto] items-start gap-2">
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
