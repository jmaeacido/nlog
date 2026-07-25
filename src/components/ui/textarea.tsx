import { type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'flex min-h-40 w-full rounded-lg border border-nlog-border bg-white px-3 py-2 text-sm outline-none ring-nlog-accent placeholder:text-slate-400 focus-visible:ring-2',
        className,
      )}
      {...props}
    />
  )
}
