import { convertUsdToPhp, type UsdPhpRate } from '@/lib/exchange-rate'
import { cn, formatPhp, formatUsd } from '@/lib/utils'

export function UsdWithPhp({
  amountUsd,
  rate,
  className,
  usdClassName,
  phpClassName,
  showRateHint = false,
}: {
  amountUsd: number
  rate: UsdPhpRate | null
  className?: string
  usdClassName?: string
  phpClassName?: string
  showRateHint?: boolean
}) {
  const php =
    rate && Number.isFinite(amountUsd)
      ? convertUsdToPhp(amountUsd, rate.rate)
      : null

  return (
    <span className={cn('inline-flex flex-col items-end gap-0.5', className)}>
      <span className={usdClassName}>{formatUsd(amountUsd)}</span>
      {php !== null && rate ? (
        <span className={cn('text-xs font-normal text-nlog-slate', phpClassName)}>
          ≈ {formatPhp(php)}
          {showRateHint && (
            <span className="ml-1 opacity-80">@ {rate.rate.toFixed(2)}</span>
          )}
        </span>
      ) : null}
    </span>
  )
}

export function ExchangeRateBanner({
  rate,
  error,
  isLoading,
  onRefresh,
}: {
  rate: UsdPhpRate | null
  error: string | null
  isLoading: boolean
  onRefresh?: () => void
}) {
  if (isLoading && !rate) {
    return (
      <p className="text-xs text-nlog-slate">Loading USD → PHP rate…</p>
    )
  }

  if (error && !rate) {
    return (
      <p className="text-xs text-amber-700">
        PHP conversion unavailable ({error}).
        {onRefresh && (
          <button
            type="button"
            className="ml-2 underline"
            onClick={onRefresh}
          >
            Retry
          </button>
        )}
      </p>
    )
  }

  if (!rate) return null

  return (
    <p className="text-xs text-nlog-slate">
      Live rate: <span className="font-medium text-nlog-navy">1 USD = {rate.rate.toFixed(4)} PHP</span>
      {' · '}
      {rate.provider}
      {' · '}
      PayPal rate
      {onRefresh && (
        <button
          type="button"
          className="ml-2 underline"
          onClick={onRefresh}
          disabled={isLoading}
        >
          Refresh
        </button>
      )}
    </p>
  )
}
