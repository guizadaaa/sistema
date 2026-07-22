"use client";

import { useActionState, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { iniciarConfiguracaoMfa, verificarCodigoMfa, type ConfirmarMfaState } from "../actions";
import { paraSrcQrCode } from "../qr-code";
import { SairLink } from "../sair-link";

const initialState: ConfirmarMfaState = {};

type DadosEnroll = { qrCode: string; secret: string; factorId: string };

function IniciarConfiguracao({ onIniciado }: { onIniciado: (dados: DadosEnroll) => void }) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | undefined>();

  const iniciar = () => {
    setErro(undefined);
    startTransition(async () => {
      const resultado = await iniciarConfiguracaoMfa();
      if (resultado.error || !resultado.qrCode || !resultado.secret || !resultado.factorId) {
        setErro(resultado.error ?? "Não foi possível iniciar a configuração.");
        return;
      }
      onIniciado({ qrCode: resultado.qrCode, secret: resultado.secret, factorId: resultado.factorId });
    });
  };

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Configurar autenticação em duas etapas</CardTitle>
        <CardDescription>
          Obrigatório para o seu perfil. Você vai precisar de um app autenticador no celular — Google
          Authenticator, Authy, 1Password ou similar.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {erro && <p className="text-destructive text-sm">{erro}</p>}
        <Button onClick={iniciar} disabled={isPending} className="w-fit">
          {isPending ? "Gerando..." : "Iniciar configuração"}
        </Button>
        <SairLink />
      </CardContent>
    </Card>
  );
}

function ConfirmarCodigo({ dados }: { dados: DadosEnroll }) {
  const verificarAction = verificarCodigoMfa.bind(null, dados.factorId, "/");
  const [state, formAction, isPending] = useActionState(verificarAction, initialState);

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Escaneie o QR code</CardTitle>
        <CardDescription>
          Abra o app autenticador, escaneie o código abaixo (ou digite o segredo manualmente) e informe o
          código de 6 dígitos gerado para confirmar.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- data: URI do Supabase, não um asset estático */}
        <img
          src={paraSrcQrCode(dados.qrCode)}
          alt="QR code para configurar o autenticador"
          width={200}
          height={200}
          className="self-center"
        />
        <div className="flex flex-col gap-1">
          <Label>Não conseguiu escanear? Digite o código manualmente:</Label>
          <code className="bg-muted rounded-md border px-2 py-1 text-sm break-all">{dados.secret}</code>
        </div>

        <form action={formAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="codigo">Código do app autenticador</Label>
            <Input
              id="codigo"
              name="codigo"
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              placeholder="000000"
              required
              autoFocus
            />
          </div>
          {state.error && <p className="text-destructive text-sm">{state.error}</p>}
          <Button type="submit" disabled={isPending} className="w-fit">
            {isPending ? "Confirmando..." : "Confirmar e ativar"}
          </Button>
        </form>
        <SairLink />
      </CardContent>
    </Card>
  );
}

export function ConfigurarMfaForm() {
  const [dados, setDados] = useState<DadosEnroll | undefined>();

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      {dados ? <ConfirmarCodigo dados={dados} /> : <IniciarConfiguracao onIniciado={setDados} />}
    </div>
  );
}
