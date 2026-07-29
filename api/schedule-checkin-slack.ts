import { AuthError, requireAuthUser } from '../server/auth.js'
import { jsonResponse } from '../server/groq.js'
import {
  getAutomaticCheckInPostAt,
  requireSlackCheckInConfig,
  scheduleCheckInToSlack,
  slackCheckInConfigured,
} from '../server/slack-checkin.js'

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }
  try {
    await requireAuthUser(request, {
      authSecret: process.env.NLOG_AUTH_SECRET,
      allowedEmails: process.env.NLOG_ALLOWED_EMAILS,
    })
    if (!slackCheckInConfigured(process.env)) {
      return jsonResponse({ error: 'Slack posting is not configured.' }, 503)
    }
    const body = (await request.json()) as {
      text?: string
      replaceScheduledMessageId?: string
    }
    if (!body.text?.trim()) return jsonResponse({ error: 'text is required' }, 400)
    const postAt = getAutomaticCheckInPostAt()
    if (!postAt) {
      return jsonResponse({
        ok: true,
        scheduled: false,
        reason: 'Automatic scheduling applies before 9:00 AM PHT on Monday, Wednesday, and Friday.',
      })
    }
    const result = await scheduleCheckInToSlack(
      requireSlackCheckInConfig(process.env),
      body.text,
      postAt,
      body.replaceScheduledMessageId?.trim() || undefined,
    )
    return jsonResponse({ ok: true, scheduled: true, ...result })
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonResponse({ error: error.message }, error.status)
    }
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Slack scheduling failed' },
      502,
    )
  }
}
