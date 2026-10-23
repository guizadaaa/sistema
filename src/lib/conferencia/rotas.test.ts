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
}));

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
        const id = token.startsWith("valido-") ? token.slice("valido-".length) : null;
        return id ? { data: { user: { id } }, error: null } : { data: { user: null }, error: { message: "invalid JWT" } };
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
  createClient: () => ({ auth: { signInWithPassword: estado.signIn, refreshSession: estado.refresh } }),
}));

const ADMIN = "00000000-0000-0000-0000-000000000004";
const VENDEDOR_1714 = "00000000-0000-0000-0000-000000000005";
const INATIVO = "00000000-0000-0000-0000-000000000009";

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
    [INATIVO, { id: INATIVO, nome_completo: "Ex", perfil: "vendedor", filial: "1710", ativo: false }],
  ]);
  estado.recibos = new Map([
    ["17100000161708", { recibo: "17100000161708", loja: "1710", data_venda: "2026-10-22", vendedor_usuario_id: null }],
  ]);
  estado.config = { versao_atual: "0.11.0", logins_gravacao: ["SPBG0007", "CWBG0109"] };
  estado.rpc.mockReset();
  estado.signIn.mockReset();
  estado.refresh.mockReset();
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

  it("login do Systur fora de logins_gravacao -> 403", async () => {
    const { POST } = await import("@/app/api/conferencia/sync/route");
    const resposta = await POST(
      req("sync", { method: "POST", token: `valido-${ADMIN}`, body: JSON.stringify({ ...corpoSync, login_systur: "XXXX0001" }) })
    );
    expect(resposta.status).toBe(403);
    expect(estado.rpc).not.toHaveBeenCalled();
  });

  it("loja fora das lojas do usuário -> 403", async () => {
    estado.config = { ...estado.config, logins_gravacao: [...estado.config.logins_gravacao, "CWBG0300"] };
    const { POST } = await import("@/app/api/conferencia/sync/route");
    const resposta = await POST(
      req("sync", { method: "POST", token: `valido-${VENDEDOR_1714}`, body: JSON.stringify({ ...corpoSync, login_systur: "CWBG0300" }) })
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
    expect((await enviar(new Uint8Array(5 * 1024 * 1024 + 1))).status).toBe(413);
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
