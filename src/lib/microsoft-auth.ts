import {
  BrowserAuthError,
  PublicClientApplication,
  type AccountInfo,
  type AuthenticationResult,
} from '@azure/msal-browser'

const SCOPES = ['User.Read', 'Files.Read.All', 'Sites.Read.All', 'offline_access']

let msalInstance: PublicClientApplication | null = null
let initPromise: Promise<PublicClientApplication | null> | null = null
let lastRedirectToken: string | null = null

export function getMsalClientId(): string {
  return (import.meta.env.VITE_MSAL_CLIENT_ID as string | undefined)?.trim() || ''
}

export function isMicrosoftAuthConfigured(): boolean {
  return Boolean(getMsalClientId())
}

export function hasPendingAuthResponse(): boolean {
  if (typeof window === 'undefined') return false
  const hash = window.location.hash || ''
  const search = window.location.search || ''
  return (
    /[#&?]code=/i.test(hash) ||
    /[#&?]code=/i.test(search) ||
    /[#&?]error=/i.test(hash) ||
    /[#&?]error=/i.test(search) ||
    /[#&?]id_token=/i.test(hash)
  )
}

function isInteractionInProgress(error: unknown): boolean {
  return (
    error instanceof BrowserAuthError &&
    (error.errorCode === 'interaction_in_progress' ||
      error.message.includes('interaction_in_progress'))
  )
}

async function getMsal(): Promise<PublicClientApplication | null> {
  const clientId = getMsalClientId()
  if (!clientId) return null

  if (msalInstance) return msalInstance
  if (initPromise) return initPromise

  initPromise = (async () => {
    const app = new PublicClientApplication({
      auth: {
        clientId,
        authority: 'https://login.microsoftonline.com/common',
        redirectUri: window.location.origin,
        postLogoutRedirectUri: window.location.origin,
      },
      cache: {
        cacheLocation: 'localStorage',
      },
    })
    await app.initialize()

    try {
      const redirectResult = await app.handleRedirectPromise()
      if (redirectResult?.account) {
        app.setActiveAccount(redirectResult.account)
        if (redirectResult.accessToken) {
          lastRedirectToken = redirectResult.accessToken
        }
      }
    } catch (error) {
      console.error('MSAL handleRedirectPromise failed', error)
    }

    if (!app.getActiveAccount()) {
      const accounts = app.getAllAccounts()
      if (accounts[0]) app.setActiveAccount(accounts[0])
    }

    msalInstance = app
    return app
  })()

  return initPromise
}

export async function getMicrosoftAccount(): Promise<AccountInfo | null> {
  const app = await getMsal()
  if (!app) return null
  const active = app.getActiveAccount()
  if (active) return active
  const accounts = app.getAllAccounts()
  const account = accounts[0] ?? null
  if (account) app.setActiveAccount(account)
  return account
}

/**
 * Starts Microsoft sign-in via full-page redirect.
 * Returns an account if already signed in; null if the browser is navigating away.
 */
export async function connectMicrosoftAccount(): Promise<AccountInfo | null> {
  const app = await getMsal()
  if (!app) {
    throw new Error(
      'Microsoft sign-in is not configured. Set VITE_MSAL_CLIENT_ID for this deployment.',
    )
  }

  // Always finish processing a return hash before starting a new login.
  const existing = await getMicrosoftAccount()
  if (existing) return existing

  if (hasPendingAuthResponse()) {
    throw new Error(
      'Finishing Microsoft sign-in… If this stays stuck, remove the #code=… from the URL and try again.',
    )
  }

  try {
    await app.loginRedirect({
      scopes: SCOPES,
      prompt: 'select_account',
    })
    return null
  } catch (error) {
    if (isInteractionInProgress(error)) {
      // Prior redirect still settling — wait briefly, then use any account it created.
      await new Promise((resolve) => setTimeout(resolve, 800))
      const account = await getMicrosoftAccount()
      if (account) return account
      throw new Error(
        'Sign-in is already in progress. Wait a few seconds, refresh the page, then try once.',
      )
    }
    throw error
  }
}

export async function disconnectMicrosoftAccount(): Promise<void> {
  const app = await getMsal()
  lastRedirectToken = null
  if (!app) return
  const account = app.getActiveAccount() ?? app.getAllAccounts()[0]
  if (account) {
    await app.logoutRedirect({ account })
    return
  }
  await app.clearCache()
}

export async function getMicrosoftAccessToken(): Promise<string | null> {
  const app = await getMsal()
  if (!app) return null

  if (lastRedirectToken) {
    const token = lastRedirectToken
    return token
  }

  const account = app.getActiveAccount() ?? app.getAllAccounts()[0]
  if (!account) return null

  try {
    const result: AuthenticationResult = await app.acquireTokenSilent({
      account,
      scopes: SCOPES,
    })
    lastRedirectToken = result.accessToken
    return result.accessToken
  } catch {
    // Do not start acquireTokenRedirect here — that causes interaction_in_progress
    // right after loginRedirect returns. Caller should prompt a fresh sign-in instead.
    return null
  }
}
