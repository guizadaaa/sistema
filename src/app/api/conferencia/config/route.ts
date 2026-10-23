import { autenticar } from "@/lib/conferencia/auth";
import { carregarConfig } from "@/lib/conferencia/config";
import { json } from "@/lib/conferencia/respostas";

/** GET -> {versao_atual, logins_gravacao, usuario}. */
export async function GET(request: Request) {
  const usuario = await autenticar(request);
  if (usuario instanceof Response) return usuario;

  const config = await carregarConfig();
  return json({ versao_atual: config.versao_atual, logins_gravacao: config.logins_gravacao, usuario });
}
