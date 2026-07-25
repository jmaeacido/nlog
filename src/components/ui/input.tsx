import { type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'flex min-h-11 w-full rounded-lg border border-nlog-border bg-white px-3 py-2 text-sm outline-none ring-nlog-accent placeholder:text-slate-400 focus-visible:ring-2',
        className,
      )}
      {...props}
    />
  )
}
