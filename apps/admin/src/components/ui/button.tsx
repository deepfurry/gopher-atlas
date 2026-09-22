// Base UI supplies keyboard/disabled semantics; appearance is shared by all actions.
import { Button as Primitive } from '@base-ui/react/button';
import { cn } from '@/lib/utils';
type Props = Primitive.Props & {
  variant?: 'default' | 'outline' | 'ghost' | 'danger';
  size?: 'default' | 'sm' | 'icon';
};
export function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: Props) {
  return (
    <Primitive
      className={cn(
        'ui-button',
        `button-${variant}`,
        `button-${size}`,
        className,
      )}
      {...props}
    />
  );
}
export function IconButton({
  label,
  children,
  ...props
}: Omit<Props, 'size'> & { label: string }) {
  return (
    <Button variant="ghost" size="icon" aria-label={label} {...props}>
      {children}
    </Button>
  );
}
