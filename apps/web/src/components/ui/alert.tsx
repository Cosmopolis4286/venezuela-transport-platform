import type * as React from 'react';
import { cn } from '@/lib/utils';

function Alert({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<'div'> & { variant?: 'default' | 'destructive' | 'success' }) {
  return (
    <div
      role={variant === 'destructive' ? 'alert' : 'status'}
      data-slot="alert"
      className={cn(
        'rounded-lg border px-4 py-3 text-sm',
        variant === 'destructive' && 'border-destructive/40 bg-destructive/5 text-destructive',
        variant === 'success' &&
          'border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
        className,
      )}
      {...props}
    />
  );
}

export { Alert };
