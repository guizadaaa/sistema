import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  cookieOptionsSessao,
  SESSAO_INATIVIDADE_MS,
  SESSAO_INICIO_COOKIE,
  SESSAO_TIME_BOX_MS,
  ULTIMA_ATIVIDADE_COOKIE,
} from "@/lib/auth/sessao";

import { supabaseAnonKey, supabaseUrl } from "./env";

// /auth/confirm e /forgot-password precisam ser acessíveis sem sessão (é
// justamente o que estabelecem). /set-password fica de fora de propósito:
// exige a sessão que /auth/confirm acabou de criar via verifyOtp.
const PUBLIC_PATHS = ["/login", "/auth/confirm", "/forgot-password"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() (não getSession()) revalida o token contra o Supabase Auth a
  // cada requisição — é o que garante que uma sessão revogada (ex.: usuário
  // desativado) não continue passando pelo middleware só porque o cookie
  // local ainda existe.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublicPath = PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));

  if (!user && !isPublicPath) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && request.nextUrl.pathname === "/login") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  // Time-box (12h) e inactivity timeout (30min) — ver src/lib/auth/sessao.ts.
  // Os dois cookies são "self-healing": se ausentes (primeira requisição após
  // login via /auth/confirm, ou logo depois do deploy desta feature), só
  // começam a contar a partir de agora, sem forçar logout — login() também
  // grava sessao_inicio explicitamente no caminho comum (senha), então isso
  // aqui é o fallback para os outros pontos de entrada de sessão.
  if (user) {
    const agora = Date.now();
    const sessaoInicio = Number(request.cookies.get(SESSAO_INICIO_COOKIE)?.value);
    const ultimaAtividade = Number(request.cookies.get(ULTIMA_ATIVIDADE_COOKIE)?.value);

    const expirouPorTempoMaximo = Number.isFinite(sessaoInicio) && agora - sessaoInicio > SESSAO_TIME_BOX_MS;
    const expirouPorInatividade =
      Number.isFinite(ultimaAtividade) && agora - ultimaAtividade > SESSAO_INATIVIDADE_MS;

    if (expirouPorTempoMaximo || expirouPorInatividade) {
      await supabase.auth.signOut();

      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.search = "";
      loginUrl.searchParams.set("erro", expirouPorTempoMaximo ? "sessao_expirada" : "inatividade");

      const redirectResponse = NextResponse.redirect(loginUrl);
      // signOut() já preparou (via setAll acima) a limpeza dos cookies de
      // sessão do Supabase em `response` — repassa pro redirect, já que
      // NextResponse.redirect() precisa de uma response nova, não reaproveita.
      for (const cookie of response.cookies.getAll()) {
        redirectResponse.cookies.set(cookie);
      }
      redirectResponse.cookies.delete(SESSAO_INICIO_COOKIE);
      redirectResponse.cookies.delete(ULTIMA_ATIVIDADE_COOKIE);
      return redirectResponse;
    }

    response.cookies.set(ULTIMA_ATIVIDADE_COOKIE, String(agora), cookieOptionsSessao(SESSAO_INATIVIDADE_MS));
    if (!Number.isFinite(sessaoInicio)) {
      response.cookies.set(SESSAO_INICIO_COOKIE, String(agora), cookieOptionsSessao(SESSAO_TIME_BOX_MS));
    }
  }

  return response;
}
