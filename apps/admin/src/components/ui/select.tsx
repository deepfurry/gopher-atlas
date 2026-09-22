import { Select as Primitive } from '@base-ui/react/select';
import { Check, CaretUpDown } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
export type SelectOption = { value: string; label: string; disabled?: boolean };
export function Select({
  value,
  onValueChange,
  options,
  label,
  id,
  disabled,
  className,
  placeholder = '请选择',
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  label: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  return (
    <Primitive.Root
      value={value}
      onValueChange={(next) => next !== null && onValueChange(next)}
      items={options}
      disabled={disabled}
    >
      <Primitive.Trigger
        id={id}
        aria-label={label}
        className={cn('ui-input ui-select', className)}
      >
        <Primitive.Value>
          {options.find((option) => option.value === value)?.label ??
            placeholder}
        </Primitive.Value>
        <Primitive.Icon>
          <CaretUpDown />
        </Primitive.Icon>
      </Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Positioner
          className="ui-positioner"
          sideOffset={5}
          alignItemWithTrigger={false}
        >
          <Primitive.Popup className="ui-popup select-popup">
            <Primitive.List>
              {options.map((option) => (
                <Primitive.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className="ui-option"
                >
                  <Primitive.ItemText>{option.label}</Primitive.ItemText>
                  <Primitive.ItemIndicator>
                    <Check />
                  </Primitive.ItemIndicator>
                </Primitive.Item>
              ))}
            </Primitive.List>
          </Primitive.Popup>
        </Primitive.Positioner>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
