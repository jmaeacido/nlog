import { apiJson } from './api-client'

export interface PostCheckInSlackResult {
  ok: true
  ts: string
  permalink: string | null
}

export async function requestPostCheckInSlack(
  text: string,
): Promise<PostCheckInSlackResult> {
  return apiJson<PostCheckInSlackResult>('/api/post-checkin-slack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
}

export type ScheduleCheckInSlackResult =
  | {
      ok: true
      scheduled: true
      scheduledMessageId: string
      postAt: number
    }
  | { ok: true; scheduled: false; reason: string }

export async function requestScheduleCheckInSlack(
  text: string,
  replaceScheduledMessageId?: string,
): Promise<ScheduleCheckInSlackResult> {
  return apiJson<ScheduleCheckInSlackResult>('/api/schedule-checkin-slack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, replaceScheduledMessageId }),
  })
}

export interface SlackCheckInConfigResponse {
  slackCheckIn: boolean
  slackUserId: string | null
}

export async function fetchSlackCheckInConfig(): Promise<SlackCheckInConfigResponse> {
  try {
    return await apiJson<SlackCheckInConfigResponse>('/api/slack-config')
  } catch {
    return { slackCheckIn: false, slackUserId: null }
  }
}

export async function fetchSlackCheckInConfigured(): Promise<boolean> {
  const config = await fetchSlackCheckInConfig()
  return config.slackCheckIn
}
