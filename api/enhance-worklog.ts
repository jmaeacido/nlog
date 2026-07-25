import {
  AuthError,
  requireAuthUser,
} from '../server/auth.js'
import {
  enhanceWorklogWithGroq,
  jsonResponse,
  requireApiKey,
  type EnhanceWorklogInput,
} from '../server/groq.js'

export const config = {
  runtime: 'edge',
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    await requireAuthUser(request, {
      authSecret: process.env.NLOG_AUTH_SECRET,
      allowedEmails: process.env.NLOG_ALLOWED_EMAILS,
    })
    const apiKey = requireApiKey(process.env.GROQ_API_KEY)
    const body = (await request.json()) as EnhanceWorklogInput

    if (!body?.markdown || typeof body.markdown !== 'string') {
      return jsonResponse({ error: 'markdown is required' }, 400)
    }

    const result = await enhanceWorklogWithGroq(apiKey, body)
    return jsonResponse(result)
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonResponse({ error: error.message }, error.status)
    }
    const message = error instanceof Error ? error.message : 'Enhance failed'
    const status = message.includes('GROQ_API_KEY') ? 503 : 500
    return jsonResponse({ error: message }, status)
  }
}
