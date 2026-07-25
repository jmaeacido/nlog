import { apiJson } from './api-client'

export interface UsdPhpRate {
  base: 'USD'
  quote: 'PHP'
  rate: number
  asOf: string
  provider: string
  source: string
}

export function convertUsdToPhp(amountUsd: number, rate: number): number {
  return Math.round(amountUsd * rate * 100) / 100
}

export async function fetchUsdPhpRate(options?: {
  forceRefresh?: boolean
}): Promise<UsdPhpRate> {
  const query = options?.forceRefresh ? '?refresh=1' : ''
  const payload = await apiJson<UsdPhpRate>(`/api/exchange-rate${query}`, {
    method: 'GET',
  })

  if (!payload.rate || !Number.isFinite(payload.rate)) {
    throw new Error('Invalid exchange rate payload')
  }

  return payload
}
