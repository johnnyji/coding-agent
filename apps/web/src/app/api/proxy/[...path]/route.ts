import { type NextRequest } from 'next/server'

// Server-side proxy — forwards /api/proxy/threads/... to the API service.
// This avoids Chrome's Private Network Access (PNA) restriction that blocks
// browser-initiated requests from a public HTTPS origin to localhost.
const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080').replace(/\/$/, '')

async function handler(
  req: NextRequest,
  context: { params: { path: string[] } },
): Promise<Response> {
  const path = context.params.path.join('/')
  const target = `${API_BASE}/api/${path}${req.nextUrl.search}`

  const headers: Record<string, string> = {}
  const auth = req.headers.get('Authorization')
  if (auth) headers['Authorization'] = auth
  const contentType = req.headers.get('Content-Type')
  if (contentType) headers['Content-Type'] = contentType

  const fetchInit: RequestInit = { method: req.method, headers }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    fetchInit.body = await req.text()
  }

  const apiRes = await fetch(target, fetchInit)

  const responseHeaders: Record<string, string> = {
    'Cache-Control': 'no-cache, no-transform',
  }
  const ct = apiRes.headers.get('Content-Type')
  if (ct) responseHeaders['Content-Type'] = ct
  // Prevent nginx/Cloudflare from buffering SSE
  responseHeaders['X-Accel-Buffering'] = 'no'

  return new Response(apiRes.body, {
    status: apiRes.status,
    headers: responseHeaders,
  })
}

export { handler as GET, handler as POST }
