import {
  AuthError,
  requireAuthUser,
} from '../server/auth.js'
import { jsonResponse } from '../server/groq.js'
import {
  dmSlackUser,
  nlogSlackUserId,
  postCheckInToSlack,
  requireSlackCheckInConfig,
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
      return jsonResponse(
        {
          error:
            'Slack posting is not configured. Set SLACK_BOT_TOKEN and SLACK_CHECKIN_CHANNEL_ID on the server.',
        },
        503,
      )
    }

    const body = (await request.json()) as { text?: string }
    const text = typeof body?.text === 'string' ? body.text : ''

    if (!text.trim()) {
      return jsonResponse({ error: 'text is required' }, 400)
    }

    const config = requireSlackCheckInConfig(process.env)
    const result = await postCheckInToSlack(config, text)

    const ownerSlackId = nlogSlackUserId(process.env)
    if (ownerSlackId) {
      const confirm = result.permalink
        ? `Your check-in was posted to the Output Reporting Channel.\n${result.permalink}`
        : 'Your check-in was posted to the Output Reporting Channel.'
      await dmSlackUser(config.botToken, ownerSlackId, confirm)
    }

    return jsonResponse({
      ok: true,
      ts: result.ts,
      permalink: result.permalink,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonResponse({ error: error.message }, error.status)
    }
    const message =
      error instanceof Error ? error.message : 'Slack post failed'
    const status =
      message.includes('not configured') ||
      message.includes('SLACK_')
        ? 503
        : 502
    return jsonResponse({ error: message }, status)
  }
}
