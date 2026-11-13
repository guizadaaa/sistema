"use client";

import type { FiltrosBase } from "@/lib/clientes/base-util";
import type { ClienteBase, CompraCliente, FiltroSalvo, JanelaColeta, ModeloMensagem } from "@/lib/clientes/base";
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

export function BaseClientesTela({
  filtros,
  pagina,
  porPagina,
  clientes,
  lojas,
  vendedores,
  modelos,
  salvos,
  janelas,
  podeEditarModelos,
  acoes = ACOES_PADRAO,
  expandido,
}: {
  filtros: FiltrosBase;
  pagina: number;
  porPagina: number;
  clientes: ClienteBase[];
  lojas: FilialCvc[];
  vendedores: { vendedor: string; loja: string }[];
  modelos: ModeloMensagem[];
  salvos: FiltroSalvo[];
  /** null = não é adm_master (sem quadro de cobertura). */
  janelas: JanelaColeta[] | null;
  podeEditarModelos: boolean;
  /** Ponto de injeção para teste de navegador; em produção, as server actions. */
  acoes?: AcoesFiltros & AcoesLista;
  expandido?: { clienteId: string; compras: CompraCliente[] };
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Base de clientes</h1>
        {podeEditarModelos && <ModelosMensagem modelos={modelos} />}
      </div>
      {janelas && <CoberturaBase janelas={janelas} />}
      <FiltrosBaseClientes filtros={filtros} lojas={lojas} vendedores={vendedores} salvos={salvos} acoes={acoes} />
      <ListaClientes
        clientes={clientes}
        filtros={filtros}
        pagina={pagina}
        porPagina={porPagina}
        modelos={modelos}
        acoes={acoes}
        expandido={expandido}
      />
    </div>
  );
}
