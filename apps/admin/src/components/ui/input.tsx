import type { ComponentProps } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn('ui-input', className)} {...props} />;
}
export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea className={cn('ui-input ui-textarea', className)} {...props} />
  );
}
export function SearchInput({ className, ...props }: ComponentProps<'input'>) {
  return (
    <div className={cn('ui-search', className)}>
      <MagnifyingGlass aria-hidden="true" />
      <Input type="search" placeholder="搜索…" {...props} />
    </div>
  );
}
