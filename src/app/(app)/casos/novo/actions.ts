"use server";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { validarEEnviarAnexos } from "@/lib/casos/anexos";
import { casoSchema } from "@/lib/validation/caso";

export type CriarCasoState = {
  error?: string;
  sucesso?: { id: string; protocolo: number; avisosAnexos?: string[] };
};

export async function criarCaso(_prevState: CriarCasoState, formData: FormData): Promise<CriarCasoState> {
  const usuario = await requireCurrentUser();

  const raw = {
    tipoCaso: formData.get("tipoCaso"),
    vendedorDono: formData.get("vendedorDono"),
    contratoNumero: formData.get("contratoNumero"),
    clienteNome: formData.get("clienteNome"),
    clienteCpf: formData.get("clienteCpf"),
    prazoVigencia: formData.get("prazoVigencia"),
    motivo: formData.get("motivo") || undefined,
    descricao: formData.get("descricao") || undefined,
    parcelasEmAberto: formData.get("parcelasEmAberto") || undefined,
    dataCancelamento: formData.get("dataCancelamento") || undefined,
  };

  const parsed = casoSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const dados = parsed.data;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("casos")
    .insert({
      tipo_caso: dados.tipoCaso,
      vendedor_dono: dados.vendedorDono,
      criado_por: usuario.id,
      contrato_numero: dados.contratoNumero,
      cliente_nome: dados.clienteNome,
      cliente_cpf: dados.clienteCpf,
      prazo_vigencia: dados.prazoVigencia,
      motivo: "motivo" in dados ? dados.motivo : null,
      descricao: "descricao" in dados ? dados.descricao : null,
      parcelas_em_aberto: "parcelasEmAberto" in dados ? dados.parcelasEmAberto : null,
      data_cancelamento: "dataCancelamento" in dados ? dados.dataCancelamento : null,
    })
    .select("id, protocolo")
    .single();

  if (error) {
    // RLS/CHECK constraints devolvem mensagens técnicas do Postgres; não
    // expor isso direto ao usuário final, só logar para diagnóstico.
    console.error("Erro ao criar caso:", error);
    return { error: "Não foi possível criar o caso. Verifique os dados e tente novamente." };
  }

  const avisosAnexos = await validarEEnviarAnexos(supabase, data.id, formData);

  return {
    sucesso: {
      id: data.id,
      protocolo: data.protocolo,
      avisosAnexos: avisosAnexos.length > 0 ? avisosAnexos : undefined,
    },
  };
}
