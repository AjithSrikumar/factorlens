/**
 * Next.js instrumentation hook — runs once when the server starts.
 * Configures undici's global dispatcher to use HTTPS_PROXY if set,
 * so that server-side fetch() calls work in environments that require
 * a proxy (e.g. dev containers). Has no effect in production.
 */
export async function register() {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy
  if (!proxyUrl) return

  try {
    const { ProxyAgent, setGlobalDispatcher } = await import('undici')
    setGlobalDispatcher(new ProxyAgent(proxyUrl))
  } catch {
    // undici not available — no proxy configured
  }
}
