import { Menu } from '@base-ui/react/menu';
import type { ReactElement, ReactNode } from 'react';
export function DropdownMenu({
  trigger,
  children,
  label,
}: {
  trigger: ReactElement;
  children: ReactNode;
  label?: string;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger render={trigger} />
      <Menu.Portal>
        <Menu.Positioner className="ui-positioner" align="end" sideOffset={6}>
          <Menu.Popup aria-label={label} className="ui-popup menu-popup">
            {children}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
export function MenuItem({
  children,
  onClick,
  disabled,
  danger = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Menu.Item
      className={`ui-menu-item${danger ? ' danger' : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Menu.Item>
  );
}
export const MenuSeparator = () => (
  <Menu.Separator className="menu-separator" />
);
export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="menu-label">{children}</div>;
}
export function MenuRadioGroup({
  value,
  onValueChange,
  options,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string; icon?: ReactNode }[];
}) {
  return (
    <Menu.RadioGroup value={value} onValueChange={onValueChange}>
      {options.map((option) => (
        <Menu.RadioItem
          closeOnClick
          className="ui-menu-item"
          value={option.value}
          key={option.value}
        >
          {option.icon}
          {option.label}
          <Menu.RadioItemIndicator className="menu-radio-dot" />
        </Menu.RadioItem>
      ))}
    </Menu.RadioGroup>
  );
}
