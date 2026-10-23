import { autenticar } from "@/lib/conferencia/auth";
import { erro, json, lerJson } from "@/lib/conferencia/respostas";
import { createAdminClient } from "@/lib/supabase/admin";

const TEXTO_MAX = 5000;
const DIAGNOSTICO_MAX = 200_000;

/** POST {texto, diagnostico} -> conferencia_reportes (problema relatado na extensão). */
export async function POST(request: Request) {
  const usuario = await autenticar(request);
  if (usuario instanceof Response) return usuario;

  const corpo = await lerJson(request);
  const texto = typeof corpo?.texto === "string" ? corpo.texto.trim() : "";
  if (!texto) return erro(400, "Descreva o problema.");
  if (texto.length > TEXTO_MAX) return erro(400, `Texto maior que ${TEXTO_MAX} caracteres.`);
  const diagnostico = corpo?.diagnostico ?? null;
  if (JSON.stringify(diagnostico).length > DIAGNOSTICO_MAX) return erro(413, "Diagnóstico grande demais.");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("conferencia_reportes")
    .insert({ usuario_id: usuario.id, texto, diagnostico })
    .select("id, criado_em")
    .single();
  if (error) throw error;
  return json(data, 201);
}
