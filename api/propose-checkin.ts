import {
  AuthError,
  requireAuthUser,
} from '../server/auth.js'
import {
  jsonResponse,
  proposeCheckInDraftWithGroq,
  requireApiKey,
  type ProposeCheckInInput,
} from '../server/groq.js'

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
    const body = (await request.json()) as ProposeCheckInInput

    if (!Array.isArray(body?.worklogEntries) || body.worklogEntries.length === 0) {
      return jsonResponse(
        { error: 'worklogEntries array is required' },
        400,
      )
    }

    const result = await proposeCheckInDraftWithGroq(apiKey, body)
    return jsonResponse(result)
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonResponse({ error: error.message }, error.status)
    }
    const message =
      error instanceof Error ? error.message : 'Check-in draft failed'
    const status = message.includes('GROQ_API_KEY') ? 503 : 500
    return jsonResponse({ error: message }, status)
  }
}
