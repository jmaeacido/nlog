import {
  AuthError,
  requireAuthUser,
} from '../server/auth.js'
import {
  generateInvoiceReportWithGroq,
  jsonResponse,
  requireApiKey,
  type InvoiceReportInput,
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
    const body = (await request.json()) as InvoiceReportInput

    if (!body?.invoiceNumber || !Array.isArray(body.lineItems)) {
      return jsonResponse({ error: 'Invalid invoice report payload' }, 400)
    }

    const result = await generateInvoiceReportWithGroq(apiKey, body)
    return jsonResponse(result)
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonResponse({ error: error.message }, error.status)
    }
    const message = error instanceof Error ? error.message : 'Report failed'
    const status = message.includes('GROQ_API_KEY') ? 503 : 500
    return jsonResponse({ error: message }, status)
  }
}
