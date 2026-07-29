# NLog Check-In — Slack app branding

Use these assets when customizing **NLog Check-In** in [api.slack.com/apps](https://api.slack.com/apps).

## Display Information

| Field | Value |
|-------|--------|
| **App icon** | Upload [`slack-app-icon-512.png`](slack-app-icon-512.png) (512×512) |
| **Background color** | `#1e3a5f` (NLog navy) |
| **Short description** | See below |
| **Long description** | See below |

### Short description (copy/paste)

```
Publishes Alchemy Dev Mon/Wed/Fri contractor check-ins from NLog to the Output Reporting Channel. Status reports — not timesheets.
```

### Long description (copy/paste)

```
NLog Check-In is the Slack companion for NLog (nlog.kaila-app.com) — the Alchemy Dev invoice and worklog app.

Contractors draft thrice-weekly productivity reports (Section 7) in NLog, then post them to the Output Reporting Channel with one click. Reports follow the Monday / Wednesday / Friday format: what you're working on, completed deliverables (grouped by deliverable, not sub-steps), pending work, blockers with a Point Person, help/confirmation asks, and ETAs.

• Cadence: Mon, Wed, Fri before 9:00 PM Asia/Manila
• Saves before 9:00 AM PHT schedule the Slack post for 8:55 PM PHT
• Completed must match billable worklogs — same truth as your invoice
• Prefill from worklogs or draft with Logger AI inside NLog
• After each post, you get a DM with a link to the channel message

This bot only posts check-ins; you compose and submit from the Check-in tab in NLog.
```

### Steps in Slack

1. Open your **NLog Check-In** app → **Basic Information**
2. Under **Display Information**:
   - **App icon** → Upload `deploy/slack-app-icon-512.png`
   - **Background color** → `#1e3a5f`
3. **Save Changes**

The icon is the NLog document mark (navy square, white **N**, teal folded corner) — same as the NLog PWA.

## Bot token (for NLog server)

After branding, go to **OAuth & Permissions** → copy **Bot User OAuth Token** (`xoxb-…`) into `/var/www/nlog/.env.local`:

```env
SLACK_BOT_TOKEN=xoxb-...
SLACK_CHECKIN_CHANNEL_ID=C0BKZQLL8HL
NLOG_SLACK_USER_ID=U0BA02D032S
```

Then: `sudo systemctl restart nlog.service`

Invite the bot in the Output Reporting channel: `/invite @NLog Check-In`
