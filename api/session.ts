import { AuthError, requireAuthUser } from '../server/auth.js'
import { jsonResponse } from '../server/groq.js'

export const config = {
  runtime: 'edge',
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const user = await requireAuthUser(request, {
      authSecret: process.env.NLOG_AUTH_SECRET,
      allowedEmails: process.env.NLOG_ALLOWED_EMAILS,
    })
    return jsonResponse({
      authenticated: true,
      user,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonResponse({ error: error.message }, error.status)
    }
    const message =
      error instanceof Error ? error.message : 'Session check failed'
    return jsonResponse({ error: message }, 500)
  }
}
