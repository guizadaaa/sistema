/**
 * Máscara "estilo caixa eletrônico": os dígitos digitados são sempre
 * interpretados da direita para a esquerda como centavos — evita ambiguidade
 * de separador decimal (vírgula vs. ponto) e mantém o cursor sempre no fim,
 * comportamento padrão em campos de valor monetário no Brasil.
 */
function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

/** Formata qualquer entrada (dígitos crus ou já mascarada) como "R$ x.xxx,xx". */
export function mascararMoeda(valor: string): string {
  const centavos = somenteDigitos(valor);
  const numero = Number(centavos || "0") / 100;
  return numero.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Extrai o número a partir do valor mascarado — usado na validação (zod). */
export function moedaParaNumero(valor: string): number {
  const centavos = somenteDigitos(valor);
  return Number(centavos || "0") / 100;
}
