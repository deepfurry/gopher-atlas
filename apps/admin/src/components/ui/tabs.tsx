import { Tabs as Primitive } from '@base-ui/react/tabs';
import type { ReactNode } from 'react';
export function Tabs({
  value,
  onValueChange,
  items,
  label,
  children,
  className = '',
}: {
  value: string;
  onValueChange: (value: string) => void;
  items: { value: string; label: string; icon?: ReactNode }[];
  label: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Primitive.Root
      className={className}
      value={value}
      onValueChange={(next) => onValueChange(String(next))}
    >
      <Primitive.List className="ui-tabs" aria-label={label}>
        {items.map((item) => (
          <Primitive.Tab className="ui-tab" key={item.value} value={item.value}>
            {item.icon}
            {item.label}
          </Primitive.Tab>
        ))}
      </Primitive.List>
      {children}
    </Primitive.Root>
  );
}
export const TabPanel = Primitive.Panel;
