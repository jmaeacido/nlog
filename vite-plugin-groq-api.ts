import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { Plugin } from 'vite'
import { loadEnv } from 'vite'
import {
  AuthError,
  requireAppUserFromToken,
} from './server/auth.js'
import { getUsdPhpRate } from './server/exchange-rate.js'
import {
  chatWithLogger,
  enhanceWorklogWithGroq,
  generateInvoiceReportWithGroq,
  proposeCheckInDraftWithGroq,
  requireApiKey,
  type EnhanceWorklogInput,
  type InvoiceReportInput,
  type LoggerChatInput,
  type ProposeCheckInInput,
} from './server/groq.js'
import { buildPasswordAuthEnv } from './server/password-auth-env.js'
import {
  loginPasswordUser,
  passwordAuthConfigured,
  passwordResetAvailable,
  registerPasswordUser,
  registrationAvailable,
  requestPasswordReset,
  resetPasswordWithToken,
} from './server/password-auth.js'
import { registerFileUserStoreAdapter } from './server/user-store.js'
import { readUsersFile, writeUsersFile } from './server/user-store-fs.js'

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw.trim()) return {}
  return JSON.parse(raw) as unknown
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(data))
}

function headerValue(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

export function groqApiPlugin(): Plugin {
  const configureApiServer = (server: {
    config: { mode: string; root: string }
    middlewares: {
      use: (handler: (
        req: IncomingMessage,
        res: ServerResponse,
        next: () => void,
      ) => void) => void
    }
  }) => {
      const env = loadEnv(server.config.mode, server.config.root, '')
      const usersFilePath = path.join(server.config.root, 'data', 'users.json')
      registerFileUserStoreAdapter({
        read: readUsersFile,
        write: writeUsersFile,
      })
      const passwordEnv = buildPasswordAuthEnv(env, usersFilePath)

      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0]
        if (!url?.startsWith('/api/')) {
          next()
          return
        }

        try {
          if (url === '/api/auth-config') {
            if (req.method !== 'GET') {
              sendJson(res, 405, { error: 'Method not allowed' })
              return
            }
            sendJson(res, 200, {
              passwordAuth: passwordAuthConfigured(passwordEnv),
              registrationAvailable: registrationAvailable(passwordEnv),
              registerCodeRequired: Boolean(passwordEnv.registerCode?.trim()),
              passwordResetAvailable: passwordResetAvailable(passwordEnv),
              microsoftAuth: Boolean(env.VITE_MSAL_CLIENT_ID?.trim()),
            })
            return
          }

          if (url === '/api/auth-forgot') {
            if (req.method !== 'POST') {
              sendJson(res, 405, { error: 'Method not allowed' })
              return
            }
            const body = (await readJsonBody(req)) as { email?: string }
            const result = await requestPasswordReset(passwordEnv, {
              email: body.email || '',
            })
            sendJson(res, 200, result)
            return
          }

          if (url === '/api/auth-reset') {
            if (req.method !== 'POST') {
              sendJson(res, 405, { error: 'Method not allowed' })
              return
            }
            const body = (await readJsonBody(req)) as {
              token?: string
              password?: string
            }
            const result = await resetPasswordWithToken(passwordEnv, {
              token: body.token || '',
              password: body.password || '',
            })
            sendJson(res, 200, {
              token: result.token,
              user: result.user,
            })
            return
          }

          if (url === '/api/auth-register') {
            if (req.method !== 'POST') {
              sendJson(res, 405, { error: 'Method not allowed' })
              return
            }
            const body = (await readJsonBody(req)) as {
              email?: string
              password?: string
              name?: string
              registerCode?: string
            }
            const result = await registerPasswordUser(passwordEnv, {
              email: body.email || '',
              password: body.password || '',
              name: body.name,
              registerCode: body.registerCode,
            })
            sendJson(res, 200, {
              token: result.token,
              user: result.user,
            })
            return
          }

          if (url === '/api/auth-login') {
            if (req.method !== 'POST') {
              sendJson(res, 405, { error: 'Method not allowed' })
              return
            }
            const body = (await readJsonBody(req)) as {
              email?: string
              password?: string
            }
            const result = await loginPasswordUser(passwordEnv, {
              email: body.email || '',
              password: body.password || '',
            })
            sendJson(res, 200, {
              token: result.token,
              user: result.user,
            })
            return
          }

          const authHeader = headerValue(req.headers.authorization)
          const token =
            typeof authHeader === 'string' &&
            authHeader.toLowerCase().startsWith('bearer ')
              ? authHeader.slice(7).trim()
              : null

          const user = await requireAppUserFromToken(token, {
            authSecret: passwordEnv.authSecret,
            allowedEmails: passwordEnv.allowedEmails,
          })

          if (url === '/api/session') {
            if (req.method !== 'GET') {
              sendJson(res, 405, { error: 'Method not allowed' })
              return
            }
            sendJson(res, 200, { authenticated: true, user })
            return
          }

          if (url === '/api/exchange-rate') {
            if (req.method !== 'GET') {
              sendJson(res, 405, { error: 'Method not allowed' })
              return
            }
            const query = new URL(req.url ?? '', 'http://localhost').searchParams
            const rate = await getUsdPhpRate({
              forceRefresh: query.get('refresh') === '1',
            })
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('Cache-Control', 'private, max-age=300')
            res.end(JSON.stringify(rate))
            return
          }

          if (url === '/api/scan-local-worklogs') {
            if (req.method !== 'POST') {
              sendJson(res, 405, { error: 'Method not allowed' })
              return
            }

            const {
              assertLocalScanAllowed,
              scanLocalWorklogPaths,
            } = await import('./server/scan-local-worklogs.js')

            assertLocalScanAllowed(req.headers.host)
            const body = (await readJsonBody(req)) as { paths?: string[] }
            if (!Array.isArray(body.paths) || body.paths.length === 0) {
              sendJson(res, 400, { error: 'paths array is required' })
              return
            }

            const results = await scanLocalWorklogPaths(body.paths.slice(0, 12))
            sendJson(res, 200, { results })
            return
          }

          if (url === '/api/fetch-onedrive-worklogs') {
            if (req.method !== 'POST') {
              sendJson(res, 405, { error: 'Method not allowed' })
              return
            }

            const { fetchOneDriveWorklogsFromLinks } = await import(
              './server/onedrive-worklogs.js'
            )
            const body = (await readJsonBody(req)) as { links?: string[] }
            if (!Array.isArray(body.links) || body.links.length === 0) {
              sendJson(res, 400, { error: 'links array is required' })
              return
            }

            const msHeader = headerValue(req.headers['x-microsoft-token'])
            const graphToken =
              (msHeader && msHeader.trim()) ||
              (user.provider === 'microsoft' ? token : null)

            if (!graphToken) {
              sendJson(res, 401, {
                error:
                  'OneDrive fetch needs a Microsoft account. Sign in with Microsoft, or connect Microsoft after email login.',
              })
              return
            }

            const results = await fetchOneDriveWorklogsFromLinks(
              body.links.slice(0, 12),
              graphToken,
            )
            sendJson(res, 200, { results })
            return
          }

          if (req.method !== 'POST') {
            sendJson(res, 405, { error: 'Method not allowed' })
            return
          }

          const apiKey = requireApiKey(env.GROQ_API_KEY)
          const body = await readJsonBody(req)

          if (url === '/api/enhance-worklog') {
            const input = body as EnhanceWorklogInput
            if (!input?.markdown || typeof input.markdown !== 'string') {
              sendJson(res, 400, { error: 'markdown is required' })
              return
            }
            const result = await enhanceWorklogWithGroq(apiKey, input)
            sendJson(res, 200, result)
            return
          }

          if (url === '/api/invoice-report') {
            const input = body as InvoiceReportInput
            if (!input?.invoiceNumber || !Array.isArray(input.lineItems)) {
              sendJson(res, 400, { error: 'Invalid invoice report payload' })
              return
            }
            const result = await generateInvoiceReportWithGroq(apiKey, input)
            sendJson(res, 200, result)
            return
          }

          if (url === '/api/logger-chat') {
            const input = body as LoggerChatInput
            if (!Array.isArray(input?.messages)) {
              sendJson(res, 400, { error: 'messages array is required' })
              return
            }
            const result = await chatWithLogger(apiKey, input)
            sendJson(res, 200, result)
            return
          }

          if (url === '/api/propose-checkin') {
            const input = body as ProposeCheckInInput
            if (
              !Array.isArray(input?.worklogEntries) ||
              input.worklogEntries.length === 0
            ) {
              sendJson(res, 400, {
                error: 'worklogEntries array is required',
              })
              return
            }
            const result = await proposeCheckInDraftWithGroq(apiKey, input)
            sendJson(res, 200, result)
            return
          }

          next()
        } catch (error) {
          if (error instanceof AuthError) {
            sendJson(res, error.status, { error: error.message })
            return
          }
          const message =
            error instanceof Error ? error.message : 'API request failed'
          const status = message.includes('GROQ_API_KEY')
            ? 503
            : message.includes('USD/PHP')
              ? 502
              : 500
          sendJson(res, status, { error: message })
        }
      })
    }

  return {
    name: 'nlog-groq-api',
    configureServer: configureApiServer,
    configurePreviewServer: configureApiServer,
  }
}
