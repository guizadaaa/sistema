import { requireCurrentUser } from "@/lib/auth/current-user";
import { buscarClientesBase, LIMITE_EXPORTACAO } from "@/lib/clientes/base";
import { dataBr, lerFiltros, montarCsv } from "@/lib/clientes/base-util";
import { TIPO_SERVICO_LABELS, isTipoServico } from "@/lib/clientes/tipos-servico";

const tipos = (lista: string[]) => lista.filter(isTipoServico).map((t) => TIPO_SERVICO_LABELS[t]).join(", ");

/** CSV: uma linha por cliente, com a compra que casou no filtro. Mesma busca (e RLS) da tela. */
export async function GET(request: Request) {
  await requireCurrentUser();
  const filtros = lerFiltros(Object.fromEntries(new URL(request.url).searchParams));
  const clientes = await buscarClientesBase(filtros, 1, LIMITE_EXPORTACAO);

  const csv = montarCsv(
    [
      "Cliente", "Telefones", "Lojas", "Viagens", "Total comprado", "Última compra", "Próxima viagem", "Tipos já comprados",
      "Reserva (compra do filtro)", "Destino", "Embarque", "Retorno", "Valor", "Tipos da compra", "Vendedor", "Loja da compra",
    ],
    clientes.map((c) => [
      c.nome,
      (c.telefones ?? []).map((t) => t.numero).join(" / "),
      c.lojas.join(", "),
      c.qtd_viagens,
      Number(c.total_comprado),
      dataBr(c.ultima_compra),
      dataBr(c.proxima_viagem),
      tipos(c.tipos),
      c.compra_reserva,
      c.compra_destino,
      dataBr(c.compra_embarque),
      dataBr(c.compra_retorno),
      c.compra_valor === null ? null : Number(c.compra_valor),
      tipos(c.compra_tipos),
      c.compra_vendedor,
      c.compra_loja,
    ])
  );

  const hoje = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="base-clientes-${hoje}.csv"`,
      "cache-control": "no-store",
    },
  });
}
