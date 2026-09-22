import { useId, type ReactNode, type ComponentProps } from 'react';
import { ArrowClockwise, FileText, WarningCircle } from '@phosphor-icons/react';
import { Button } from './button';
import { cn } from '@/lib/utils';
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <p className="caption">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="caption">{description}</p>}
      </div>
      {actions && <div className="toolbar">{actions}</div>}
    </header>
  );
}
export function Toolbar({
  children,
  className,
  ...props
}: ComponentProps<'div'>) {
  return (
    <div className={cn('toolbar', className)} {...props}>
      {children}
    </div>
  );
}
export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="filter-bar">{children}</div>;
}
export function FormField({
  label,
  help,
  error,
  children,
  required,
}: {
  label: string;
  help?: string;
  error?: string;
  required?: boolean;
  children: (props: {
    id: string;
    'aria-describedby'?: string;
    'aria-invalid'?: boolean;
  }) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="form-field">
      <label htmlFor={id}>
        {label}
        {required && (
          <span aria-hidden="true" className="required">
            {' '}
            *
          </span>
        )}
      </label>
      {children({
        id,
        'aria-describedby': help || error ? `${id}-help` : undefined,
        'aria-invalid': !!error,
      })}
      {(help || error) && (
        <p id={`${id}-help`} className={error ? 'error-message' : 'caption'}>
          {error || help}
        </p>
      )}
    </div>
  );
}
export function EmptyState({
  title = '暂无内容',
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <FileText aria-hidden="true" />
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
export function LoadingState({ label = '正在加载…' }: { label?: string }) {
  return (
    <div className="loading-state" role="status">
      <span className="loading-dot" />
      {label}
      <div className="skeleton-lines" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}
export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="error-state" role="alert">
      <WarningCircle aria-hidden="true" />
      <span>{message}</span>
      {retry && (
        <Button variant="outline" onClick={retry}>
          <ArrowClockwise />
          重试
        </Button>
      )}
    </div>
  );
}
export function Table({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="table-scroll" role="region" tabIndex={0} aria-label={label}>
      <table>{children}</table>
    </div>
  );
}
export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
  className?: string;
}) {
  return (
    <span className={cn('badge', `badge-${tone}`, className)}>{children}</span>
  );
}
export function Avatar({
  name,
  url,
  size = 30,
}: {
  name: string;
  url?: string;
  size?: number;
}) {
  return (
    <span className="avatar" style={{ width: size, height: size }}>
      {url?.startsWith('https://') ? (
        <img
          src={url}
          alt=""
          width={size}
          height={size}
          referrerPolicy="no-referrer"
        />
      ) : (
        name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
