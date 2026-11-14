#!/usr/bin/env node
// Recalcula cliente_excursoes.tipos_servico de TODA a base com a regra atual
// (src/lib/clientes/tipos-servico.ts). Rodar depois de mudar a regra:
//
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run recalcular-tipos
//   (--dry-run só conta o que mudaria)
//
// O gatilho de cliente_excursoes leva os tipos para cliente_compras.
// Node ≥ 22.18 importa o .ts direto (só tipos, sem build).
import { createClient } from "@supabase/supabase-js";

import { calcularTiposServico } from "../src/lib/clientes/tipos-servico.ts";

const LOTE = 500;
const simular = process.argv.includes("--dry-run");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !chave) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (ex.: as do .env.local).");
  process.exit(1);
}

const supabase = createClient(url, chave, { auth: { autoRefreshToken: false, persistSession: false } });

const temConteudo = (v) => (Array.isArray(v) ? v.length > 0 : v !== null && typeof v === "object" ? Object.keys(v).length > 0 : false);
const mesmaLista = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

let lidas = 0;
let mudariam = 0;
let gravadas = 0;

for (let inicio = 0; ; inicio += LOTE) {
  const { data, error } = await supabase
    .from("cliente_excursoes")
    .select("reserva, fornecedores, descricao_roteiro, descricao, tipo_produto, tem_voo, categoria_codigo, apolices, retrato_voos, tipos_servico")
    .order("reserva")
    .range(inicio, inicio + LOTE - 1);
  if (error) throw error;
  if (!data || data.length === 0) break;
  lidas += data.length;

  const itens = data
    .map((e) => ({
      reserva: e.reserva,
      atual: e.tipos_servico,
      tipos: calcularTiposServico({
        fornecedores: Array.isArray(e.fornecedores) ? e.fornecedores : [],
        descricao_roteiro: e.descricao_roteiro ?? e.descricao,
        tipo_produto: e.tipo_produto,
        // Coleta do bot traz tem_voo; reserva só do sync: retrato dos voos.
        tem_voo: e.tem_voo ?? temConteudo(e.retrato_voos),
        categoria_codigo: e.categoria_codigo,
        tem_apolice: temConteudo(e.apolices),
      }),
    }))
    .filter((i) => !mesmaLista(i.atual, i.tipos));
  mudariam += itens.length;

  if (!simular && itens.length > 0) {
    const { data: n, error: erroGravar } = await supabase.rpc("clientes_gravar_tipos_servico", {
      p_itens: itens.map(({ reserva, tipos }) => ({ reserva, tipos })),
      p_so_vazios: false,
    });
    if (erroGravar) throw erroGravar;
    gravadas += n ?? 0;
  }
  if (data.length < LOTE) break;
}

console.log(
  simular
    ? `${lidas} reserva(s) lidas; ${mudariam} mudariam de tipo (nada gravado, --dry-run).`
    : `${lidas} reserva(s) lidas; ${gravadas} com tipos recalculados.`
);
