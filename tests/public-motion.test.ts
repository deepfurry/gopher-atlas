// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMotionScope } from '../apps/web/src/lib/motion';
import { mountSelect } from '../apps/web/src/lib/explorer';

let preference: EventTarget & { matches: boolean };
const native: {
  cancel: ReturnType<typeof vi.fn>;
  onfinish?: () => void;
  playbackRate: number;
  currentTime: number;
}[] = [];
const originalAnimate = Element.prototype.animate;
beforeEach(() => {
  preference = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal('matchMedia', () => preference);
  native.length = 0;
  Element.prototype.animate = vi.fn(() => {
    const animation = { cancel: vi.fn(), playbackRate: 1, currentTime: 200 };
    native.push(animation);
    return animation as unknown as Animation;
  });
});
afterEach(() => {
  window.dispatchEvent(new Event('pagehide'));
  Element.prototype.animate = originalAnimate;
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});
it('cancels a previous transition immediately, restores CSS and never runs its stale close callback', async () => {
  const element = document.createElement('div');
  document.body.append(element);
  const motion = createMotionScope(),
    closed = vi.fn();
  motion.exit(element, closed);
  expect(native).toHaveLength(2);
  const closing = [...native];
  motion.enter([element]);
  expect(
    closing.every((animation) => animation.cancel.mock.calls.length > 0),
  ).toBe(true);
  for (const animation of native.slice(2)) animation.onfinish?.();
  await vi.waitFor(() => expect(element.style.opacity).toBe(''));
  expect(element.style.transform).toBe('');
  expect(closed).not.toHaveBeenCalled();
  motion.dispose();
});
it('settles in-flight transitions when reduced motion changes, and skips future animation', () => {
  const element = document.createElement('div');
  const motion = createMotionScope(),
    closed = vi.fn();
  motion.exit(element, closed);
  preference.matches = true;
  preference.dispatchEvent(new Event('change'));
  expect(closed).toHaveBeenCalledOnce();
  expect(element.style.opacity).toBe('');
  expect(
    native.every((animation) => animation.cancel.mock.calls.length > 0),
  ).toBe(true);
  const count = native.length;
  motion.enter([element]);
  expect(native).toHaveLength(count);
  motion.dispose();
});
it('a closing Select is inert immediately and rapid reopening retains keyboard selection and visibility', async () => {
  document.body.innerHTML =
    '<div data-select data-open="false"><input value=""><button><span data-value>All</span></button><div role="listbox"><button role="option" data-value="">All</button><button role="option" data-value="go">Go</button></div></div>';
  const root = document.querySelector<HTMLElement>('[data-select]')!;
  const trigger = root.querySelector('button')!,
    list = root.querySelector<HTMLElement>('[role=listbox]')!;
  mountSelect(root)();
  trigger.click();
  trigger.click();
  expect(root.dataset.leaving).toBe('true');
  expect(list.inert).toBe(true);
  expect(list.getAttribute('aria-hidden')).toBe('true');
  trigger.click();
  root.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
  );
  expect(document.activeElement?.textContent).toBe('Go');
  expect(list.inert).toBe(false);
  expect(root.dataset.leaving).toBeUndefined();
  root.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  expect(document.activeElement).toBe(trigger);
  preference.matches = true;
  preference.dispatchEvent(new Event('change'));
  expect(root.dataset.open).toBe('false');
  expect(root.dataset.leaving).toBeUndefined();
  expect(list.style.opacity).toBe('');
});
