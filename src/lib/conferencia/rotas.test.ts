import { beforeEach, describe, expect, it, vi } from "vitest";

// Testes das rotas /api/conferencia/* com o client service_role simulado.
// Idempotência do sync, eventos de voo, mapeamento automático e RLS são
// testados no banco de verdade em supabase/tests/30_assertions_conferencia.sql.

type Usuario = { id: string; nome_completo: string; perfil: string; filial: string | null; ativo: boolean };

const estado = vi.hoisted(() => ({
  usuarios: new Map<string, Usuario>(),
  config: { versao_atual: "0.11.0", logins_gravacao: ["SPBG0007", "CWBG0109"] } as {
    versao_atual: string | null;
    logins_gravacao: string[];
  },
  recibos: new Map<string, { recibo: string; loja: string; data_venda: string | null; vendedor_usuario_id: string | null }>(),
  rpc: vi.fn(),
  uploads: [] as { bucket: string; caminho: string; tamanho: number }[],
  updates: [] as { tabela: string; valores: unknown }[],
  inserts: [] as { tabela: string; valores: unknown }[],
  signIn: vi.fn(),
  refresh: vi.fn(),
  challenge: vi.fn(),
  verify: vi.fn(),
  fatores: new Map<string, { id: string; factor_type: string; status: string }[]>(),
  janelas: [] as { loja: string; de: string; ate: string; reservas: number; coletado_em: string }[],
}));

/** access_token falso no formato JWT (só o payload importa: sub e aal). */
function jwt(sub: string, aal: "aal1" | "aal2") {
  return `h.${Buffer.from(JSON.stringify({ sub, aal })).toString("base64url")}.s`;
}

function builder(tabela: string) {
  const filtros: Record<string, unknown> = {};
  let modo: "select" | "update" | "insert" = "select";
  let valores: unknown;

  const resolver = () => {
    if (modo === "update") {
      estado.updates.push({ tabela, valores: { ...(valores as object), ...filtros } });
      return { data: null, error: null };
    }
    if (modo === "insert") {
      estado.inserts.push({ tabela, valores });
      return { data: { id: "reporte-1", criado_em: "2026-10-23T12:00:00Z" }, error: null };
    }
    if (tabela === "usuarios") return { data: estado.usuarios.get(filtros.id as string) ?? null, error: null };
    if (tabela === "conferencia_config") return { data: estado.config, error: null };
    if (tabela === "recibos") return { data: estado.recibos.get(filtros.recibo as string) ?? null, error: null };
    if (tabela === "base_coleta_janelas") {
      return { data: estado.janelas.filter((j) => !filtros.loja || j.loja === filtros.loja), error: null };
    }
    return { data: null, error: null };
  };

  const b = {
    select: () => b,
    eq: (coluna: string, valor: unknown) => {
      filtros[coluna] = valor;
      return b;
    },
    update: (v: unknown) => {
      modo = "update";
      valores = v;
      return b;
    },
    insert: (v: unknown) => {
      modo = "insert";
      valores = v;
      return b;
    },
    order: () => b,
    maybeSingle: async () => resolver(),
    single: async () => resolver(),
    then: (ok: (r: unknown) => unknown) => Promise.resolve(resolver()).then(ok),
  };
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: {
      getUser: async (token: string) => {
        let id: string | null = token.startsWith("valido-") ? token.slice("valido-".length) : null;
        if (!id && token.split(".").length === 3) {
          id = (JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()) as { sub: string }).sub;
        }
        return id
          ? { data: { user: { id, factors: estado.fatores.get(id) ?? [] } }, error: null }
          : { data: { user: null }, error: { message: "invalid JWT" } };
      },
    },
    from: (tabela: string) => builder(tabela),
    rpc: (nome: string, args: unknown) => estado.rpc(nome, args),
    storage: {
      from: (bucket: string) => ({
        upload: async (caminho: string, bytes: Uint8Array) => {
          estado.uploads.push({ bucket, caminho, tamanho: bytes.byteLength });
          return { data: { path: caminho }, error: null };
        },
      }),
    },
  }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: estado.signIn,
      refreshSession: estado.refresh,
      mfa: { challenge: estado.challenge, verify: estado.verify },
    },
  }),
}));

const ADMIN = "00000000-0000-0000-0000-000000000004";
const VENDEDOR_1714 = "00000000-0000-0000-0000-000000000005";
const INATIVO = "00000000-0000-0000-0000-000000000009";
const VENDEDOR_1710 = "00000000-0000-0000-0000-000000000001";
const ADMIN_2FA = "00000000-0000-0000-0000-000000000006";
const ADM = "00000000-0000-0000-0000-000000000007";
const GERENTE_1710 = "00000000-0000-0000-0000-000000000003";

function req(url: string, init: RequestInit & { token?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  if (init.body && typeof init.body === "string" && !headers.has("content-type")) headers.set("content-type", "application/json");
  return new Request(`https://aura.test/api/conferencia/${url}`, { ...init, headers });
}

const corpoSync = {
  versao_extensao: "0.11.0",
  login_systur: "SPBG0007",
  loja: "1710",
  consulta: { tipo: "saida", de: "2026-10-20", ate: "2026-10-27" },
  excursoes: [{ reserva: "303999143", vendedor_systur: "Dayane Peres Kawaguchi" }],
};

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://exemplo.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  estado.usuarios = new Map([
    [ADMIN, { id: ADMIN, nome_completo: "Guilherme", perfil: "adm_master", filial: null, ativo: true }],
    [VENDEDOR_1714, { id: VENDEDOR_1714, nome_completo: "Vendedora Batel", perfil: "vendedor", filial: "1714", ativo: true }],
    [ADMIN_2FA, { id: ADMIN_2FA, nome_completo: "Adm com 2FA", perfil: "adm", filial: null, ativo: true }],
    [VENDEDOR_1710, { id: VENDEDOR_1710, nome_completo: "Vendedora Palladium", perfil: "vendedor", filial: "1710", ativo: true }],
    [INATIVO, { id: INATIVO, nome_completo: "Ex", perfil: "vendedor", filial: "1710", ativo: false }],
    [ADM, { id: ADM, nome_completo: "Adm", perfil: "adm", filial: null, ativo: true }],
    [GERENTE_1710, { id: GERENTE_1710, nome_completo: "Gerente", perfil: "gerente", filial: "1710", ativo: true }],
  ]);
  estado.janelas = [
    { loja: "1710", de: "2026-01-01", ate: "2026-04-10", reservas: 812, coletado_em: "2026-11-12T10:00:00Z" },
    { loja: "1714", de: "2026-01-01", ate: "2026-02-28", reservas: 300, coletado_em: "2026-11-12T11:00:00Z" },
  ];
  estado.recibos = new Map([
    ["17100000161708", { recibo: "17100000161708", loja: "1710", data_venda: "2026-10-22", vendedor_usuario_id: null }],
  ]);
  estado.config = { versao_atual: "0.11.0", logins_gravacao: ["SPBG0007", "CWBG0109"] };
  estado.rpc.mockReset();
  estado.signIn.mockReset();
  estado.refresh.mockReset();
  estado.challenge.mockReset();
  estado.verify.mockReset();
  estado.fatores = new Map([[ADMIN_2FA, [{ id: "fator-totp", factor_type: "totp", status: "verified" }]]]);
  estado.uploads = [];
  estado.updates = [];
  estado.inserts = [];
});

describe("autenticação (Bearer token)", () => {
  it("sem token, token inválido -> 401; usuário inativo -> 403", async () => {
    const { GET } = await import("@/app/api/conferencia/config/route");
    expect((await GET(req("config"))).status).toBe(401);
    expect((await GET(req("config", { token: "lixo" }))).status).toBe(401);
    expect((await GET(req("config", { token: `valido-${INATIVO}` }))).status).toBe(403);
  });

  it("todas as rotas protegidas respondem 401 com token inválido, sem gravar nada", async () => {
    const rotas = await Promise.all([
      import("@/app/api/conferencia/sync/route").then((m) => m.POST),
      import("@/app/api/conferencia/recibos/route").then((m) => m.POST),
      import("@/app/api/conferencia/cliente-avisado/route").then((m) => m.POST),
      import("@/app/api/conferencia/reporte/route").then((m) => m.POST),
    ]);
    for (const rota of rotas) {
      const resposta = await rota(req("x", { method: "POST", token: "expirado", body: JSON.stringify(corpoSync) }));
      expect(resposta.status).toBe(401);
    }
    const { PUT } = await import("@/app/api/conferencia/recibos/[recibo]/pdf/route");
    const resposta = await PUT(req("recibos/1/pdf", { method: "PUT", token: "expirado" }), {
      params: Promise.resolve({ recibo: "17100000161708" }),
    });
    expect(resposta.status).toBe(401);
    expect(estado.rpc).not.toHaveBeenCalled();
    expect(estado.uploads).toHaveLength(0);
  });
});

describe("GET /config", () => {
  it("devolve versão, logins de gravação e o usuário com as lojas", async () => {
    const { GET } = await import("@/app/api/conferencia/config/route");
    const resposta = await GET(req("config", { token: `valido-${ADMIN}` }));
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({
      versao_atual: "0.11.0",
      logins_gravacao: ["SPBG0007", "CWBG0109"],
      usuario: { id: ADMIN, nome: "Guilherme", papel: "adm_master", lojas: ["1710", "1714", "1730"] },
    });
  });
});

describe("POST /login e /refresh", () => {
  const sessao = { access_token: "at", refresh_token: "rt", expires_at: 1_800_000_000, user: { id: VENDEDOR_1714 } };

  it("login ok devolve tokens e usuário (vendedor só com a própria loja)", async () => {
    estado.signIn.mockResolvedValue({ data: { session: sessao }, error: null });
    const { POST } = await import("@/app/api/conferencia/login/route");
    const resposta = await POST(req("login", { method: "POST", body: JSON.stringify({ email: "v@cvc.com.br", senha: "123456" }) }));
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({
      access_token: "at",
      refresh_token: "rt",
      expires_at: 1_800_000_000,
      usuario: { id: VENDEDOR_1714, nome: "Vendedora Batel", papel: "vendedor", lojas: ["1714"] },
    });
    expect(estado.signIn).toHaveBeenCalledWith({ email: "v@cvc.com.br", password: "123456" });
  });

  it("senha errada -> 401; corpo incompleto -> 400", async () => {
    estado.signIn.mockResolvedValue({ data: { session: null }, error: { message: "Invalid login credentials" } });
    const { POST } = await import("@/app/api/conferencia/login/route");
    expect((await POST(req("login", { method: "POST", body: JSON.stringify({ email: "v@cvc.com.br", senha: "x" }) }))).status).toBe(401);
    expect((await POST(req("login", { method: "POST", body: JSON.stringify({ email: "v@cvc.com.br" }) }))).status).toBe(400);
  });

  it("refresh devolve o mesmo formato; refresh inválido -> 401", async () => {
    const { POST } = await import("@/app/api/conferencia/refresh/route");
    estado.refresh.mockResolvedValue({ data: { session: sessao }, error: null });
    const ok = await POST(req("refresh", { method: "POST", body: JSON.stringify({ refresh_token: "rt" }) }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).access_token).toBe("at");

    estado.refresh.mockResolvedValue({ data: { session: null }, error: { message: "Invalid Refresh Token" } });
    expect((await POST(req("refresh", { method: "POST", body: JSON.stringify({ refresh_token: "velho" }) }))).status).toBe(401);
  });
});

describe("POST /sync", () => {
  it("grava via conferencia_sync carimbando o usuário", async () => {
    const resultado = { recebidas: 1, novas: 1, atualizadas: 0, eventos_voo: 0, vendedores_sem_vinculo: [] };
    estado.rpc.mockResolvedValue({ data: resultado, error: null });
    const { POST } = await import("@/app/api/conferencia/sync/route");
    const resposta = await POST(req("sync", { method: "POST", token: `valido-${ADMIN}`, body: JSON.stringify(corpoSync) }));
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual(resultado);
    expect(estado.rpc).toHaveBeenCalledWith("conferencia_sync", { p_usuario: ADMIN, p_payload: corpoSync });
  });

  it("vendedor fora de logins_gravacao sincroniza a própria loja (login_systur só é registrado)", async () => {
    estado.rpc.mockResolvedValue({ data: { recebidas: 1, novas: 1, atualizadas: 0, eventos_voo: 0, vendedores_sem_vinculo: [] }, error: null });
    const { POST } = await import("@/app/api/conferencia/sync/route");
    const corpo = { ...corpoSync, login_systur: "CWBG0300" };
    const resposta = await POST(req("sync", { method: "POST", token: `valido-${VENDEDOR_1710}`, body: JSON.stringify(corpo) }));
    expect(resposta.status).toBe(200);
    expect(estado.rpc).toHaveBeenCalledWith("conferencia_sync", { p_usuario: VENDEDOR_1710, p_payload: corpo });
  });

  it("loja de outra filial -> 403", async () => {
    const { POST } = await import("@/app/api/conferencia/sync/route");
    const resposta = await POST(
      req("sync", { method: "POST", token: `valido-${VENDEDOR_1714}`, body: JSON.stringify({ ...corpoSync, login_systur: "SPBG0007" }) })
    );
    expect(resposta.status).toBe(403);
    expect(estado.rpc).not.toHaveBeenCalled();
  });

  it("corpo inválido -> 400; erro de validação do banco -> 400", async () => {
    const { POST } = await import("@/app/api/conferencia/sync/route");
    expect((await POST(req("sync", { method: "POST", token: `valido-${ADMIN}`, body: "{" }))).status).toBe(400);
    expect(
      (await POST(req("sync", { method: "POST", token: `valido-${ADMIN}`, body: JSON.stringify({ ...corpoSync, excursoes: null }) }))).status
    ).toBe(400);

    estado.rpc.mockResolvedValue({ data: null, error: { code: "22023", message: "Excursão sem número de reserva." } });
    const resposta = await POST(req("sync", { method: "POST", token: `valido-${ADMIN}`, body: JSON.stringify(corpoSync) }));
    expect(resposta.status).toBe(400);
    expect(await resposta.json()).toEqual({ erro: "Excursão sem número de reserva." });
  });
});

describe("POST /sync — tipos de serviço", () => {
  it("depois do sync grava os tipos só onde a reserva ainda não tem", async () => {
    estado.rpc.mockResolvedValue({ data: { recebidas: 1, novas: 1, atualizadas: 0, eventos_voo: 0, vendedores_sem_vinculo: [] }, error: null });
    const { POST } = await import("@/app/api/conferencia/sync/route");
    const corpo = {
      ...corpoSync,
      excursoes: [{ reserva: "303999143", excursao: "5.1.1", descricao: "ORLANDO - 8 Dias 7 Noites", apolices: [{ n: 1 }] }],
    };
    const resposta = await POST(req("sync", { method: "POST", token: `valido-${ADMIN}`, body: JSON.stringify(corpo) }));
    expect(resposta.status).toBe(200);
    expect(estado.rpc).toHaveBeenCalledWith("clientes_gravar_tipos_servico", {
      p_itens: [{ reserva: "303999143", tipos: ["aereo", "hotel", "seguro"] }],
      p_so_vazios: true,
    });
  });
});

describe("POST /base (bot da base de clientes)", () => {
  const reservaDisney = {
    reserva: "305990175",
    roteiro: "292242913",
    excursao: "9.06246325.26092201",
    vendedor_systur: "Alejandra Beatriz Garcia",
    data_confirmacao: "2026-03-02",
    data_viagem: "2026-09-22",
    data_retorno: "2026-09-22",
    voucher_status: "Emitido",
    reserva_site: false,
    tipo_produto: "PRODUTO FÁCIL",
    descricao_roteiro: "DISNEY - PARIS - 1 Dias 0 Noites",
    origem: { pais: "BRASIL", estado: "PR", cidade: "CURITIBA" },
    destino: { pais: "FRANCA", estado: "IL", cidade: "DISNEY - PARIS" },
    tem_voo: false,
    fornecedores: [
      {
        categoria: "ATIVIDADE",
        receptivo: "9540738 - Disneyland Paris",
        cidade: "PARIS",
        servico: "59058422 - Disneyland Paris · Ingresso Datado De 1 Dia / 1 Parque ...",
        data_inicial: "2026-09-22",
        data_final: "2026-09-22",
        acordo: "59795402",
      },
    ],
    contratantes: [
      {
        pessoa_id: "21287851",
        nome: "Rodrigo Escurra",
        recibo: "1710-0000161196",
        valor: 1102.16,
        taxa_embarque: 0,
        taxa_du: 0,
        taxa_remessa: 0,
        taxa_iof: 33.59,
        passageiros: ["Olga Mabel Ruiz", "Valentina Escurra Bordet"],
        telefones: [{ numero: "41 99999-0000", tipo: "Celular", contato: "" }],
      },
    ],
  };
  const corpoBase = {
    versao_extensao: "0.12.0",
    loja: "1710",
    janela: { de: "2026-01-01", ate: "2026-04-10" },
    fim_da_janela: true,
    reservas: [reservaDisney],
  };

  it("adm_master: grava via conferencia_base com tipos_servico calculados (Disney -> ingresso)", async () => {
    const resultado = { recebidas: 1, novas: 1, atualizadas: 0, clientes_novos: 1, vendedores_sem_vinculo: ["Alejandra Beatriz Garcia"] };
    estado.rpc.mockResolvedValue({ data: resultado, error: null });
    const { POST } = await import("@/app/api/conferencia/base/route");
    const resposta = await POST(req("base", { method: "POST", token: `valido-${ADMIN}`, body: JSON.stringify(corpoBase) }));
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual(resultado);
    expect(estado.rpc).toHaveBeenCalledWith("conferencia_base", {
      p_usuario: ADMIN,
      p_payload: { ...corpoBase, reservas: [{ ...reservaDisney, tipos_servico: ["ingresso"] }] },
    });
  });

  it("qualquer outro papel -> 403 (adm, gerente, vendedor); sem token -> 401; nada gravado", async () => {
    const { POST } = await import("@/app/api/conferencia/base/route");
    for (const id of [ADM, GERENTE_1710, VENDEDOR_1710]) {
      const resposta = await POST(req("base", { method: "POST", token: `valido-${id}`, body: JSON.stringify(corpoBase) }));
      expect(resposta.status).toBe(403);
    }
    expect((await POST(req("base", { method: "POST", body: JSON.stringify(corpoBase) }))).status).toBe(401);
    expect(estado.rpc).not.toHaveBeenCalled();
  });

  it("mais de 200 reservas -> 413; loja/reservas inválidas -> 400", async () => {
    const { POST } = await import("@/app/api/conferencia/base/route");
    const muitas = { ...corpoBase, reservas: Array.from({ length: 201 }, (_, i) => ({ ...reservaDisney, reserva: String(i) })) };
    expect((await POST(req("base", { method: "POST", token: `valido-${ADMIN}`, body: JSON.stringify(muitas) }))).status).toBe(413);
    const duzentas = { ...corpoBase, reservas: Array.from({ length: 200 }, (_, i) => ({ ...reservaDisney, reserva: String(i) })) };
    estado.rpc.mockResolvedValue({ data: {}, error: null });
    expect((await POST(req("base", { method: "POST", token: `valido-${ADMIN}`, body: JSON.stringify(duzentas) }))).status).toBe(200);
    estado.rpc.mockClear();
    for (const corpo of [{ ...corpoBase, loja: "9999" }, { ...corpoBase, reservas: null }, { ...corpoBase, reservas: [1] }]) {
      expect((await POST(req("base", { method: "POST", token: `valido-${ADMIN}`, body: JSON.stringify(corpo) }))).status).toBe(400);
    }
    expect(estado.rpc).not.toHaveBeenCalled();
  });

  it("idempotente: o mesmo corpo vai igual ao banco nas duas chamadas (upsert lá)", async () => {
    estado.rpc
      .mockResolvedValueOnce({ data: { recebidas: 1, novas: 1, atualizadas: 0, clientes_novos: 1, vendedores_sem_vinculo: [] }, error: null })
      .mockResolvedValueOnce({ data: { recebidas: 1, novas: 0, atualizadas: 1, clientes_novos: 0, vendedores_sem_vinculo: [] }, error: null });
    const { POST } = await import("@/app/api/conferencia/base/route");
    const r1 = await POST(req("base", { method: "POST", token: `valido-${ADMIN}`, body: JSON.stringify(corpoBase) }));
    const r2 = await POST(req("base", { method: "POST", token: `valido-${ADMIN}`, body: JSON.stringify(corpoBase) }));
    expect((await r2.json()).novas).toBe(0);
    expect((await r1.json()).novas).toBe(1);
    expect(estado.rpc.mock.calls[0]).toEqual(estado.rpc.mock.calls[1]);
  });

  it("erro de validação do banco -> 400", async () => {
    estado.rpc.mockResolvedValue({ data: null, error: { code: "22023", message: "Reserva sem número." } });
    const { POST } = await import("@/app/api/conferencia/base/route");
    const resposta = await POST(req("base", { method: "POST", token: `valido-${ADMIN}`, body: JSON.stringify(corpoBase) }));
    expect(resposta.status).toBe(400);
    expect(await resposta.json()).toEqual({ erro: "Reserva sem número." });
  });
});

describe("GET /base/janelas", () => {
  it("adm_master recebe as janelas (filtro por loja); outros papéis -> 403", async () => {
    const { GET } = await import("@/app/api/conferencia/base/janelas/route");
    const ok = await GET(req("base/janelas?loja=1710", { token: `valido-${ADMIN}` }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({
      janelas: [{ loja: "1710", de: "2026-01-01", ate: "2026-04-10", reservas: 812, coletado_em: "2026-11-12T10:00:00Z" }],
    });
    expect((await GET(req("base/janelas?loja=1710", { token: `valido-${ADM}` }))).status).toBe(403);
    expect((await GET(req("base/janelas", { token: `valido-${VENDEDOR_1710}` }))).status).toBe(403);
    expect((await GET(req("base/janelas?loja=xx", { token: `valido-${ADMIN}` }))).status).toBe(400);
  });
});

describe("POST /recibos", () => {
  it("grava via conferencia_recibos; loja de fora -> 403", async () => {
    estado.rpc.mockResolvedValue({ data: { recebidos: 1, novos: 1, atualizados: 0 }, error: null });
    const { POST } = await import("@/app/api/conferencia/recibos/route");
    const corpo = { loja: "1710", data_venda: "2026-10-22", recibos: [{ recibo: "17100000161708", valor: 10 }] };
    const ok = await POST(req("recibos", { method: "POST", token: `valido-${ADMIN}`, body: JSON.stringify(corpo) }));
    expect(ok.status).toBe(200);
    expect(estado.rpc).toHaveBeenCalledWith("conferencia_recibos", { p_usuario: ADMIN, p_payload: corpo });

    const negado = await POST(req("recibos", { method: "POST", token: `valido-${VENDEDOR_1714}`, body: JSON.stringify(corpo) }));
    expect(negado.status).toBe(403);
  });
});

describe("PUT /recibos/{recibo}/pdf", () => {
  const pdf = new TextEncoder().encode("%PDF-1.7\n...conteúdo...");
  const contexto = (recibo: string) => ({ params: Promise.resolve({ recibo }) });

  it("salva em {loja}/{aaaa}/{mm}/{recibo}.pdf e grava pdf_path", async () => {
    estado.rpc.mockResolvedValue({ data: true, error: null });
    const { PUT } = await import("@/app/api/conferencia/recibos/[recibo]/pdf/route");
    const resposta = await PUT(
      req("recibos/1710-0000161708/pdf", { method: "PUT", token: `valido-${ADMIN}`, body: pdf, headers: { "content-type": "application/pdf" } }),
      contexto("1710-0000161708")
    );
    expect(resposta.status).toBe(200);
    expect(estado.uploads).toEqual([{ bucket: "recibos", caminho: "1710/2026/10/17100000161708.pdf", tamanho: pdf.byteLength }]);
    expect(estado.updates[0]).toMatchObject({
      tabela: "recibos",
      valores: { pdf_path: "1710/2026/10/17100000161708.pdf", pdf_enviado_por: ADMIN, recibo: "17100000161708" },
    });
  });

  it("valida tipo, assinatura, tamanho, existência e acesso", async () => {
    const { PUT } = await import("@/app/api/conferencia/recibos/[recibo]/pdf/route");
    const enviar = (body: BodyInit, tipo = "application/pdf", recibo = "17100000161708", token = `valido-${ADMIN}`) =>
      PUT(req(`recibos/${recibo}/pdf`, { method: "PUT", token, body, headers: { "content-type": tipo } }), contexto(recibo));

    expect((await enviar(pdf, "image/png")).status).toBe(415);
    expect((await enviar(new TextEncoder().encode("não é pdf"))).status).toBe(400);
    expect((await enviar(new Uint8Array(4 * 1024 * 1024 + 1))).status).toBe(413);
    expect((await enviar(pdf, "application/pdf", "999")).status).toBe(404);

    estado.rpc.mockResolvedValue({ data: false, error: null });
    expect((await enviar(pdf, "application/pdf", "17100000161708", `valido-${VENDEDOR_1714}`)).status).toBe(403);
    expect(estado.uploads).toHaveLength(0);
  });
});

describe("POST /cliente-avisado", () => {
  it("marca a reserva; reserva fora do alcance -> 404", async () => {
    const { POST } = await import("@/app/api/conferencia/cliente-avisado/route");
    estado.rpc.mockResolvedValue({ data: true, error: null });
    const ok = await POST(req("cliente-avisado", { method: "POST", token: `valido-${ADMIN}`, body: JSON.stringify({ reserva: "303999143" }) }));
    expect(ok.status).toBe(200);
    expect(estado.rpc).toHaveBeenCalledWith("conferencia_marcar_cliente_avisado", { p_usuario: ADMIN, p_reserva: "303999143" });

    estado.rpc.mockResolvedValue({ data: false, error: null });
    const nao = await POST(req("cliente-avisado", { method: "POST", token: `valido-${ADMIN}`, body: JSON.stringify({ reserva: "1" }) }));
    expect(nao.status).toBe(404);
  });
});

describe("POST /reporte", () => {
  it("grava quem, texto e diagnóstico; texto vazio -> 400", async () => {
    const { POST } = await import("@/app/api/conferencia/reporte/route");
    const ok = await POST(
      req("reporte", { method: "POST", token: `valido-${VENDEDOR_1714}`, body: JSON.stringify({ texto: "Não carregou", diagnostico: { versao: "0.11.0" } }) })
    );
    expect(ok.status).toBe(201);
    expect(estado.inserts).toEqual([
      { tabela: "conferencia_reportes", valores: { usuario_id: VENDEDOR_1714, texto: "Não carregou", diagnostico: { versao: "0.11.0" } } },
    ]);
    const vazio = await POST(req("reporte", { method: "POST", token: `valido-${VENDEDOR_1714}`, body: JSON.stringify({ texto: " " }) }));
    expect(vazio.status).toBe(400);
  });
});

describe("2FA (TOTP)", () => {
  const sessaoAal1 = {
    access_token: jwt(ADMIN_2FA, "aal1"),
    refresh_token: "rt-aal1",
    expires_at: 1_800_000_000,
    user: { id: ADMIN_2FA, factors: [{ id: "fator-totp", factor_type: "totp", status: "verified" }] },
  };

  it("login de quem tem TOTP ativo devolve mfa_required, sem sessão final", async () => {
    estado.signIn.mockResolvedValue({ data: { session: sessaoAal1 }, error: null });
    const { POST } = await import("@/app/api/conferencia/login/route");
    const resposta = await POST(req("login", { method: "POST", body: JSON.stringify({ email: "g@cvc.com.br", senha: "123456" }) }));
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(corpo).toEqual({ mfa_required: true, factor_id: "fator-totp", mfa_token: "rt-aal1" });
    expect(corpo).not.toHaveProperty("access_token");
  });

  it("login/mfa: challenge + verify devolvem a sessão aal2", async () => {
    estado.refresh.mockResolvedValue({ data: { session: sessaoAal1 }, error: null });
    estado.challenge.mockResolvedValue({ data: { id: "desafio-1" }, error: null });
    estado.verify.mockResolvedValue({
      data: { access_token: jwt(ADMIN_2FA, "aal2"), refresh_token: "rt-aal2", expires_in: 3600, user: sessaoAal1.user },
      error: null,
    });
    const { POST } = await import("@/app/api/conferencia/login/mfa/route");
    const resposta = await POST(
      req("login/mfa", { method: "POST", body: JSON.stringify({ mfa_token: "rt-aal1", factor_id: "fator-totp", code: "123456" }) })
    );
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(corpo).toMatchObject({ access_token: jwt(ADMIN_2FA, "aal2"), refresh_token: "rt-aal2", usuario: { id: ADMIN_2FA, papel: "adm" } });
    expect(estado.refresh).toHaveBeenCalledWith({ refresh_token: "rt-aal1" });
    expect(estado.challenge).toHaveBeenCalledWith({ factorId: "fator-totp" });
    expect(estado.verify).toHaveBeenCalledWith({ factorId: "fator-totp", challengeId: "desafio-1", code: "123456" });
  });

  it("login/mfa: código errado -> 401; mfa_token expirado -> 401; corpo incompleto -> 400", async () => {
    const { POST } = await import("@/app/api/conferencia/login/mfa/route");
    const enviar = (corpo: object) => POST(req("login/mfa", { method: "POST", body: JSON.stringify(corpo) }));

    estado.refresh.mockResolvedValue({ data: { session: sessaoAal1 }, error: null });
    estado.challenge.mockResolvedValue({ data: { id: "desafio-1" }, error: null });
    estado.verify.mockResolvedValue({ data: null, error: { message: "Invalid TOTP code entered" } });
    expect((await enviar({ mfa_token: "rt-aal1", factor_id: "fator-totp", code: "000000" })).status).toBe(401);

    estado.refresh.mockResolvedValue({ data: { session: null }, error: { message: "Invalid Refresh Token" } });
    expect((await enviar({ mfa_token: "velho", factor_id: "fator-totp", code: "123456" })).status).toBe(401);

    expect((await enviar({ mfa_token: "rt-aal1", factor_id: "fator-totp" })).status).toBe(400);
  });

  it("refresh mantém o aal: aal2 renova; aal1 de quem tem 2FA não vira sessão", async () => {
    const { POST } = await import("@/app/api/conferencia/refresh/route");
    estado.refresh.mockResolvedValue({ data: { session: { ...sessaoAal1, access_token: jwt(ADMIN_2FA, "aal2") } }, error: null });
    const ok = await POST(req("refresh", { method: "POST", body: JSON.stringify({ refresh_token: "rt-aal2" }) }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).access_token).toBe(jwt(ADMIN_2FA, "aal2"));

    estado.refresh.mockResolvedValue({ data: { session: sessaoAal1 }, error: null });
    expect((await POST(req("refresh", { method: "POST", body: JSON.stringify({ refresh_token: "rt-aal1" }) }))).status).toBe(401);
  });

  it("rotas protegidas: token aal1 de quem tem 2FA -> 401; aal2 -> ok", async () => {
    const { GET } = await import("@/app/api/conferencia/config/route");
    expect((await GET(req("config", { token: jwt(ADMIN_2FA, "aal1") }))).status).toBe(401);
    expect((await GET(req("config", { token: jwt(ADMIN_2FA, "aal2") }))).status).toBe(200);
  });
});
