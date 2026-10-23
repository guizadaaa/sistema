export function json(corpo: unknown, status = 200): Response {
  return Response.json(corpo, { status });
}

export function erro(status: number, mensagem: string): Response {
  return Response.json({ erro: mensagem }, { status });
}

/** Corpo JSON da requisição (objeto) ou null se não for JSON válido. */
export async function lerJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const corpo: unknown = await request.json();
    return corpo && typeof corpo === "object" && !Array.isArray(corpo) ? (corpo as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// Erros de validação levantados pelas funções conferencia_* (errcode 22023)
// e de conversão de tipo (data/booleano/número inválido) viram 400; o resto, 500.
const CODIGOS_DADO_INVALIDO = new Set(["22023", "22P02", "22007", "22008", "22003"]);

export function erroDoBanco(contexto: string, e: { code?: string; message: string }): Response {
  if (e.code && CODIGOS_DADO_INVALIDO.has(e.code)) return erro(400, e.message);
  console.error(`Erro em ${contexto}:`, e);
  return erro(500, "Erro ao gravar os dados.");
}
