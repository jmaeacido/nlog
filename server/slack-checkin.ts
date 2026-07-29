export interface SlackCheckInConfig {
  botToken: string
  channelId: string
}

export function slackCheckInConfigured(env: {
  SLACK_BOT_TOKEN?: string
  SLACK_CHECKIN_CHANNEL_ID?: string
}): boolean {
  return Boolean(
    env.SLACK_BOT_TOKEN?.trim() && env.SLACK_CHECKIN_CHANNEL_ID?.trim(),
  )
}

export function requireSlackCheckInConfig(env: {
  SLACK_BOT_TOKEN?: string
  SLACK_CHECKIN_CHANNEL_ID?: string
}): SlackCheckInConfig {
  const botToken = env.SLACK_BOT_TOKEN?.trim()
  const channelId = env.SLACK_CHECKIN_CHANNEL_ID?.trim()

  if (!botToken) {
    throw new Error('SLACK_BOT_TOKEN is not configured on the server.')
  }
  if (!channelId) {
    throw new Error('SLACK_CHECKIN_CHANNEL_ID is not configured on the server.')
  }

  return { botToken, channelId }
}

export async function postCheckInToSlack(
  config: SlackCheckInConfig,
  text: string,
): Promise<{ ts: string; permalink: string | null }> {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new Error('Check-in text is empty.')
  }
  if (trimmed.length > 12_000) {
    throw new Error('Check-in text is too long for Slack.')
  }

  const joinResult = await ensureBotInChannel(config)

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.botToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      channel: config.channelId,
      text: trimmed,
      unfurl_links: false,
      unfurl_media: false,
    }),
  })

  const json = (await response.json()) as {
    ok?: boolean
    error?: string
    ts?: string
  }

  if (!json.ok || !json.ts) {
    const detail = json.error ?? 'unknown_error'
    if (detail === 'not_in_channel') {
      if (joinResult.error === 'missing_scope') {
        throw new Error(
          `Slack cannot post to the configured channel (${config.channelId}). The installed bot token is missing channels:join (and may also be missing chat:write.public). Reinstall NLog Check-In in Slack to grant the scopes in deploy/slack-app-manifest.json, then verify SLACK_CHECKIN_CHANNEL_ID matches the Output Reporting channel.`,
        )
      }
      throw new Error(
        `Slack cannot post to the configured channel (${config.channelId}). NLog Check-In may already be visible in Output Reporting, but this token is not a member of that channel. Verify SLACK_CHECKIN_CHANNEL_ID, then remove and re-add NLog Check-In to that exact channel.`,
      )
    }
    throw new Error(`Slack post failed: ${detail}`)
  }

  const permalink = await fetchSlackPermalink(
    config.botToken,
    config.channelId,
    json.ts,
  )

  return { ts: json.ts, permalink }
}

export async function scheduleCheckInToSlack(
  config: SlackCheckInConfig,
  text: string,
  postAt: number,
  replaceScheduledMessageId?: string,
): Promise<{ scheduledMessageId: string; postAt: number }> {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('Check-in text is empty.')
  if (trimmed.length > 12_000) {
    throw new Error('Check-in text is too long for Slack.')
  }

  await ensureBotInChannel(config)

  if (replaceScheduledMessageId) {
    await fetch('https://slack.com/api/chat.deleteScheduledMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.botToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        channel: config.channelId,
        scheduled_message_id: replaceScheduledMessageId,
      }),
    })
  }

  const response = await fetch('https://slack.com/api/chat.scheduleMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.botToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      channel: config.channelId,
      text: trimmed,
      post_at: postAt,
      unfurl_links: false,
      unfurl_media: false,
    }),
  })
  const json = (await response.json()) as {
    ok?: boolean
    error?: string
    scheduled_message_id?: string
    post_at?: number
  }
  if (!json.ok || !json.scheduled_message_id) {
    throw new Error(`Slack scheduling failed: ${json.error ?? 'unknown_error'}`)
  }
  return {
    scheduledMessageId: json.scheduled_message_id,
    postAt: json.post_at ?? postAt,
  }
}

/** Schedule only when saved before 9:00 AM on a Mon/Wed/Fri in Manila. */
export function getAutomaticCheckInPostAt(now = new Date()): number | null {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  const weekday = get('weekday')
  if (!['Mon', 'Wed', 'Fri'].includes(weekday)) return null
  const hour = Number(get('hour') === '24' ? '0' : get('hour'))
  if (hour >= 9) return null
  const year = Number(get('year'))
  const month = Number(get('month'))
  const day = Number(get('day'))
  // 20:55 Asia/Manila (UTC+8) = 12:55 UTC.
  return Math.floor(Date.UTC(year, month - 1, day, 12, 55) / 1000)
}

export async function dmSlackUser(
  botToken: string,
  slackUserId: string,
  text: string,
): Promise<boolean> {
  const open = await fetch('https://slack.com/api/conversations.open', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${botToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ users: slackUserId }),
  })

  const openJson = (await open.json()) as {
    ok?: boolean
    channel?: { id?: string }
  }

  if (!openJson.ok || !openJson.channel?.id) {
    return false
  }

  const post = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${botToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      channel: openJson.channel.id,
      text,
    }),
  })

  const postJson = (await post.json()) as { ok?: boolean }
  return Boolean(postJson.ok)
}

export function nlogSlackUserId(env: {
  NLOG_SLACK_USER_ID?: string
}): string | null {
  const id = env.NLOG_SLACK_USER_ID?.trim()
  return id || null
}

interface SlackJoinResult {
  ok: boolean
  error?: string
}

async function ensureBotInChannel(
  config: SlackCheckInConfig,
): Promise<SlackJoinResult> {
  const response = await fetch('https://slack.com/api/conversations.join', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.botToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ channel: config.channelId }),
  })

  const json = (await response.json()) as { ok?: boolean; error?: string }

  // Posting can still work after a manual invitation or with chat:write.public,
  // so preserve the join result for a useful error only if posting then fails.
  return {
    ok: Boolean(json.ok || json.error === 'already_in_channel'),
    error: json.error,
  }
}

async function fetchSlackPermalink(
  botToken: string,
  channel: string,
  ts: string,
): Promise<string | null> {
  const url = new URL('https://slack.com/api/chat.getPermalink')
  url.searchParams.set('channel', channel)
  url.searchParams.set('message_ts', ts)

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${botToken}` },
  })

  const json = (await response.json()) as {
    ok?: boolean
    permalink?: string
  }

  return json.ok ? json.permalink ?? null : null
}
