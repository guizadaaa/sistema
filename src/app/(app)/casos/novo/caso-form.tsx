"use client";

import { useActionState, useId, useState, type FocusEvent, type FormEvent } from "react";
import { FileText, Paperclip, Plus, Trash2, User } from "lucide-react";

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
  FILIAIS,
  MOTIVOS_CASO,
  tiposCasoPermitidos,
} from "@/lib/validation/caso";
import type { PerfilUsuario, TipoCaso } from "@/lib/supabase/types";

import { criarCaso, type CasoFormValores, type CriarCasoState } from "./actions";

const initialState: CriarCasoState = {};

const FILIAIS_VALIDAS: readonly string[] = FILIAIS;

function FieldError({ mensagem }: { mensagem?: string }) {
  if (!mensagem) return null;
  return <p className="text-destructive text-sm">{mensagem}</p>;
}

function SectionTitle({ icon: Icon, children }: { icon: typeof User; children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
      <Icon className="size-3.5" />
      {children}
    </p>
  );
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

export function CasoForm({
  donosElegiveis,
  perfilUsuario,
}: {
  donosElegiveis: DonoElegivel[];
  perfilUsuario: PerfilUsuario;
}) {
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
          {state.sucesso.avisosContratos && (
            <ul className="text-destructive text-sm list-disc pl-4">
              {state.sucesso.avisosContratos.map((aviso) => (
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
          perfilUsuario={perfilUsuario}
        />
      </CardContent>
    </Card>
  );
}

type CampoObrigatorio = keyof CasoFormValores;

function CasoFormCampos({
  state,
  formAction,
  isPending,
  donosElegiveis,
  perfilUsuario,
}: {
  state: CriarCasoState;
  formAction: (formData: FormData) => void;
  isPending: boolean;
  donosElegiveis: DonoElegivel[];
  perfilUsuario: PerfilUsuario;
}) {
  const tiposDisponiveis = tiposCasoPermitidos(perfilUsuario);

  // Se o valor reidratado (ex.: após um erro do server action) não estiver
  // mais entre os tipos permitidos para este perfil, não pré-seleciona nada
  // — evita reexibir "Cancelamento" selecionado para quem não pode escolhê-lo.
  const tipoCasoInicial = state.valores?.tipoCaso as TipoCaso | undefined;
  const [tipoCaso, setTipoCaso] = useState<TipoCaso | "">(
    tipoCasoInicial && (tiposDisponiveis as readonly TipoCaso[]).includes(tipoCasoInicial) ? tipoCasoInicial : ""
  );
  const [vendedorDonoId, setVendedorDonoId] = useState(
    state.valores?.vendedorDono ?? donosElegiveis[0]?.id ?? ""
  );
  const [cpfMascarado, setCpfMascarado] = useState(formatarCpf(state.valores?.clienteCpf ?? ""));
  const [contratoNumero, setContratoNumero] = useState(
    somenteDigitos(state.valores?.contratoNumero ?? "").slice(0, 14)
  );
  const [errosLocais, setErrosLocais] = useState<Partial<Record<CampoObrigatorio, string>>>({});
  const [anexoRows, setAnexoRows] = useState<string[]>([]);
  const [anexoErros, setAnexoErros] = useState<Record<string, string | undefined>>({});
  const anexoIdBase = useId();
  const [contratoAdicionalRows, setContratoAdicionalRows] = useState<string[]>([]);
  const [contratoAdicionalValores, setContratoAdicionalValores] = useState<Record<string, string>>({});
  const [contratoAdicionalErros, setContratoAdicionalErros] = useState<Record<string, string | undefined>>({});
  const contratoAdicionalIdBase = useId();

  const setErroLocal = (campo: CampoObrigatorio, mensagem: string | undefined) =>
    setErrosLocais((prev) => ({ ...prev, [campo]: mensagem }));

  const adicionarAnexoRow = () =>
    setAnexoRows((prev) => [...prev, `${anexoIdBase}-${prev.length}-${Date.now()}`]);

  const removerAnexoRow = (rowId: string) => {
    setAnexoRows((prev) => prev.filter((id) => id !== rowId));
    setAnexoErros((prev) => {
      const { [rowId]: _removido, ...resto } = prev;
      return resto;
    });
  };

  // Contratos adicionais não passam pela derivação de filial (só o contrato
  // principal faz isso, via set_caso_defaults) — validação é só o formato,
  // sem checagem de prefixo de filial.
  const validarContratoAdicional = (valor: string): string | undefined => {
    if (valor.length === 0) return "Informe o número do contrato ou remova esta linha";
    if (valor.length < 14) return "Contrato deve ter exatamente 14 números";
    return undefined;
  };

  const adicionarContratoAdicionalRow = () =>
    setContratoAdicionalRows((prev) => [...prev, `${contratoAdicionalIdBase}-${prev.length}-${Date.now()}`]);

  const removerContratoAdicionalRow = (rowId: string) => {
    setContratoAdicionalRows((prev) => prev.filter((id) => id !== rowId));
    setContratoAdicionalValores((prev) => {
      const { [rowId]: _removido, ...resto } = prev;
      return resto;
    });
    setContratoAdicionalErros((prev) => {
      const { [rowId]: _removido, ...resto } = prev;
      return resto;
    });
  };

  // Dono sem filial própria (adm/adm_master): a filial do caso é derivada do
  // prefixo do contrato (ver set_caso_defaults no banco), então o contrato
  // só é válido se os 4 primeiros dígitos forem um código de filial real.
  const donoSelecionado = donosElegiveis.find((d) => d.id === vendedorDonoId);
  const donoSemFilial = donoSelecionado ? donoSelecionado.filial === null : false;

  const validarContrato = (valor: string, semFilial: boolean): string | undefined => {
    if (valor.length === 0) return undefined;
    if (valor.length < 14) return "Contrato deve ter exatamente 14 números";
    if (semFilial && !FILIAIS_VALIDAS.includes(valor.slice(0, 4))) {
      return "O número de contrato não começa com um código de filial válido (1710, 1714 ou 1730).";
    }
    return undefined;
  };

  const validarCpf = (valorMascarado: string): string | undefined => {
    const digitos = somenteDigitos(valorMascarado);
    if (digitos.length === 0) return undefined;
    if (digitos.length < 11) return "CPF deve ter 11 dígitos";
    if (!cpfValido(valorMascarado)) return "CPF inválido";
    return undefined;
  };

  // Validação por campo assim que o usuário sai dele (blur) — feedback
  // imediato sem esperar o submit do formulário inteiro. O server action
  // continua validando de novo (zod + constraints do banco); isto é só UX.
  const validarObrigatorioAoSair =
    (campo: CampoObrigatorio, mensagem: string) => (event: FocusEvent<HTMLElement>) => {
      const valor = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
      setErroLocal(campo, valor.trim() === "" ? mensagem : undefined);
    };

  const validarContratoAoSair = () => {
    setErroLocal(
      "contratoNumero",
      contratoNumero.length === 0 ? "Informe o número do contrato" : validarContrato(contratoNumero, donoSemFilial)
    );
  };

  const validarCpfAoSair = () => {
    const digitos = somenteDigitos(cpfMascarado);
    setErroLocal("clienteCpf", digitos.length === 0 ? "Informe o CPF do cliente" : validarCpf(cpfMascarado));
  };

  // Feedback imediato (CPF, contrato e anexos) sem esperar o round-trip do
  // server action — que continua validando de novo do lado do servidor
  // (nunca confiar só na validação do client num sistema que guarda CPF e
  // recebe upload de documentos).
  const validarAntesDeEnviar = (event: FormEvent<HTMLFormElement>) => {
    const cpf = String(new FormData(event.currentTarget).get("clienteCpf") ?? "");
    if (!cpfValido(cpf)) {
      event.preventDefault();
      setErroLocal("clienteCpf", "CPF inválido");
      return;
    }
    setErroLocal("clienteCpf", undefined);

    const erroContrato = validarContrato(contratoNumero, donoSemFilial);
    if (contratoNumero.length !== 14 || erroContrato) {
      event.preventDefault();
      setErroLocal("contratoNumero", erroContrato ?? "Contrato deve ter exatamente 14 números");
      return;
    }
    setErroLocal("contratoNumero", undefined);

    if (Object.values(anexoErros).some(Boolean)) {
      event.preventDefault();
    }

    if (Object.values(contratoAdicionalErros).some(Boolean)) {
      event.preventDefault();
    }
  };

  const exigeMotivoDescricao = tipoCaso === "alteracao_data" || tipoCaso === "cancelamento";
  const exigeSoDescricao = tipoCaso === "recadastro_sem_reserva";
  const exigeInadimplencia = tipoCaso === "inadimplencia";

  return (
    <form action={formAction} onSubmit={validarAntesDeEnviar} className="flex flex-col gap-4">
      <div className="flex flex-col gap-4">
        <SectionTitle icon={User}>Dados do cliente</SectionTitle>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="clienteNome">Nome completo do contratante</Label>
            <Input
              id="clienteNome"
              name="clienteNome"
              required
              defaultValue={state.valores?.clienteNome}
              aria-invalid={Boolean(errosLocais.clienteNome || state.fieldErrors?.clienteNome)}
              onBlur={validarObrigatorioAoSair("clienteNome", "Informe o nome completo do contratante")}
            />
            <FieldError mensagem={errosLocais.clienteNome ?? state.fieldErrors?.clienteNome} />
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
              aria-invalid={Boolean(errosLocais.clienteCpf || state.fieldErrors?.clienteCpf)}
              onChange={(e) => {
                const novoValor = formatarCpf(e.target.value);
                setCpfMascarado(novoValor);
                setErroLocal("clienteCpf", validarCpf(novoValor));
              }}
              onBlur={validarCpfAoSair}
            />
            <FieldError mensagem={errosLocais.clienteCpf ?? state.fieldErrors?.clienteCpf} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 border-t pt-4">
        <SectionTitle icon={FileText}>Detalhes do caso</SectionTitle>
      {donosElegiveis.length > 1 && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="vendedorDono">Dono do caso</Label>
          <Select
            name="vendedorDono"
            value={vendedorDonoId}
            onValueChange={(v) => {
              setVendedorDonoId(v);
              const novoDono = donosElegiveis.find((d) => d.id === v);
              // A troca de dono pode mudar se o contrato precisa ter um
              // prefixo de filial válido — revalida com o que já foi digitado.
              if (contratoNumero.length > 0) {
                setErroLocal("contratoNumero", validarContrato(contratoNumero, novoDono?.filial === null));
              }
            }}
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
        <Select
          name="tipoCaso"
          required
          value={tipoCaso}
          onValueChange={(v) => {
            setTipoCaso(v as TipoCaso);
            setErroLocal("tipoCaso", undefined);
          }}
        >
          <SelectTrigger
            id="tipoCaso"
            onBlur={() => setErroLocal("tipoCaso", tipoCaso === "" ? "Selecione o tipo de caso" : undefined)}
          >
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            {tiposDisponiveis.map((t) => (
              <SelectItem key={t} value={t}>
                {TIPO_CASO_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError mensagem={errosLocais.tipoCaso ?? state.fieldErrors?.tipoCaso} />
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
            aria-invalid={Boolean(errosLocais.contratoNumero || state.fieldErrors?.contratoNumero)}
            onChange={(e) => {
              const novoValor = somenteDigitos(e.target.value).slice(0, 14);
              setContratoNumero(novoValor);
              setErroLocal("contratoNumero", validarContrato(novoValor, donoSemFilial));
            }}
            onBlur={validarContratoAoSair}
          />
          <FieldError mensagem={errosLocais.contratoNumero ?? state.fieldErrors?.contratoNumero} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="prazoVigencia">Prazo de vigência</Label>
          <Input
            id="prazoVigencia"
            name="prazoVigencia"
            type="date"
            max="9999-12-31"
            required
            defaultValue={state.valores?.prazoVigencia}
            aria-invalid={Boolean(errosLocais.prazoVigencia || state.fieldErrors?.prazoVigencia)}
            onBlur={validarObrigatorioAoSair("prazoVigencia", "Informe o prazo de vigência")}
          />
          <FieldError mensagem={errosLocais.prazoVigencia ?? state.fieldErrors?.prazoVigencia} />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Label>Contratos adicionais (opcional)</Label>
          <Button type="button" variant="outline" size="sm" onClick={adicionarContratoAdicionalRow}>
            <Plus /> Adicionar contrato
          </Button>
        </div>

        {contratoAdicionalRows.map((rowId) => (
          <div key={rowId} className="grid grid-cols-[1fr_auto] items-start gap-2">
            <div className="flex flex-col gap-1">
              <Input
                inputMode="numeric"
                maxLength={14}
                name="contratoAdicional"
                placeholder="Número do contrato"
                value={contratoAdicionalValores[rowId] ?? ""}
                aria-invalid={Boolean(contratoAdicionalErros[rowId])}
                onChange={(e) => {
                  const novoValor = somenteDigitos(e.target.value).slice(0, 14);
                  setContratoAdicionalValores((prev) => ({ ...prev, [rowId]: novoValor }));
                  setContratoAdicionalErros((prev) => ({ ...prev, [rowId]: validarContratoAdicional(novoValor) }));
                }}
              />
              {contratoAdicionalErros[rowId] && (
                <p className="text-destructive text-sm">{contratoAdicionalErros[rowId]}</p>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remover contrato adicional"
              onClick={() => removerContratoAdicionalRow(rowId)}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>

      {exigeMotivoDescricao && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="motivo">Motivo</Label>
          <Select
            name="motivo"
            required
            defaultValue={state.valores?.motivo}
            onValueChange={() => setErroLocal("motivo", undefined)}
          >
            <SelectTrigger
              id="motivo"
              onBlur={(e) =>
                setErroLocal(
                  "motivo",
                  (e.target as HTMLButtonElement).getAttribute("data-placeholder") !== null
                    ? "Selecione o motivo"
                    : undefined
                )
              }
            >
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
          <FieldError mensagem={errosLocais.motivo ?? state.fieldErrors?.motivo} />
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
            aria-invalid={Boolean(errosLocais.descricao || state.fieldErrors?.descricao)}
            onBlur={validarObrigatorioAoSair("descricao", "Descrição obrigatória")}
          />
          <FieldError mensagem={errosLocais.descricao ?? state.fieldErrors?.descricao} />
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
              aria-invalid={Boolean(errosLocais.parcelasEmAberto || state.fieldErrors?.parcelasEmAberto)}
              onBlur={validarObrigatorioAoSair("parcelasEmAberto", "Informe as parcelas em aberto")}
            />
            <FieldError mensagem={errosLocais.parcelasEmAberto ?? state.fieldErrors?.parcelasEmAberto} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="dataCancelamento">Data de cancelamento</Label>
            <Input
              id="dataCancelamento"
              name="dataCancelamento"
              type="date"
              max="9999-12-31"
              required
              defaultValue={state.valores?.dataCancelamento}
              aria-invalid={Boolean(errosLocais.dataCancelamento || state.fieldErrors?.dataCancelamento)}
              onBlur={validarObrigatorioAoSair("dataCancelamento", "Informe a data de cancelamento")}
            />
            <FieldError mensagem={errosLocais.dataCancelamento ?? state.fieldErrors?.dataCancelamento} />
          </div>
        </div>
      )}
      </div>

      <div className="flex flex-col gap-4 border-t pt-4">
        <SectionTitle icon={Paperclip}>Anexos</SectionTitle>
        <div className="flex flex-col gap-3">
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
      </div>

      {state.error && !state.fieldErrors && <p className="text-destructive text-sm">{state.error}</p>}

      <Button type="submit" disabled={isPending} className="mt-2">
        {isPending ? "Salvando..." : "Registrar caso"}
      </Button>
    </form>
  );
}
