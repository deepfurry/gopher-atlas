import { useState, useRef } from 'react';
import { Popover } from '@base-ui/react/popover';
import { CalendarBlank, CaretLeft, CaretRight } from '@phosphor-icons/react';
import { Button, IconButton } from './button';
const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
function parse(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && iso(date) === value
    ? date
    : new Date();
}
export function DatePicker({
  value,
  onValueChange,
  label,
  disabled,
}: {
  value: string;
  onValueChange: (value: string) => void;
  label: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [focus, setFocus] = useState(() => parse(value));
  const grid = useRef<HTMLDivElement>(null);
  const start = new Date(focus.getFullYear(), focus.getMonth(), 1, 12);
  start.setDate(1 - ((start.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(day.getDate() + index);
    return day;
  });
  const move = (amount: number, months = false) => {
    const next = new Date(focus);
    if (months) {
      const day = next.getDate();
      next.setDate(1);
      next.setMonth(next.getMonth() + amount);
      next.setDate(
        Math.min(
          day,
          new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate(),
        ),
      );
    } else next.setDate(next.getDate() + amount);
    setFocus(next);
    requestAnimationFrame(() =>
      grid.current
        ?.querySelector<HTMLButtonElement>(`[data-date="${iso(next)}"]`)
        ?.focus(),
    );
  };
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setFocus(parse(value));
      }}
    >
      <Popover.Trigger
        render={
          <Button
            variant="outline"
            className="date-trigger"
            aria-label={label}
            disabled={disabled}
          />
        }
      >
        <CalendarBlank />
        {value || '选择日期'}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} className="ui-positioner">
          <Popover.Popup
            className="ui-popup date-popup"
            aria-label={label}
            initialFocus={() =>
              grid.current?.querySelector<HTMLButtonElement>(
                '[tabindex="0"]',
              ) ?? false
            }
          >
            <div className="calendar-header">
              <IconButton label="上个月" onClick={() => move(-1, true)}>
                <CaretLeft />
              </IconButton>
              <span aria-live="polite">
                {focus.getFullYear()} 年 {focus.getMonth() + 1} 月
              </span>
              <IconButton label="下个月" onClick={() => move(1, true)}>
                <CaretRight />
              </IconButton>
            </div>
            <div className="calendar-week" aria-hidden="true">
              {['一', '二', '三', '四', '五', '六', '日'].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div
              className="calendar-grid"
              ref={grid}
              role="grid"
              aria-label="选择日期"
            >
              {Array.from({ length: 6 }, (_, week) => (
                <div role="row" key={week}>
                  {days.slice(week * 7, week * 7 + 7).map((day) => (
                    <div
                      role="gridcell"
                      key={iso(day)}
                      aria-selected={value === iso(day)}
                    >
                      <button
                        type="button"
                        data-date={iso(day)}
                        tabIndex={iso(day) === iso(focus) ? 0 : -1}
                        className={
                          day.getMonth() !== focus.getMonth()
                            ? 'outside-month'
                            : ''
                        }
                        aria-label={day.toLocaleDateString('zh-CN', {
                          dateStyle: 'full',
                        })}
                        aria-current={
                          iso(day) === iso(new Date()) ? 'date' : undefined
                        }
                        onClick={() => {
                          onValueChange(iso(day));
                          setOpen(false);
                        }}
                        onKeyDown={(event) => {
                          const delta: Record<string, number> = {
                            ArrowLeft: -1,
                            ArrowRight: 1,
                            ArrowUp: -7,
                            ArrowDown: 7,
                          };
                          if (event.key in delta) {
                            event.preventDefault();
                            move(delta[event.key]!);
                          } else if (
                            event.key === 'PageUp' ||
                            event.key === 'PageDown'
                          ) {
                            event.preventDefault();
                            move(event.key === 'PageUp' ? -1 : 1, true);
                          } else if (
                            event.key === 'Home' ||
                            event.key === 'End'
                          ) {
                            event.preventDefault();
                            const weekday = (focus.getDay() + 6) % 7;
                            move(event.key === 'Home' ? -weekday : 6 - weekday);
                          }
                        }}
                      >
                        {day.getDate()}
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="calendar-footer">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onValueChange('');
                  setOpen(false);
                }}
              >
                清除日期
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onValueChange(iso(new Date()));
                  setOpen(false);
                }}
              >
                今天
              </Button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
