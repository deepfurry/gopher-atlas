import { Combobox } from '@base-ui/react/combobox';
import { CaretUpDown, Check } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { Button } from './button';
import type { SelectOption } from './select';
export function SearchSelect({
  value,
  options,
  onValueChange,
  search,
  onSearchChange,
  label,
  footer,
}: {
  value: string;
  options: SelectOption[];
  onValueChange: (value: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  label: string;
  footer?: ReactNode;
}) {
  const selected = options.find((option) => option.value === value) ?? null;
  return (
    <Combobox.Root
      items={options}
      value={selected}
      isItemEqualToValue={(a, b) => a.value === b.value}
      filter={null}
      onValueChange={(next) => {
        if (next) onValueChange(next.value);
      }}
      onInputValueChange={onSearchChange}
      inputValue={search}
    >
      <Combobox.Trigger
        render={
          <Button variant="outline" className="ui-select" aria-label={label} />
        }
      >
        <span>{selected?.label || label}</span>
        <CaretUpDown />
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner className="ui-positioner" sideOffset={5}>
          <Combobox.Popup className="ui-popup search-select-popup">
            <Combobox.Input
              className="ui-input"
              aria-label={`搜索${label}`}
              placeholder={`搜索${label}…`}
              maxLength={200}
            />
            <Combobox.List>
              {(option: SelectOption) => (
                <Combobox.Item
                  className="ui-option"
                  key={option.value}
                  value={option}
                  disabled={option.disabled}
                >
                  {option.label}
                  <Combobox.ItemIndicator>
                    <Check />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
            {!options.length && (
              <p className="caption picker-empty">没有匹配项</p>
            )}
            {footer && <div className="picker-footer">{footer}</div>}
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
