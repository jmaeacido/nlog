import type { PasswordAuthEnv } from './password-auth.js'

function resolveFromEmail(env: Record<string, string | undefined>): string | undefined {
  const combined = env.NLOG_FROM_EMAIL?.trim()
  if (combined) return combined

  const address = env.MAIL_FROM_ADDRESS?.trim()
  if (!address) return undefined
  const name = env.MAIL_FROM_NAME?.trim() || 'NLog'
  return `${name} <${address}>`
}

export function buildPasswordAuthEnv(
  env: Record<string, string | undefined>,
  usersFilePath?: string,
): PasswordAuthEnv {
  return {
    authSecret: env.NLOG_AUTH_SECRET,
    registerCode: env.NLOG_REGISTER_CODE,
    allowedEmails: env.NLOG_ALLOWED_EMAILS,
    bootstrapUsers: env.NLOG_PASSWORD_USERS,
    upstashUrl: env.UPSTASH_REDIS_REST_URL,
    upstashToken: env.UPSTASH_REDIS_REST_TOKEN,
    usersFilePath,
    brevoApiKey: env.BREVO_API_KEY,
    fromEmail: resolveFromEmail(env),
    appUrl: env.NLOG_APP_URL,
  }
}

export function processPasswordAuthEnv(
  usersFilePath?: string,
): PasswordAuthEnv {
  return buildPasswordAuthEnv(process.env, usersFilePath)
}
