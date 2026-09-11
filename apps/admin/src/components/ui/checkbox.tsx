import { Checkbox as Primitive } from '@base-ui/react/checkbox';
import { Switch as SwitchPrimitive } from '@base-ui/react/switch';
import { Check, Minus } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
export function Checkbox({
  label,
  checked,
  onCheckedChange,
  disabled,
  indeterminate,
}: {
  label: ReactNode;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  disabled?: boolean;
  indeterminate?: boolean;
}) {
  return (
    <label className="check-label">
      <Primitive.Root
        className="ui-checkbox"
        checked={checked}
        indeterminate={indeterminate}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      >
        <Primitive.Indicator>
          {indeterminate ? <Minus /> : <Check />}
        </Primitive.Indicator>
      </Primitive.Root>
      <span>{label}</span>
    </label>
  );
}
export function Switch({
  label,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="check-label">
      <SwitchPrimitive.Root
        className="ui-switch"
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      >
        <SwitchPrimitive.Thumb className="switch-thumb" />
      </SwitchPrimitive.Root>
      <span>{label}</span>
    </label>
  );
}
