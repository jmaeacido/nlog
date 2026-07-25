import { AuthError } from '../server/auth.js'
import { jsonResponse } from '../server/groq.js'
import { processPasswordAuthEnv } from '../server/password-auth-env.js'
import { loginPasswordUser } from '../server/password-auth.js'

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const env = processPasswordAuthEnv()
    const body = (await request.json()) as {
      email?: string
      password?: string
    }
    const result = await loginPasswordUser(env, {
      email: body.email || '',
      password: body.password || '',
    })
    return jsonResponse({
      token: result.token,
      user: result.user,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonResponse({ error: error.message }, error.status)
    }
    const message = error instanceof Error ? error.message : 'Login failed'
    return jsonResponse({ error: message }, 500)
  }
}
