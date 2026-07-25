import { AuthError, getBearerToken, requireAuthUser } from '../server/auth.js'
import { fetchOneDriveWorklogsFromLinks } from '../server/onedrive-worklogs.js'

export const config = {
  runtime: 'edge',
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const user = await requireAuthUser(request, {
      authSecret: process.env.NLOG_AUTH_SECRET,
      allowedEmails: process.env.NLOG_ALLOWED_EMAILS,
    })

    const body = (await request.json()) as { links?: string[] }
    if (!Array.isArray(body.links) || body.links.length === 0) {
      return new Response(JSON.stringify({ error: 'links array is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const msHeader = request.headers.get('x-microsoft-token')?.trim()
    const bearer = getBearerToken(request)
    const graphToken =
      msHeader || (user.provider === 'microsoft' ? bearer : null)

    if (!graphToken) {
      return new Response(
        JSON.stringify({
          error:
            'OneDrive fetch needs a Microsoft account. Sign in with Microsoft, or connect Microsoft after email login.',
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        },
      )
    }

    const results = await fetchOneDriveWorklogsFromLinks(
      body.links,
      graphToken,
    )
    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: error.status,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      })
    }
    const message =
      error instanceof Error ? error.message : 'OneDrive fetch failed'
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
