---
name: verify
description: Build/launch/drive recipe for this Next.js + Supabase app (Sistema de Gestão de Casos Operacionais — CVC).
---

# Verify recipe — sistema (CVC)

## Build & run

No real Supabase project yet, so `npm run dev`/`build` need placeholder env
vars just to boot (the app throws a clear error if they're missing —
see `src/lib/supabase/env.ts`):

```bash
export NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
export NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key
export SUPABASE_SERVICE_ROLE_KEY=placeholder-service-role
npm run build && npm run start -- -p 3100   # or `npm run dev` for iteration
```

Once a real Supabase project exists, copy `.env.local.example` to
`.env.local` and fill in the real values instead — `npm run dev` picks it up
automatically.

## Driving it

Playwright/Chromium is preinstalled system-wide (not a project dependency —
`npm install -D playwright` once per session if verifying via script).
Launch with `executablePath: '/opt/pw-browsers/chromium'`.

Flows worth checking after any auth/routing change:
- Visit `/` unauthenticated → expect redirect to `/login?redirectTo=%2F...`
  (proxy.ts / middleware). Cookie-based session, so this doesn't need a
  running Supabase backend to verify the redirect itself.
- Submit the login form with a password under 6 chars → native HTML5
  `minLength` validation should block submission client-side.
- Submit with any credentials against the placeholder Supabase URL → expect
  a graceful "E-mail ou senha incorretos." message, not a crash/500 (this
  exercises the catch-all error path in `src/app/login/actions.ts`, since
  the placeholder URL can't really authenticate anyone).

**Known gap:** a *successful* login (real Supabase Auth call, session
cookie issued, redirect into `(app)`, RLS-scoped queries against real
tables) cannot be exercised until a real Supabase project + seeded
`auth.users`/`usuarios` rows exist. Testing the DB/RLS layer itself doesn't
need Supabase Storage/Auth services — see below.

## Testing schema + RLS changes (no live Supabase project needed)

Local Postgres 16 is installed (`service postgresql start`). The
`auth.users`/`auth.uid()`/roles (`authenticated`/`anon`/`service_role`) and
`storage.objects`/`storage.buckets`/`storage.foldername()` are Supabase-managed
and don't exist in plain Postgres — mock them first, then apply the real
migrations on top, then impersonate roles with
`set role authenticated; set request.jwt.claim.sub = '<uuid>';` to test RLS
policies for real (not as a superuser, which bypasses RLS entirely).

This mock setup and a full RLS test suite covering every role × table combo
already exist in the session scratchpad from the initial build — recreate
following the same pattern (mock auth schema + roles → apply
`supabase/migrations/*.sql` in order → seed multi-filial test users/casos →
impersonate each role and assert expected allow/deny) rather than trusting
the SQL by inspection alone. This is how two real bugs were caught during
the initial build (a trigger permission conflict between delegated-gerente
status changes and the casos update-guard, and a redundant no-op UPDATE
tripping that same guard).

## Gotchas hit during initial build

- Next.js 16 renamed the `middleware.ts` convention to `proxy.ts` with an
  exported function literally named `proxy` (not `middleware`) — using the
  old name fails the build with "Proxy is missing expected function export
  name".
- Hand-written `Database` types for `@supabase/supabase-js` generics must
  include `Relationships: []` on every table/view and a `Functions` key on
  the schema object, or type inference silently collapses to `never`
  instead of raising a clear type error.
- `shadcn@latest init` needs `ui.shadcn.com`, which this environment's
  proxy blocks — install the underlying Radix/Tailwind/cva packages via npm
  directly and hand-write components in the shadcn "new-york" style instead.
- Docker daemon cannot start in this sandbox (`ulimit`/nested-container
  restrictions), so a full local Supabase stack (`supabase start`) isn't
  reachable here — only Postgres-level RLS testing (above) works locally.
- **Server processes from a previous verification round can outlive a
  `pkill`** (pattern mismatch, or the process was already zombied) and keep
  holding the port. `npm run start` then fails silently in the background
  with `EADDRINUSE` while curl/Playwright happily hit the *old* process
  serving a `.next` build that may no longer match the source (or was
  deleted out from under it). Symptom: a page renders but is missing
  content you just added, or looks unstyled. Always check the actual
  server log after starting (`cat` it, don't just `sleep` and assume), and
  `ps aux | grep next-server` to confirm only one instance is up before
  trusting any Playwright result. `pkill -9 -f next-server` is more
  reliable than `pkill -f "next start"` (matches the actual server process,
  not the wrapper script).

### Verifying a page gated by `requireCurrentUser()` without a live Supabase project

Since there's no real Supabase Auth to sign in against, any Server
Component/Action behind `requireCurrentUser()` redirects to `/login`. To
still drive the actual new UI code (not just build/typecheck it):

1. Add a temporary route *outside* `(app)` (a leading-underscore folder like
   `_verify` is invisible to Next's router — use a plain name, e.g.
   `verify-harness-temp`) that renders the client component directly with
   mock props, bypassing `requireCurrentUser()` entirely.
2. Temporarily add that path to `PUBLIC_PATHS` in
   `src/lib/supabase/middleware.ts` so the proxy doesn't redirect it away.
3. Drive it with Playwright. Note: submitting a form whose Server Action
   itself calls `requireCurrentUser()` will *still* redirect to `/login`
   once the action runs (the harness only bypassed the middleware, not the
   action's own auth check) — that's correct, expected behavior, not a bug.
   It means the true submit-to-DB path stays unverified until a real
   Supabase project exists; say so explicitly rather than claiming full
   coverage.
4. Revert step 2 and delete the harness route + any verification scripts
   before considering the change done — `git status` should show none of it.

Radix `Select` renders a hidden native `<select>` alongside the visible
custom listbox (for form association) — a Playwright `text=` locator will
match the hidden `<option>` first and hang waiting for it to become
visible. Click the trigger, then target `[role="option"]:has-text(...)`.
