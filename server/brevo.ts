function parseFromAddress(from: string): { name: string; email: string } {
  const match = /^(.+?)\s*<([^>]+)>$/.exec(from.trim())
  if (match?.[1] && match[2]) {
    return { name: match[1].trim(), email: match[2].trim() }
  }
  return { name: 'NLog', email: from.trim() }
}

export async function sendPasswordResetEmail(input: {
  apiKey: string
  from: string
  to: string
  resetUrl: string
  appName?: string
}): Promise<void> {
  const appName = input.appName || 'NLog'
  const sender = parseFromAddress(input.from)

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': input.apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: {
        name: sender.name,
        email: sender.email,
      },
      to: [{ email: input.to }],
      subject: `Reset your ${appName} password`,
      htmlContent: `
        <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#0f172a">
          <p>Hi,</p>
          <p>We received a request to reset your ${appName} password.</p>
          <p>
            <a href="${input.resetUrl}" style="display:inline-block;background:#1e3a5f;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">
              Reset password
            </a>
          </p>
          <p style="font-size:13px;color:#64748b">
            This link expires in 1 hour. If you did not request a reset, you can ignore this email.
          </p>
          <p style="font-size:12px;color:#94a3b8;word-break:break-all">${input.resetUrl}</p>
        </div>
      `,
      textContent: `Reset your ${appName} password:\n\n${input.resetUrl}\n\nThis link expires in 1 hour. If you did not request a reset, ignore this email.`,
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(
      `Brevo email failed (${response.status}): ${detail.slice(0, 240)}`,
    )
  }
}
