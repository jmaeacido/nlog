export interface UsdPhpRate {
  base: 'USD'
  quote: 'PHP'
  rate: number
  asOf: string
  provider: string
  source: string
}

let cachedRate: { value: UsdPhpRate; expiresAt: number } | null = null
const CACHE_MS = 60 * 60 * 1000

async function fetchFromOpenErApi(): Promise<UsdPhpRate> {
  const response = await fetch('https://open.er-api.com/v6/latest/USD', {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`open.er-api failed (${response.status})`)
  }

  const payload = (await response.json()) as {
    result?: string
    rates?: { PHP?: number }
    time_last_update_utc?: string
  }

  const rate = payload.rates?.PHP
  if (payload.result !== 'success' || !rate || !Number.isFinite(rate) || rate <= 0) {
    throw new Error('open.er-api returned an invalid PHP rate')
  }

  return {
    base: 'USD',
    quote: 'PHP',
    rate: Number(rate.toFixed(4)),
    asOf: payload.time_last_update_utc ?? new Date().toUTCString(),
    provider: 'ExchangeRate-API',
    source: 'https://open.er-api.com/v6/latest/USD',
  }
}

async function fetchFromFrankfurter(): Promise<UsdPhpRate> {
  const response = await fetch(
    'https://api.frankfurter.app/latest?from=USD&to=PHP',
    { headers: { Accept: 'application/json' } },
  )
  if (!response.ok) {
    throw new Error(`Frankfurter failed (${response.status})`)
  }

  const payload = (await response.json()) as {
    date?: string
    rates?: { PHP?: number }
  }

  const rate = payload.rates?.PHP
  if (!rate || !Number.isFinite(rate) || rate <= 0) {
    throw new Error('Frankfurter returned an invalid PHP rate')
  }

  return {
    base: 'USD',
    quote: 'PHP',
    rate: Number(rate.toFixed(4)),
    asOf: payload.date
      ? new Date(`${payload.date}T00:00:00Z`).toUTCString()
      : new Date().toUTCString(),
    provider: 'Frankfurter',
    source: 'https://api.frankfurter.app/latest?from=USD&to=PHP',
  }
}

export async function getUsdPhpRate(options?: {
  forceRefresh?: boolean
}): Promise<UsdPhpRate> {
  const now = Date.now()
  if (!options?.forceRefresh && cachedRate && cachedRate.expiresAt > now) {
    return cachedRate.value
  }

  const errors: string[] = []

  try {
    const value = await fetchFromOpenErApi()
    cachedRate = { value, expiresAt: now + CACHE_MS }
    return value
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'open.er-api error')
  }

  try {
    const value = await fetchFromFrankfurter()
    cachedRate = { value, expiresAt: now + CACHE_MS }
    return value
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Frankfurter error')
  }

  if (cachedRate) {
    return cachedRate.value
  }

  throw new Error(`Unable to fetch USD/PHP rate: ${errors.join('; ')}`)
}

export function convertUsdToPhp(amountUsd: number, rate: number): number {
  return Math.round(amountUsd * rate * 100) / 100
}

export function formatExchangeRateSummary(rate: UsdPhpRate): string {
  return `1 USD = ${rate.rate.toFixed(4)} PHP (as of ${rate.asOf}, via ${rate.provider}). Approximate mid-market reference only — Wise payout rates may differ.`
}
