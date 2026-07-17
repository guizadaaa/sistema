"use client";

import { useActionState, useMemo, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ANEXO_TIPO_LABELS, SUBTIPO_REEMBOLSO_LABELS, SUBTIPO_REMARCACAO_LABELS, TIPO_DESFECHO_LABELS } from "@/lib/labels";
import { cpfValido } from "@/lib/validation/cpf";
import {
  ORIGENS_REEMBOLSO_INTEGRAL,
  SUBTIPOS_REEMBOLSO,
  SUBTIPOS_REMARCACAO,
  TIPOS_DESFECHO,
  anexoObrigatorioFaltando,
} from "@/lib/validation/desfecho";
import type { OrigemReembolsoIntegral, SubtipoReembolso, SubtipoRemarcacao, TipoDesfecho, TipoDocumentoAnexo } from "@/lib/supabase/types";

import { registrarDesfecho, type RegistrarDesfechoState } from "./actions";

const initialState: RegistrarDesfechoState = {};

export function DesfechoForm({ casoId, tiposAnexosExistentes }: { casoId: string; tiposAnexosExistentes: TipoDocumentoAnexo[] }) {
  const registrarAction = registrarDesfecho.bind(null, casoId);
  const [state, formAction, isPending] = useActionState(registrarAction, initialState);

  const [tipo, setTipo] = useState<TipoDesfecho | "">("");
  const [subtipoReembolso, setSubtipoReembolso] = useState<SubtipoReembolso | "">("");
  const [origemIntegral, setOrigemIntegral] = useState<OrigemReembolsoIntegral | "">("");
  const [subtipoRemarcacao, setSubtipoRemarcacao] = useState<SubtipoRemarcacao | "">("");
  const [cpfError, setCpfError] = useState<string | undefined>();

  const avisoAnexo = useMemo(() => {
    if (tipo === "reembolso" && subtipoReembolso) {
      return anexoObrigatorioFaltando(
        { tipo: "reembolso", subtipoReembolso, origemReembolsoIntegral: origemIntegral || undefined },
        tiposAnexosExistentes
      );
    }
    if (tipo === "remarcacao" && subtipoRemarcacao) {
      return anexoObrigatorioFaltando({ tipo: "remarcacao", subtipoRemarcacao }, tiposAnexosExistentes);
    }
    return null;
  }, [tipo, subtipoReembolso, origemIntegral, subtipoRemarcacao, tiposAnexosExistentes]);

  const exigeBanco = tipo === "reembolso" && subtipoReembolso && subtipoReembolso !== "sem_reembolso";
  const exigeOrigem = tipo === "reembolso" && subtipoReembolso === "integral";
  const exigeValorRemarcacao = tipo === "remarcacao" && subtipoRemarcacao === "com_custo";

  const validarAntesDeEnviar = (event: FormEvent<HTMLFormElement>) => {
    if (avisoAnexo) {
      event.preventDefault();
      return;
    }
    if (exigeBanco) {
      const cpf = String(new FormData(event.currentTarget).get("bancoCpf") ?? "");
      if (!cpfValido(cpf)) {
        event.preventDefault();
        setCpfError("CPF inválido");
        return;
      }
    }
    setCpfError(undefined);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrar desfecho</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} onSubmit={validarAntesDeEnviar} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="tipo">Tipo de desfecho</Label>
            <Select name="tipo" required value={tipo} onValueChange={(v) => setTipo(v as TipoDesfecho)}>
              <SelectTrigger id="tipo" className="w-64">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_DESFECHO.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TIPO_DESFECHO_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {tipo === "reembolso" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="subtipoReembolso">Subtipo</Label>
              <Select
                name="subtipoReembolso"
                required
                value={subtipoReembolso}
                onValueChange={(v) => setSubtipoReembolso(v as SubtipoReembolso)}
              >
                <SelectTrigger id="subtipoReembolso" className="w-64">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {SUBTIPOS_REEMBOLSO.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SUBTIPO_REEMBOLSO_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {exigeOrigem && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="origemReembolsoIntegral">Origem</Label>
              <Select
                name="origemReembolsoIntegral"
                required
                value={origemIntegral}
                onValueChange={(v) => setOrigemIntegral(v as OrigemReembolsoIntegral)}
              >
                <SelectTrigger id="origemReembolsoIntegral" className="w-64">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {ORIGENS_REEMBOLSO_INTEGRAL.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o === "fornecedor" ? "Fornecedor" : "Saúde"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {avisoAnexo && (
            <p className="text-destructive text-sm">
              Anexe {avisoAnexo.map((t) => ANEXO_TIPO_LABELS[t]).join(" ou ")} ao caso antes de registrar este
              desfecho.
            </p>
          )}

          {exigeBanco && (
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="bancoNomeCompleto">Nome completo (banco)</Label>
                <Input id="bancoNomeCompleto" name="bancoNomeCompleto" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="bancoAgencia">Agência</Label>
                <Input id="bancoAgencia" name="bancoAgencia" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="bancoConta">Conta</Label>
                <Input id="bancoConta" name="bancoConta" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="bancoCpf">CPF do titular</Label>
                <Input
                  id="bancoCpf"
                  name="bancoCpf"
                  inputMode="numeric"
                  maxLength={14}
                  required
                  aria-invalid={Boolean(cpfError)}
                  onChange={() => cpfError && setCpfError(undefined)}
                />
                {cpfError && <p className="text-destructive text-sm">{cpfError}</p>}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="valor">Valor</Label>
                <Input id="valor" name="valor" type="number" step="0.01" min="0.01" required />
              </div>
            </div>
          )}

          {tipo === "remarcacao" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="subtipoRemarcacao">Subtipo</Label>
              <Select
                name="subtipoRemarcacao"
                required
                value={subtipoRemarcacao}
                onValueChange={(v) => setSubtipoRemarcacao(v as SubtipoRemarcacao)}
              >
                <SelectTrigger id="subtipoRemarcacao" className="w-64">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {SUBTIPOS_REMARCACAO.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SUBTIPO_REMARCACAO_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {exigeValorRemarcacao && (
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="valorTaxas">Valor das taxas</Label>
                <Input id="valorTaxas" name="valorTaxas" type="number" step="0.01" min="0" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="valorDiferencaTarifaria">Diferença tarifária</Label>
                <Input id="valorDiferencaTarifaria" name="valorDiferencaTarifaria" type="number" step="0.01" min="0" required />
              </div>
            </div>
          )}

          {tipo === "carta_credito" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="valor">Valor</Label>
              <Input id="valor" name="valor" type="number" step="0.01" min="0.01" required className="w-48" />
            </div>
          )}

          {state.error && <p className="text-destructive text-sm">{state.error}</p>}

          {tipo && (
            <Button type="submit" disabled={isPending} className="w-fit">
              {isPending ? "Salvando..." : "Registrar desfecho"}
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
