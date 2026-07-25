import { AuthError, requireAuthUser } from '../server/auth.js'

export const config = {
  runtime: 'edge',
}

export default async function handler(request: Request): Promise<Response> {
  try {
    await requireAuthUser(request, {
      authSecret: process.env.NLOG_AUTH_SECRET,
      allowedEmails: process.env.NLOG_ALLOWED_EMAILS,
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
  }

  return new Response(
    JSON.stringify({
      error:
        'Local path scanning only works when NLog runs on your machine (npm run dev / Laragon). On the hosted site, use Link Folder (Chrome/Edge) or Add Folder instead.',
    }),
    {
      status: 501,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    },
  )
}
