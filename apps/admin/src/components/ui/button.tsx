// Adapted from shadcn/ui base-nova Button (MIT). See docs/design-system.md.
import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex h-8 shrink-0 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground hover:bg-primary/90',
        outline: 'border-border bg-background text-foreground hover:bg-muted',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

function Button({
  className,
  variant,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, className }))}
      {...props}
    />
  );
}
export { Button, buttonVariants };
