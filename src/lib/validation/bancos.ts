/**
 * Bancos mais comuns entre clientes de varejo no Brasil, com o código COMPE/
 * FEBRABAN de 3 dígitos (padrão nacional usado em TED/DOC — fonte: lista de
 * participantes do STR do Banco Central). Não é a lista completa (existem
 * ~400 instituições registradas) — cobre a grande maioria dos casos reais;
 * o valor "outro" no formulário é o escape para bancos fora desta lista.
 */
export const BANCOS: readonly { codigo: string; nome: string }[] = [
  { codigo: "001", nome: "Banco do Brasil" },
  { codigo: "033", nome: "Santander" },
  { codigo: "041", nome: "Banrisul" },
  { codigo: "070", nome: "BRB - Banco de Brasília" },
  { codigo: "077", nome: "Banco Inter" },
  { codigo: "104", nome: "Caixa Econômica Federal" },
  { codigo: "121", nome: "Banco Agibank" },
  { codigo: "208", nome: "BTG Pactual" },
  { codigo: "212", nome: "Banco Original" },
  { codigo: "218", nome: "Banco BS2" },
  { codigo: "237", nome: "Bradesco" },
  { codigo: "260", nome: "Nubank" },
  { codigo: "290", nome: "PagBank (PagSeguro)" },
  { codigo: "318", nome: "Banco BMG" },
  { codigo: "323", nome: "Mercado Pago" },
  { codigo: "336", nome: "C6 Bank" },
  { codigo: "341", nome: "Itaú Unibanco" },
  { codigo: "380", nome: "PicPay" },
  { codigo: "422", nome: "Banco Safra" },
  { codigo: "623", nome: "Banco Pan" },
  { codigo: "633", nome: "Banco Rendimento" },
  { codigo: "637", nome: "Banco Sofisa" },
  { codigo: "655", nome: "Banco Votorantim" },
  { codigo: "735", nome: "Banco Neon" },
  { codigo: "746", nome: "Banco Modal" },
  { codigo: "748", nome: "Sicredi" },
  { codigo: "756", nome: "Sicoob" },
];

/** Valor de bancoCodigo reservado para banco fora da lista (texto livre). */
export const CODIGO_BANCO_OUTRO = "outro";

export function bancoPorCodigo(codigo: string): { codigo: string; nome: string } | undefined {
  return BANCOS.find((b) => b.codigo === codigo);
}
