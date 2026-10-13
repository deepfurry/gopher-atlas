// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMotionScope, mountMotion } from '../apps/web/src/lib/motion';
import { mountSelect } from '../apps/web/src/lib/explorer';

let preference: EventTarget & { matches: boolean };
const native: {
  cancel: ReturnType<typeof vi.fn>;
  onfinish?: () => void;
  playbackRate: number;
  currentTime: number;
  target: Element;
  timing: KeyframeAnimationOptions;
}[] = [];
const originalAnimate = Element.prototype.animate;
beforeEach(() => {
  preference = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal('matchMedia', () => preference);
  native.length = 0;
  Element.prototype.animate = vi.fn(function (this: Element, _frames, timing) {
    const animation = {
      cancel: vi.fn(),
      playbackRate: 1,
      currentTime: 200,
      target: this,
      timing: timing as KeyframeAnimationOptions,
    };
    native.push(animation);
    return animation as unknown as Animation;
  });
});
function heroSetup() {
  document.body.innerHTML =
    '<div class="header-inner"><a class="brand">Brand</a><nav id="primary-navigation"></nav><div data-header-mobile></div></div><section class="home-hero"><div data-hero-copy><p data-hero-eyebrow>Atlas</p><h1 data-hero-title>Title</h1><p data-hero-subtitle>Subtitle</p><div data-hero-actions><a>Articles</a><a>Notes</a></div></div><a data-hero-scroll>Scroll<span class="icon"></span></a></section>';
  let intersect!: IntersectionObserverCallback;
  const disconnect = vi.fn();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        intersect = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  const dispose = mountMotion();
  const hero = document.querySelector<HTMLElement>('.home-hero')!;
  const visibility = (isIntersecting: boolean) =>
    intersect(
      [{ isIntersecting } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
  return { hero, dispose, disconnect, visibility };
}
it('stages only independent Hero groups over 1.2s and starts the arrow after entrance, pausing offscreen and across bfcache', async () => {
  const { hero, dispose, disconnect, visibility } = heroSetup();
  expect(new Set(native.map((animation) => animation.target)).size).toBe(8);
  expect(
    native.some((animation) =>
      animation.target.matches('.header-inner,[data-hero-copy],.icon'),
    ),
  ).toBe(false);
  const stages = native.filter((_, index) => index % 2 === 0);
  expect(
    stages.map((animation) => [
      animation.timing.delay,
      animation.timing.duration,
    ]),
  ).toEqual([
    [0, 380],
    [90, 380],
    [90, 380],
    [160, 450],
    [300, 550],
    [460, 470],
    [620, 450],
    [780, 420],
  ]);
  visibility(true);
  expect(hero.dataset.scrollActive).toBe('false');
  for (const animation of native) animation.onfinish?.();
  await vi.waitFor(() => expect(hero.dataset.scrollActive).toBe('true'));
  visibility(false);
  expect(hero.dataset.scrollActive).toBe('false');
  visibility(true);
  const count = native.length;
  window.dispatchEvent(new Event('pagehide'));
  expect(hero.dataset.scrollActive).toBe('false');
  window.dispatchEvent(new Event('pageshow'));
  expect(hero.dataset.scrollActive).toBe('true');
  expect(native).toHaveLength(count);
  preference.matches = true;
  preference.dispatchEvent(new Event('change'));
  expect(hero.dataset.scrollActive).toBe('false');
  dispose();
  expect(disconnect).toHaveBeenCalledOnce();
  expect(hero.dataset.scrollReady).toBeUndefined();
});
it('reduced motion suppresses animation and a missing animation API leaves Hero content readable', () => {
  preference.matches = true;
  const reduced = heroSetup();
  reduced.visibility(true);
  expect(native).toHaveLength(0);
  expect(reduced.hero.dataset.scrollActive).toBe('false');
  expect(
    [...document.querySelectorAll<HTMLElement>('[data-hero-copy] > *')].every(
      (el) => !el.style.opacity && !el.style.transform,
    ),
  ).toBe(true);
  reduced.dispose();
  preference.matches = false;
  Element.prototype.animate =
    undefined as unknown as typeof Element.prototype.animate;
  const unsupported = heroSetup();
  expect(unsupported.hero.dataset.scrollReady).toBe('true');
  expect(native).toHaveLength(0);
  unsupported.dispose();
});
it('keyboard interaction settles a pending Hero entrance immediately without affecting non-home navigation timing', () => {
  const { hero, dispose } = heroSetup();
  document
    .querySelector('[data-hero-actions]')!
    .dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  expect(hero.dataset.scrollReady).toBe('true');
  expect(
    native.every((animation) => animation.cancel.mock.calls.length > 0),
  ).toBe(true);
  dispose();
  native.length = 0;
  document.body.innerHTML = '<div class="header-inner"><a>Brand</a></div>';
  const stop = mountMotion();
  expect(
    native.every(
      (animation) =>
        animation.timing.delay === 0 && animation.timing.duration === 320,
    ),
  ).toBe(true);
  stop();
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
