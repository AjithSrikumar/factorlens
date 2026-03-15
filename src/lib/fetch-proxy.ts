/**
 * Proxy-aware fetch for server-side API routes.
 *
 * In environments with HTTPS_PROXY set (dev containers), Node.js built-in
 * fetch doesn't auto-use the proxy. This module detects the proxy and uses
 * undici's fetch with a singleton ProxyAgent dispatcher.
 * Falls back to native fetch in production (no HTTPS_PROXY set).
 */

type FetchOptions = RequestInit & { next?: { revalidate?: number } }

// Use a Promise for init so concurrent callers all await the same init
let _initPromise: Promise<void> | null = null
let _undiciFetch: ((url: string, init?: Record<string, unknown>) => Promise<Response>) | null = null
let _dispatcher: unknown = null

function _doInit(): Promise<void> {
  const proxyUrl = (
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY  ||
    process.env.http_proxy  ||
    ''
  )
  if (!proxyUrl) return Promise.resolve()

  return import('undici').then(undici => {
    _dispatcher = new undici.ProxyAgent(proxyUrl)
    _undiciFetch = undici.fetch as unknown as typeof _undiciFetch
  }).catch(() => {
    // undici not available — fall back to native fetch
  })
}

function ensureInit(): Promise<void> {
  if (!_initPromise) _initPromise = _doInit()
  return _initPromise
}

/**
 * Fetch a URL through the configured proxy (if any).
 * Falls through to native fetch in production environments.
 */
export async function fetchViaProxy(url: string, options?: FetchOptions): Promise<Response> {
  await ensureInit()

  if (_undiciFetch && _dispatcher) {
    const { next: _, ...rest } = options ?? {}
    return _undiciFetch(url, { ...rest, dispatcher: _dispatcher } as Record<string, unknown>) as unknown as Promise<Response>
  }

  // No proxy configured — use native fetch (works in production)
  return fetch(url, options)
}
