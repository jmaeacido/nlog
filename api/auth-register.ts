import { AuthError } from '../server/auth.js'
import { jsonResponse } from '../server/groq.js'
import { processPasswordAuthEnv } from '../server/password-auth-env.js'
import {
  registerPasswordUser,
  registrationAvailable,
} from '../server/password-auth.js'

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const env = processPasswordAuthEnv()
    const body = (await request.json()) as {
      email?: string
      password?: string
      name?: string
      registerCode?: string
    }
    const result = await registerPasswordUser(env, {
      email: body.email || '',
      password: body.password || '',
      name: body.name,
      registerCode: body.registerCode,
    })
    return jsonResponse({
      token: result.token,
      user: result.user,
      registrationAvailable: registrationAvailable(env),
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonResponse({ error: error.message }, error.status)
    }
    const message =
      error instanceof Error ? error.message : 'Registration failed'
    return jsonResponse({ error: message }, 500)
  }
}
