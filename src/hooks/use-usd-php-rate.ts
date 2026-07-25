import { useCallback, useEffect, useState } from 'react'
import {
  fetchUsdPhpRate,
  type UsdPhpRate,
} from '@/lib/exchange-rate'

export function useUsdPhpRate() {
  const [rate, setRate] = useState<UsdPhpRate | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async (forceRefresh = false) => {
    setIsLoading(true)
    setError(null)
    try {
      const next = await fetchUsdPhpRate({ forceRefresh })
      setRate(next)
      return next
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load USD/PHP rate'
      setError(message)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh(false)
  }, [refresh])

  return { rate, error, isLoading, refresh }
}
