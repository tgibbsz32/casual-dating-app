import { createFreebuffAuth } from '@freebuff/auth'
import type { FreebuffAuth } from '@freebuff/auth'
import { Hono } from 'hono'
import { buildApi } from './api'
import { jsonError, type Env } from './lib'

type Handler = (request: Request, env: Env, ctx: ExecutionContext) => Response | Promise<Response>

const NOT_CONFIGURED =
  'Sign in is not configured for this environment yet. Set FREEBUFF_CLIENT_ID and APP_ORIGIN.'

function isLoopback(origin: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)
}

/**
 * One auth instance and one wrapped handler per isolate: the SDK caches OIDC
 * discovery and signing keys there.
 */
let cached: { handler: Handler } | undefined

function setup(env: Env): { handler: Handler } {
  if (cached) return cached

  if (!env.FREEBUFF_CLIENT_ID) {
    const fallback = new Hono<{ Bindings: Env }>()
    fallback.get('/api/health', (c) => c.json({ ok: true, auth: false }))
    fallback.all('/api/*', () => jsonError(503, NOT_CONFIGURED))
    fallback.all('/auth/freebuff/*', () => jsonError(503, NOT_CONFIGURED))
    fallback.notFound((c) => c.env.ASSETS.fetch(c.req.raw))
    const handler: Handler = (request, e) => fallback.fetch(request, e)
    cached = { handler }
    return cached
  }

  const auth: FreebuffAuth = createFreebuffAuth({
    clientId: env.FREEBUFF_CLIENT_ID,
    issuer: env.FREEBUFF_ISSUER,
    baseUrl: env.APP_ORIGIN,
    allowInsecureLocalhost: isLoopback(env.APP_ORIGIN),
  })

  const app = new Hono<{ Bindings: Env }>()
  app.get('/api/health', (c) => c.json({ ok: true, auth: true }))
  app.route('/api', buildApi(auth))
  app.notFound((c) => {
    if (c.req.path.startsWith('/api/')) return jsonError(404, 'Unknown API route')
    return c.env.ASSETS.fetch(c.req.raw)
  })

  const wrapped = auth.wrap((request: Request, e: Env, ctx: ExecutionContext) => app.fetch(request, e, ctx))
  const handler: Handler = (request, e, ctx) => wrapped(request, e, ctx)
  cached = { handler }
  return cached
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    return setup(env).handler(request, env, ctx)
  },
}
