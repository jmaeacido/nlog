import {
  AuthError,
  requireAuthUser,
} from '../server/auth.js'
import { jsonResponse } from '../server/groq.js'
import { nlogSlackUserId, slackCheckInConfigured } from '../server/slack-checkin.js'

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    await requireAuthUser(request, {
      authSecret: process.env.NLOG_AUTH_SECRET,
      allowedEmails: process.env.NLOG_ALLOWED_EMAILS,
    })

    return jsonResponse({
      slackCheckIn: slackCheckInConfigured(process.env),
      slackUserId: nlogSlackUserId(process.env),
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonResponse({ error: error.message }, error.status)
    }
    return jsonResponse({ error: 'Could not read Slack config' }, 500)
  }
}
