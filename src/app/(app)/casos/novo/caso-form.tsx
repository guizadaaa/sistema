"use client";

import { useActionState, useId, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ANEXO_TIPO_LABELS, MOTIVO_LABELS, TIPO_CASO_LABELS } from "@/lib/labels";
import type { DonoElegivel } from "@/lib/casos/dono-elegivel";
import { cpfValido, formatarCpf, somenteDigitos } from "@/lib/validation/cpf";
import {
  ANEXO_MIME_TYPES,
  ANEXO_TAMANHO_MAXIMO_BYTES,
  ANEXO_TIPOS_DOCUMENTO,
  MOTIVOS_CASO,
  TIPOS_CASO,
} from "@/lib/validation/caso";
import type { TipoCaso } from "@/lib/supabase/types";

import { criarCaso, type CriarCasoState } from "./actions";

const initialState: CriarCasoState = {};

function FieldError({ mensagem }: { mensagem?: string }) {
  if (!mensagem) return null;
  return <p className="text-destructive text-sm">{mensagem}</p>;
}

function validarArquivoAnexo(arquivo: File): string | undefined {
  if (!(ANEXO_MIME_TYPES as readonly string[]).includes(arquivo.type)) {
    return "Formato não permitido (só PDF, JPG ou PNG)";
  }
  if (arquivo.size > ANEXO_TAMANHO_MAXIMO_BYTES) {
    return "Arquivo maior que 10 MB";
  }
  return undefined;
}

export function CasoForm({ donosElegiveis }: { donosElegiveis: DonoElegivel[] }) {
  const [state, formAction, isPending] = useActionState(criarCaso, initialState);

  if (state.sucesso) {
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Caso registrado</CardTitle>
          <CardDescription>Protocolo nº {state.sucesso.protocolo}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {state.sucesso.avisosAnexos && (
            <ul className="text-destructive text-sm list-disc pl-4">
              {state.sucesso.avisosAnexos.map((aviso) => (
                <li key={aviso}>{aviso}</li>
              ))}
            </ul>
          )}
          <Button onClick={() => window.location.reload()} className="w-fit">
            Registrar outro caso
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Adicionar caso</CardTitle>
        <CardDescription>Preencha os dados do caso operacional</CardDescription>
      </CardHeader>
      <CardContent>
        {/*
          Uma ação do servidor que atualiza cookies (renovação de sessão, o
          que acontece em praticamente toda chamada autenticada) faz este
          formulário remontar quando o resultado chega — mesmo sem nenhuma
          navegação de verdade — mas o hook useActionState desta remontagem
          herda o `state` correto, enquanto um useState comum criado dentro
          dela não reinicializa de forma confiável a partir desse `state`.
          A chave abaixo, derivada do próprio `state`, força uma remontagem
          explícita e correta do bloco de campos sempre que um novo envio é
          resolvido (sucesso ou erro) — mas nunca enquanto o usuário só está
          digitando, já que `state` não muda até o próximo submit.
        */}
        <CasoFormCampos
          key={JSON.stringify(state)}
          state={state}
          formAction={formAction}
          isPending={isPending}
          donosElegiveis={donosElegiveis}
        />
      </CardContent>
    </Card>
  );
}

function CasoFormCampos({
  state,
  formAction,
  isPending,
  donosElegiveis,
}: {
  state: CriarCasoState;
  formAction: (formData: FormData) => void;
  isPending: boolean;
  donosElegiveis: DonoElegivel[];
}) {
  const [tipoCaso, setTipoCaso] = useState<TipoCaso | "">(
    (state.valores?.tipoCaso as TipoCaso | undefined) ?? ""
  );
  const [cpfMascarado, setCpfMascarado] = useState(formatarCpf(state.valores?.clienteCpf ?? ""));
  const [contratoNumero, setContratoNumero] = useState(
    somenteDigitos(state.valores?.contratoNumero ?? "").slice(0, 14)
  );
  const [cpfError, setCpfError] = useState<string | undefined>();
  const [contratoError, setContratoError] = useState<string | undefined>();
  const [anexoRows, setAnexoRows] = useState<string[]>([]);
  const [anexoErros, setAnexoErros] = useState<Record<string, string | undefined>>({});
  const anexoIdBase = useId();

  const adicionarAnexoRow = () =>
    setAnexoRows((prev) => [...prev, `${anexoIdBase}-${prev.length}-${Date.now()}`]);

  const removerAnexoRow = (rowId: string) => {
    setAnexoRows((prev) => prev.filter((id) => id !== rowId));
    setAnexoErros((prev) => {
      const { [rowId]: _removido, ...resto } = prev;
      return resto;
    });
  };

  // Feedback imediato (CPF, contrato e anexos) sem esperar o round-trip do
  // server action — que continua validando de novo do lado do servidor
  // (nunca confiar só na validação do client num sistema que guarda CPF e
  // recebe upload de documentos).
  const validarAntesDeEnviar = (event: FormEvent<HTMLFormElement>) => {
    const cpf = String(new FormData(event.currentTarget).get("clienteCpf") ?? "");
    if (!cpfValido(cpf)) {
      event.preventDefault();
      setCpfError("CPF inválido");
      return;
    }
    setCpfError(undefined);

    if (contratoNumero.length !== 14) {
      event.preventDefault();
      setContratoError("Contrato deve ter exatamente 14 números");
      return;
    }
    setContratoError(undefined);

    if (Object.values(anexoErros).some(Boolean)) {
      event.preventDefault();
    }
  };

  const exigeMotivoDescricao = tipoCaso === "alteracao_data" || tipoCaso === "cancelamento";
  const exigeSoDescricao = tipoCaso === "recadastro_sem_reserva";
  const exigeInadimplencia = tipoCaso === "inadimplencia";

  return (
    <form action={formAction} onSubmit={validarAntesDeEnviar} className="flex flex-col gap-4">
      {donosElegiveis.length > 1 && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="vendedorDono">Dono do caso</Label>
          <Select
            name="vendedorDono"
            defaultValue={state.valores?.vendedorDono ?? donosElegiveis[0]?.id}
            required
          >
            <SelectTrigger id="vendedorDono">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {donosElegiveis.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.nome_completo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError mensagem={state.fieldErrors?.vendedorDono} />
        </div>
      )}
      {donosElegiveis.length === 1 && (
        <input type="hidden" name="vendedorDono" value={donosElegiveis[0]?.id} />
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="tipoCaso">Tipo de caso</Label>
        <Select name="tipoCaso" required value={tipoCaso} onValueChange={(v) => setTipoCaso(v as TipoCaso)}>
          <SelectTrigger id="tipoCaso">
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            {TIPOS_CASO.map((t) => (
              <SelectItem key={t} value={t}>
                {TIPO_CASO_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError mensagem={state.fieldErrors?.tipoCaso} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="contratoNumero">Contrato</Label>
          <Input
            id="contratoNumero"
            name="contratoNumero"
            inputMode="numeric"
            maxLength={14}
            required
            value={contratoNumero}
            aria-invalid={Boolean(contratoError || state.fieldErrors?.contratoNumero)}
            onChange={(e) => {
              setContratoNumero(somenteDigitos(e.target.value).slice(0, 14));
              setContratoError(undefined);
            }}
          />
          <FieldError mensagem={contratoError ?? state.fieldErrors?.contratoNumero} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="prazoVigencia">Prazo de vigência</Label>
          <Input
            id="prazoVigencia"
            name="prazoVigencia"
            type="date"
            required
            defaultValue={state.valores?.prazoVigencia}
            aria-invalid={Boolean(state.fieldErrors?.prazoVigencia)}
          />
          <FieldError mensagem={state.fieldErrors?.prazoVigencia} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="clienteNome">Nome completo do contratante</Label>
          <Input
            id="clienteNome"
            name="clienteNome"
            required
            defaultValue={state.valores?.clienteNome}
            aria-invalid={Boolean(state.fieldErrors?.clienteNome)}
          />
          <FieldError mensagem={state.fieldErrors?.clienteNome} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="clienteCpf">CPF do cliente</Label>
          <Input
            id="clienteCpf"
            name="clienteCpf"
            inputMode="numeric"
            maxLength={14}
            required
            value={cpfMascarado}
            aria-invalid={Boolean(cpfError || state.fieldErrors?.clienteCpf)}
            onChange={(e) => {
              setCpfMascarado(formatarCpf(e.target.value));
              if (cpfError) setCpfError(undefined);
            }}
          />
          <FieldError mensagem={cpfError ?? state.fieldErrors?.clienteCpf} />
        </div>
      </div>

      {exigeMotivoDescricao && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="motivo">Motivo</Label>
          <Select name="motivo" required defaultValue={state.valores?.motivo}>
            <SelectTrigger id="motivo">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {MOTIVOS_CASO.map((m) => (
                <SelectItem key={m} value={m}>
                  {MOTIVO_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError mensagem={state.fieldErrors?.motivo} />
        </div>
      )}

      {(exigeMotivoDescricao || exigeSoDescricao) && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="descricao">Descrição</Label>
          <Textarea
            id="descricao"
            name="descricao"
            required
            rows={4}
            defaultValue={state.valores?.descricao}
            aria-invalid={Boolean(state.fieldErrors?.descricao)}
          />
          <FieldError mensagem={state.fieldErrors?.descricao} />
        </div>
      )}

      {exigeInadimplencia && (
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="parcelasEmAberto">Parcelas em aberto</Label>
            <Input
              id="parcelasEmAberto"
              name="parcelasEmAberto"
              type="number"
              min={1}
              step={1}
              required
              defaultValue={state.valores?.parcelasEmAberto}
              aria-invalid={Boolean(state.fieldErrors?.parcelasEmAberto)}
            />
            <FieldError mensagem={state.fieldErrors?.parcelasEmAberto} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="dataCancelamento">Data de cancelamento</Label>
            <Input
              id="dataCancelamento"
              name="dataCancelamento"
              type="date"
              required
              defaultValue={state.valores?.dataCancelamento}
              aria-invalid={Boolean(state.fieldErrors?.dataCancelamento)}
            />
            <FieldError mensagem={state.fieldErrors?.dataCancelamento} />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 border-t pt-4">
        <div className="flex items-center justify-between">
          <Label>Anexos (opcional)</Label>
          <Button type="button" variant="outline" size="sm" onClick={adicionarAnexoRow}>
            <Plus /> Adicionar anexo
          </Button>
        </div>

        {anexoRows.map((rowId) => (
          <div key={rowId} className="grid grid-cols-[1fr_1fr_auto] items-start gap-2">
            <div className="flex flex-col gap-1">
              <Input
                type="file"
                name="anexoArquivo"
                accept={ANEXO_MIME_TYPES.join(",")}
                aria-invalid={Boolean(anexoErros[rowId])}
                onChange={(e) => {
                  const arquivo = e.target.files?.[0];
                  setAnexoErros((prev) => ({
                    ...prev,
                    [rowId]: arquivo ? validarArquivoAnexo(arquivo) : undefined,
                  }));
                }}
              />
              {anexoErros[rowId] && <p className="text-destructive text-sm">{anexoErros[rowId]}</p>}
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
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remover anexo"
              onClick={() => removerAnexoRow(rowId)}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>

      {state.error && !state.fieldErrors && <p className="text-destructive text-sm">{state.error}</p>}

      <Button type="submit" disabled={isPending} className="mt-2">
        {isPending ? "Salvando..." : "Registrar caso"}
      </Button>
    </form>
  );
}
