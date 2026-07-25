import { type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'outline' | 'ghost' | 'secondary'
  size?: 'default' | 'sm' | 'lg' | 'icon'
}

export function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
        variant === 'default' &&
          'bg-nlog-navy text-white hover:bg-nlog-navy-light',
        variant === 'outline' &&
          'border border-nlog-border bg-white hover:bg-slate-50',
        variant === 'ghost' && 'hover:bg-slate-100',
        variant === 'secondary' &&
          'bg-slate-100 text-slate-900 hover:bg-slate-200',
        size === 'default' && 'min-h-11 px-4 py-2 text-sm',
        size === 'sm' && 'min-h-9 px-3 text-xs',
        size === 'lg' && 'min-h-12 px-6 text-base',
        size === 'icon' && 'h-11 w-11',
        className,
      )}
      {...props}
    />
  )
}
