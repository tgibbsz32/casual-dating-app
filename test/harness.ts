/**
 * LOCAL TEST HARNESS — never deployed.
 *
 * The production worker (src/worker/index.ts) gets its session from Sign in
 * with Freebuff, which cannot complete inside this headless VM. This harness
 * mounts the exact same `buildApi()` router with a stubbed session so the whole
 * API surface can be exercised against local D1/R2 with curl.
 *
 * It is wired up only by test/wrangler.jsonc; the deploy manifest points at
 * src/worker/index.ts, so nothing here reaches production.
 */
import type { FreebuffAuth, FreebuffUser } from '@freebuff/auth'
import { safeReturnTo } from '@freebuff/auth'
import { Hono } from 'hono'
import { buildApi } from '../src/worker/api'
import { jsonError, type Env } from '../src/worker/lib'

function userFor(request: Request): FreebuffUser | null {
  const cookie = request.headers.get('cookie') ?? ''
  const match = /(?:^|;\s*)test_user=([^;]+)/.exec(cookie)
  if (!match) return null
  const sub = decodeURIComponent(match[1])
  return { sub, email: `${sub}@test.invalid`, name: sub }
}

const stubAuth = {
  issuer: 'https://test.invalid',
  clientId: 'test-client',
  handle: async () => null,
  authenticate: async (request: Request) => ({ user: userFor(request), cookies: [] }),
  getUser: async (request: Request) => userFor(request),
  wrap: <T extends unknown[]>(handler: (request: Request, ...rest: T) => Response | Promise<Response>) => handler,
} as unknown as FreebuffAuth

const app = new Hono<{ Bindings: Env }>()

/*
 * LOCAL STAND-IN FOR "SIGN IN WITH FREEBUFF" — development only.
 *
 * A real OIDC round-trip needs a public origin this VM does not have, so the
 * harness fakes the two routes the SPA links to. It only ever mints the
 * `test_user` cookie that `userFor()` already reads; it validates no token and
 * is wired up only by wrangler.test.jsonc, which nothing deploys.
 */
app.get('/auth/freebuff/signin', (c) => {
  const returnTo = safeReturnTo(c.req.query('returnTo'))
  const sub = `visitor-${Math.random().toString(36).slice(2, 8)}`
  return c.redirect(
    `/auth/freebuff/callback?sub=${encodeURIComponent(sub)}&returnTo=${encodeURIComponent(returnTo)}`,
    302,
  )
})

app.get('/auth/freebuff/callback', (c) => {
  const sub = c.req.query('sub') ?? 'visitor'
  const returnTo = safeReturnTo(c.req.query('returnTo'))
  return new Response(null, {
    status: 302,
    headers: {
      Location: returnTo,
      'Set-Cookie': `test_user=${encodeURIComponent(sub)}; Path=/; Max-Age=604800; SameSite=Lax`,
      'Cache-Control': 'no-store',
    },
  })
})

app.all('/auth/freebuff/signout', (c) =>
  new Response(null, {
    status: 302,
    headers: {
      Location: safeReturnTo(c.req.query('returnTo')),
      'Set-Cookie': 'test_user=; Path=/; Max-Age=0; SameSite=Lax',
      'Cache-Control': 'no-store',
    },
  }),
)

app.get('/api/health', (c) => c.json({ ok: true, auth: true, harness: true }))
app.route('/api', buildApi(stubAuth))
app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) return jsonError(404, 'Unknown API route')
  return c.env.ASSETS.fetch(c.req.raw)
})

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    return app.fetch(request, env, ctx)
  },
}
