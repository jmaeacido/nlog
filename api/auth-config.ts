import { jsonResponse } from '../server/groq.js'
import { processPasswordAuthEnv } from '../server/password-auth-env.js'
import {
  passwordAuthConfigured,
  passwordResetAvailable,
  registrationAvailable,
} from '../server/password-auth.js'

export const config = {
  runtime: 'edge',
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const env = processPasswordAuthEnv()
  return jsonResponse({
    passwordAuth: passwordAuthConfigured(env),
    registrationAvailable: registrationAvailable(env),
    registerCodeRequired: Boolean(env.registerCode?.trim()),
    passwordResetAvailable: passwordResetAvailable(env),
    microsoftAuth: Boolean(process.env.VITE_MSAL_CLIENT_ID?.trim()),
  })
}
