export interface UsdPhpRate {
  base: 'USD'
  quote: 'PHP'
  rate: number
  asOf: string
  provider: string
  source: string
}

type ExchangeRateEnv = Record<string, string | undefined>

let configuredEnv: ExchangeRateEnv | undefined
let cachedRate: { value: UsdPhpRate; expiresAt: number } | null = null
const CACHE_MS = 60 * 60 * 1000
const DEFAULT_PAYPAL_SPREAD_PERCENT = 4

export function configureExchangeRate(env: ExchangeRateEnv): void {
  configuredEnv = env
  cachedRate = null
}

function exchangeRateEnv(): ExchangeRateEnv {
  return configuredEnv ?? process.env
}

function positiveNumber(value: string | undefined): number | null {
  if (!value?.trim()) return null
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function getManualPayPalRate(): UsdPhpRate | null {
  const rate = positiveNumber(exchangeRateEnv().PAYPAL_USD_PHP_RATE)
  if (rate === null) return null

  return {
    base: 'USD',
    quote: 'PHP',
    rate: Number(rate.toFixed(4)),
    asOf: new Date().toISOString(),
    provider: 'PayPal rate (manual)',
    source: 'PAYPAL_USD_PHP_RATE',
  }
}

function getPayPalSpreadPercent(): number {
  const raw = exchangeRateEnv().PAYPAL_CONVERSION_SPREAD_PERCENT?.trim()
  if (!raw) return DEFAULT_PAYPAL_SPREAD_PERCENT

  const configured = Number(raw)
  if (!Number.isFinite(configured) || configured < 0 || configured >= 100) {
    throw new Error(
      'PAYPAL_CONVERSION_SPREAD_PERCENT must be between 0 and 100',
    )
  }
  return configured
}

async function fetchFromOpenErApi(): Promise<UsdPhpRate> {
  const source = 'https://open.er-api.com/v6/latest/USD'
  const response = await fetch(source, {
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
  if (
    payload.result !== 'success' ||
    !rate ||
    !Number.isFinite(rate) ||
    rate <= 0
  ) {
    throw new Error('open.er-api returned an invalid PHP rate')
  }

  return {
    base: 'USD',
    quote: 'PHP',
    rate,
    asOf: payload.time_last_update_utc ?? new Date().toISOString(),
    provider: 'ExchangeRate-API',
    source,
  }
}

async function fetchFromFrankfurter(): Promise<UsdPhpRate> {
  const source = 'https://api.frankfurter.app/latest?from=USD&to=PHP'
  const response = await fetch(source, {
    headers: { Accept: 'application/json' },
  })
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
    rate,
    asOf: payload.date
      ? new Date(`${payload.date}T00:00:00Z`).toISOString()
      : new Date().toISOString(),
    provider: 'Frankfurter',
    source,
  }
}

function estimatePayPalRate(midMarket: UsdPhpRate): UsdPhpRate {
  const spreadPercent = getPayPalSpreadPercent()
  const rate = midMarket.rate * (1 - spreadPercent / 100)
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('Configured PayPal conversion spread is invalid')
  }

  return {
    ...midMarket,
    rate: Number(rate.toFixed(4)),
    provider: `Estimated PayPal (${spreadPercent}% spread)`,
  }
}

export async function getUsdPhpRate(options?: {
  forceRefresh?: boolean
}): Promise<UsdPhpRate> {
  const manualRate = getManualPayPalRate()
  if (manualRate) return manualRate

  const now = Date.now()
  if (!options?.forceRefresh && cachedRate && cachedRate.expiresAt > now) {
    return cachedRate.value
  }

  const errors: string[] = []
  for (const fetchRate of [fetchFromOpenErApi, fetchFromFrankfurter]) {
    try {
      const value = estimatePayPalRate(await fetchRate())
      cachedRate = { value, expiresAt: now + CACHE_MS }
      return value
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown rate error')
    }
  }

  if (cachedRate) return cachedRate.value
  throw new Error(
    `Unable to estimate PayPal USD/PHP rate: ${errors.join('; ')}`,
  )
}

export function convertUsdToPhp(amountUsd: number, rate: number): number {
  return Math.round(amountUsd * rate * 100) / 100
}

export function formatExchangeRateSummary(rate: UsdPhpRate): string {
  return `1 USD = ${rate.rate.toFixed(4)} PHP (as of ${rate.asOf}, via ${rate.provider}). This is an estimate unless a manual PayPal rate is configured; the final PayPal transaction rate may vary.`
}
