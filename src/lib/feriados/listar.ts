import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

import type { Feriado } from "./dia-util";

export type FeriadoLinha = Database["public"]["Tables"]["feriados"]["Row"];

/** Feriados entre duas datas (aaaa-mm-dd), ou todos. */
export async function listarFeriados(de?: string, ate?: string): Promise<FeriadoLinha[]> {
  const supabase = await createClient();
  let consulta = supabase.from("feriados").select("*").order("data").order("filial", { nullsFirst: true });
  if (de) consulta = consulta.gte("data", de);
  if (ate) consulta = consulta.lte("data", ate);
  const { data, error } = await consulta;
  if (error) throw error;
  return data ?? [];
}

export function paraFeriado(f: FeriadoLinha): Feriado {
  return { data: f.data, nome: f.nome, abrangencia: f.abrangencia, filial: f.filial, facultativo: f.facultativo };
}
