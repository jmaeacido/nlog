import { AuthError } from '../server/auth.js'
import { jsonResponse } from '../server/groq.js'
import { processPasswordAuthEnv } from '../server/password-auth-env.js'
import { requestPasswordReset } from '../server/password-auth.js'

export const config = {
  runtime: 'edge',
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const env = processPasswordAuthEnv()
    const body = (await request.json()) as { email?: string }
    const result = await requestPasswordReset(env, {
      email: body.email || '',
    })
    return jsonResponse(result)
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonResponse({ error: error.message }, error.status)
    }
    const message =
      error instanceof Error ? error.message : 'Password reset request failed'
    return jsonResponse({ error: message }, 500)
  }
}
