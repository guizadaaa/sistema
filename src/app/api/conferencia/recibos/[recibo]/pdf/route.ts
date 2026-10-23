import { autenticar } from "@/lib/conferencia/auth";
import { caminhoPdfRecibo, PDF_RECIBO_MAX_BYTES, pareceSerPdf } from "@/lib/conferencia/recibo-pdf";
import { erro, json } from "@/lib/conferencia/respostas";
import { createAdminClient } from "@/lib/supabase/admin";

/** PUT body application/pdf (máx. 5 MB) -> bucket "recibos" + recibos.pdf_path. */
export async function PUT(request: Request, { params }: { params: Promise<{ recibo: string }> }) {
  const usuario = await autenticar(request);
  if (usuario instanceof Response) return usuario;

  const recibo = (await params).recibo.replace(/\D/g, "");
  if (!recibo) return erro(400, "Número de recibo inválido.");

  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/pdf")) {
    return erro(415, "Envie o PDF com Content-Type: application/pdf.");
  }
  if (Number(request.headers.get("content-length") ?? 0) > PDF_RECIBO_MAX_BYTES) {
    return erro(413, "PDF maior que 5 MB.");
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > PDF_RECIBO_MAX_BYTES) return erro(413, "PDF maior que 5 MB.");
  if (!pareceSerPdf(bytes)) return erro(400, "O arquivo enviado não é um PDF.");

  const admin = createAdminClient();
  const { data: linha, error } = await admin
    .from("recibos")
    .select("recibo, loja, data_venda, vendedor_usuario_id")
    .eq("recibo", recibo)
    .maybeSingle();
  if (error) throw error;
  if (!linha) return erro(404, "Recibo não encontrado — envie a lista de recibos antes do PDF.");

  const { data: pode, error: erroVisibilidade } = await admin.rpc("usuario_pode_ver_conferencia", {
    p_usuario: usuario.id,
    p_loja: linha.loja,
    p_vendedor: linha.vendedor_usuario_id,
  });
  if (erroVisibilidade) throw erroVisibilidade;
  if (!pode) return erro(403, "Sem acesso a este recibo.");

  const caminho = caminhoPdfRecibo(linha.loja, linha.data_venda, linha.recibo);
  const { error: erroUpload } = await admin.storage
    .from("recibos")
    .upload(caminho, bytes, { contentType: "application/pdf", upsert: true });
  if (erroUpload) {
    console.error("Erro ao salvar PDF do recibo:", erroUpload);
    return erro(500, "Não foi possível salvar o PDF.");
  }

  const enviadoEm = new Date().toISOString();
  const { error: erroUpdate } = await admin
    .from("recibos")
    .update({ pdf_path: caminho, pdf_enviado_em: enviadoEm, pdf_enviado_por: usuario.id })
    .eq("recibo", recibo);
  if (erroUpdate) throw erroUpdate;

  return json({ recibo, pdf_path: caminho, pdf_enviado_em: enviadoEm });
}
