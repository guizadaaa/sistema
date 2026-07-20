/** Remove tudo que não for dígito (uso em input mascarado tipo "123.456.789-01"). */
export function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

/** Formata progressivamente enquanto o usuário digita: 000.000.000-00. */
export function formatarCpf(valor: string): string {
  const digitos = somenteDigitos(valor).slice(0, 11);
  let formatado = digitos.slice(0, 3);
  if (digitos.length > 3) formatado += "." + digitos.slice(3, 6);
  if (digitos.length > 6) formatado += "." + digitos.slice(6, 9);
  if (digitos.length > 9) formatado += "-" + digitos.slice(9, 11);
  return formatado;
}

/**
 * Validação do dígito verificador do CPF (algoritmo padrão da Receita
 * Federal). O banco só exige o formato (11 dígitos — ver constraint
 * casos_cpf_formato); isto é uma checagem a mais no app para pegar CPF
 * digitado errado cedo, sem enfraquecer nada no banco.
 */
export function cpfValido(cpf: string): boolean {
  const digitos = somenteDigitos(cpf);

  if (digitos.length !== 11 || /^(\d)\1{10}$/.test(digitos)) {
    return false;
  }

  const calcularDigito = (base: string, pesoInicial: number): number => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) {
      soma += Number(base[i]) * (pesoInicial - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  const primeiroDigito = calcularDigito(digitos.slice(0, 9), 10);
  const segundoDigito = calcularDigito(digitos.slice(0, 10), 11);

  return primeiroDigito === Number(digitos[9]) && segundoDigito === Number(digitos[10]);
}
