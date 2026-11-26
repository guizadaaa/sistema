import { describe, expect, it } from "vitest";

import { decodificarHtml, limparHtmlAnexo, temDadoDeSessao } from "./html-anexo";

describe("limparHtmlAnexo", () => {
  it("tira <script>, on* e javascript:", () => {
    const limpo = limparHtmlAnexo(
      `<html><body><h1 onclick="roubar()">Erro</h1><script>alert(1)</script><a href="javascript:alert(2)">x</a><a href="https://cvc.com.br">ok</a><img src=x onerror="alert(3)"></body></html>`
    );
    expect(limpo).not.toMatch(/script|alert|onclick|onerror|javascript:/i);
    expect(limpo).toContain("<h1>Erro</h1>");
    expect(limpo).toContain('<a href="https://cvc.com.br">ok</a>');
  });

  it("tira <iframe>, <object>, <embed>, <form>/<input>, <svg> (com o conteúdo)", () => {
    const limpo = limparHtmlAnexo(
      `<p>antes</p><iframe src="https://x"></iframe><object data="x"></object><embed src="x"><form action="https://x"><input name="senha" value="123"></form><svg><script>alert(1)</script></svg><p>depois</p>`
    );
    expect(limpo).toBe("<p>antes</p><p>depois</p>");
  });

  it("tira a linha/campo com HTTP_COOKIE, Cookie:, Set-Cookie, SESSION, JSESSIONID, token", () => {
    const limpo = limparHtmlAnexo(`<html><body>
<h2>Erro 500 - Systur</h2>
<table>
<tr><td>HTTP_HOST</td><td>systur.cvc.com.br</td></tr>
<tr><td>HTTP_COOKIE</td><td>JSESSIONID=ABC123; CFID=9; CFTOKEN=777</td></tr>
<tr><td>REQUEST_URI</td><td>/reserva</td></tr>
</table>
<pre>linha 1
Cookie: JSESSIONID=ABC123
Set-Cookie: SESSION=XYZ
Authorization token=abc
linha 2</pre>
<ul><li>sessão ok</li><li>SESSION_ID: 42</li></ul>
<a href="https://systur.cvc.com.br/r;jsessionid=ABC123">reabrir</a>
</body></html>`);
    expect(limpo).not.toMatch(/JSESSIONID|ABC123|CFTOKEN|777|HTTP_COOKIE|Set-Cookie|XYZ|token=abc|SESSION_ID/i);
    expect(limpo).toContain("HTTP_HOST");
    expect(limpo).toContain("REQUEST_URI");
    expect(limpo).toContain("linha 1");
    expect(limpo).toContain("linha 2");
    expect(limpo).toContain("Erro 500 - Systur");
    expect(limpo).toContain("<a>reabrir</a>");
  });

  it("uma div que envolve a página não some inteira por causa de uma linha de cookie", () => {
    const limpo = limparHtmlAnexo(`<div><p>Reserva 306400304</p><p>Cookie: JSESSIONID=1</p><p>Tente de novo</p></div>`);
    expect(limpo).toBe("<div><p>Reserva 306400304</p><p>Tente de novo</p></div>");
  });

  it("mantém estilos e tabelas (a página aparece como foi salva)", () => {
    const limpo = limparHtmlAnexo(`<style>td{color:red}</style><table border="1"><tr><td colspan="2" style="color:blue">A</td></tr></table>`);
    expect(limpo).toContain("<style>td{color:red}</style>");
    expect(limpo).toContain('<td colspan="2" style="color:blue">A</td>');
  });

  it("detecta termos de sessão", () => {
    expect(temDadoDeSessao("HTTP_COOKIE=abc")).toBe(true);
    expect(temDadoDeSessao("Reserva confirmada")).toBe(false);
  });
});

describe("decodificarHtml", () => {
  it("usa o charset declarado (ISO-8859-1) e, sem declaração, UTF-8", () => {
    const latin1 = Uint8Array.from([...Buffer.from('<meta charset="iso-8859-1"><p>Reserva n'), 0xe3, ...Buffer.from("o encontrada</p>")]);
    expect(decodificarHtml(latin1)).toContain("Reserva não encontrada");
    expect(decodificarHtml(new TextEncoder().encode("<p>São José</p>"))).toBe("<p>São José</p>");
  });
});
