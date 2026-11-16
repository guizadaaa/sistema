"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Info, X } from "lucide-react";

import type { FiltrosBase } from "@/lib/clientes/base-util";
import type {
  ClienteBase,
  CompraCliente,
  CoberturaMes,
  CoberturaResumo,
  FiltroSalvo,
  JanelaColeta,
  ModeloMensagem,
} from "@/lib/clientes/base";
import type { OpcaoVendedorBase } from "@/lib/clientes/vendedor-opcoes";
import type { FilialCvc } from "@/lib/supabase/types";

import { buscarComprasCliente, buscarSugestoesDestino, excluirFiltroCliente, salvarFiltroCliente } from "./actions";
import { CoberturaBase } from "./cobertura-base";
import { FiltrosBaseClientes, type AcoesFiltros } from "./filtros-base";
import { ListaClientes, type AcoesLista } from "./lista-clientes";
import { ModelosMensagem } from "./modelos-mensagem";

const ACOES_PADRAO: AcoesFiltros & AcoesLista = {
  buscarComprasCliente,
  buscarSugestoesDestino,
  salvarFiltroCliente,
  excluirFiltroCliente,
};

// Aviso escondido pelo "×": vale só nesta sessão do navegador.
const CHAVE_AVISO = "clientes:aviso-vinculo-escondido";
const ouvintes = new Set<() => void>();
function lerAvisoEscondido(): boolean {
  try {
    return sessionStorage.getItem(CHAVE_AVISO) === "1";
  } catch {
    return false;
  }
}
function esconderAviso() {
  try {
    sessionStorage.setItem(CHAVE_AVISO, "1");
  } catch {
    /* sem storage: some só até recarregar */
  }
  ouvintes.forEach((f) => f());
}

function AvisoVinculo({ quantidade }: { quantidade: number }) {
  const escondido = useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    lerAvisoEscondido,
    () => false
  );
  if (escondido || quantidade === 0) return null;
  return (
    <p className="text-muted-foreground flex items-center gap-2 text-sm" data-testid="aviso-vinculo">
      <Info className="size-4 shrink-0" />
      <span>
        {quantidade} nome(s) do Systur parecem ser de usuários ativos e não estão vinculados.{" "}
        <Link href="/cliques/vendedores-systur?parecem=1" className="text-foreground underline underline-offset-2">
          Vincular
        </Link>
      </span>
      <button type="button" onClick={esconderAviso} aria-label="Esconder aviso" className="hover:text-foreground ml-1">
        <X className="size-3.5" />
      </button>
    </p>
  );
}

export function BaseClientesTela({
  filtros,
  pagina,
  porPagina,
  clientes,
  lojas,
  opcoesVendedor,
  modelos,
  salvos,
  cobertura,
  podeEditarModelos,
  nomesParecemAtivos = 0,
  acoes = ACOES_PADRAO,
  expandido,
}: {
  filtros: FiltrosBase;
  pagina: number;
  porPagina: number;
  clientes: ClienteBase[];
  lojas: FilialCvc[];
  opcoesVendedor: OpcaoVendedorBase[];
  modelos: ModeloMensagem[];
  salvos: FiltroSalvo[];
  /** null = não é adm_master (sem cobertura). */
  cobertura: { janelas: JanelaColeta[]; meses: CoberturaMes[]; resumo: CoberturaResumo[] } | null;
  podeEditarModelos: boolean;
  /** adm/adm_master: nomes do Systur sem vínculo iguais ao de um usuário ativo (0 = sem aviso). */
  nomesParecemAtivos?: number;
  /** Ponto de injeção para teste de navegador; em produção, as server actions. */
  acoes?: AcoesFiltros & AcoesLista;
  expandido?: { clienteId: string; compras: CompraCliente[] };
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">Base de clientes</h1>
          {podeEditarModelos && <ModelosMensagem modelos={modelos} />}
        </div>
        <AvisoVinculo quantidade={nomesParecemAtivos} />
      </div>
      <FiltrosBaseClientes filtros={filtros} lojas={lojas} opcoesVendedor={opcoesVendedor} salvos={salvos} acoes={acoes} />
      <ListaClientes
        clientes={clientes}
        filtros={filtros}
        pagina={pagina}
        porPagina={porPagina}
        modelos={modelos}
        acoes={acoes}
        expandido={expandido}
      />
      {cobertura && <CoberturaBase {...cobertura} />}
    </div>
  );
}
