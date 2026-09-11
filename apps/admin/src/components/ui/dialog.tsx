import { Dialog as Primitive } from '@base-ui/react/dialog';
import { X } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { IconButton } from './button';
import { cn } from '@/lib/utils';
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  busy?: boolean;
};
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  busy,
}: Props) {
  return (
    <Primitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <Primitive.Portal>
        <Primitive.Backdrop className="dialog-backdrop" />
        <Primitive.Popup className={cn('ui-dialog', className)}>
          <header className="dialog-header">
            <div>
              <Primitive.Title>{title}</Primitive.Title>
              {description && (
                <Primitive.Description>{description}</Primitive.Description>
              )}
            </div>
            <Primitive.Close
              render={
                <IconButton label="关闭对话框" disabled={busy}>
                  <X />
                </IconButton>
              }
            />
          </header>
          <div className="dialog-body">{children}</div>
          {footer && <footer className="dialog-footer">{footer}</footer>}
        </Primitive.Popup>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
export function Sheet(props: Props & { side?: 'left' | 'right' }) {
  return (
    <Dialog
      {...props}
      className={cn(
        'ui-sheet',
        `sheet-${props.side ?? 'right'}`,
        props.className,
      )}
    />
  );
}
