// Opções do filtro "Vendedor" da base de clientes (puro: tela e testes).
// Valores aceitos por base_clientes_buscar: 'grupo:ex', 'grupo:site',
// 'usuario:<uuid>' (equipe atual) ou o nome do Systur de um ex-vendedor.

export const VENDEDOR_EX = "grupo:ex";
export const VENDEDOR_SITE = "grupo:site";

export type OpcaoVendedorBase = { categoria: "atual" | "ex"; valor: string; rotulo: string; loja: string | null };

export type GruposVendedor = {
  todos: boolean;
  atuais: OpcaoVendedorBase[];
  exTodos: boolean;
  exIndividuais: OpcaoVendedorBase[];
  site: boolean;
};

export function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const ROTULO_EX = "Ex-vendedores (todos)";
const ROTULO_SITE = "Site / Internet";

/**
 * Sem busca: Todos, Equipe atual (da loja escolhida, se houver), Ex-vendedores
 * (todos) e Site / Internet — ex-vendedores individuais não aparecem.
 * Com busca: só o que contém o termo, incluindo ex-vendedores individuais.
 */
export function filtrarOpcoesVendedor(opcoes: OpcaoVendedorBase[], termo: string, loja?: string | null): GruposVendedor {
  const t = semAcento(termo);
  const casa = (texto: string) => !t || semAcento(texto).includes(t);
  const porNome = (a: OpcaoVendedorBase, b: OpcaoVendedorBase) => a.rotulo.localeCompare(b.rotulo, "pt-BR");

  const atuais = opcoes
    .filter((o) => o.categoria === "atual" && (!loja || o.loja === loja) && casa(o.rotulo))
    .sort(porNome);
  const exIndividuais = t
    ? opcoes
        .filter((o) => o.categoria === "ex" && (!loja || o.loja === loja) && casa(o.rotulo))
        .filter((o, i, lista) => lista.findIndex((x) => x.valor === o.valor) === i)
        .sort(porNome)
    : [];

  return {
    todos: casa("Todos"),
    atuais,
    exTodos: casa(ROTULO_EX) || casa("ex-vendedor"),
    exIndividuais,
    site: casa(ROTULO_SITE) || casa("site") || casa("internet"),
  };
}

/** Texto do campo para o valor escolhido. */
export function rotuloVendedor(valor: string | undefined, opcoes: OpcaoVendedorBase[]): string {
  if (!valor) return "Todos";
  if (valor === VENDEDOR_EX) return ROTULO_EX;
  if (valor === VENDEDOR_SITE) return ROTULO_SITE;
  const opcao = opcoes.find((o) => o.valor === valor);
  if (opcao) return opcao.categoria === "ex" ? `${opcao.rotulo} (ex-vendedor)` : opcao.rotulo;
  return valor;
}

export const ROTULOS_GRUPO_VENDEDOR = { ex: ROTULO_EX, site: ROTULO_SITE };
