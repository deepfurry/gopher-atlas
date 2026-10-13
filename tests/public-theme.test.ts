// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mountTheme } from '../apps/web/src/lib/theme';
import { copyrightYears } from '../apps/web/src/lib/copyright';

const deferred = () => {
  let resolve!: () => void, reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const originalStart = document.startViewTransition;
const originalAnimate = Element.prototype.animate;
let preference: EventTarget & { matches: boolean };
let dispose: (() => void) | undefined;
let button: HTMLButtonElement;
let changes: ReturnType<typeof vi.fn>;
const root = document.documentElement;
beforeEach(() => {
  preference = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal('matchMedia', () => preference);
  vi.stubGlobal('innerWidth', 1000);
  vi.stubGlobal('innerHeight', 600);
  document.body.innerHTML = '<button>Theme</button>';
  button = document.querySelector('button')!;
  vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
    left: 878,
    top: 14,
    width: 44,
    height: 44,
  } as DOMRect);
  root.dataset.theme = 'dark';
  changes = vi.fn();
  window.addEventListener('gopheratlas-theme', changes);
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  window.removeEventListener('gopheratlas-theme', changes);
  document.startViewTransition = originalStart;
  Element.prototype.animate = originalAnimate;
  delete root.dataset.themeTransition;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function native() {
  const ready = deferred(),
    finished = deferred(),
    updated = deferred(),
    animated = deferred();
  const skipTransition = vi.fn();
  let update!: () => void;
  const start = vi.fn((callback: () => void) => {
    update = () => {
      callback();
      updated.resolve();
    };
    return {
      ready: ready.promise,
      finished: finished.promise,
      updateCallbackDone: updated.promise,
      skipTransition,
    } as ViewTransition;
  });
  document.startViewTransition = start as typeof document.startViewTransition;
  const animation = { finished: animated.promise, cancel: vi.fn() };
  const animate = vi.fn(() => animation as unknown as Animation);
  Element.prototype.animate = animate;
  return {
    ready,
    finished,
    animated,
    skipTransition,
    animate,
    animation,
    start,
    update: () => update(),
  };
}
const settled = () => {
  expect(root.dataset.themeTransition).toBeUndefined();
  expect(button.hasAttribute('aria-busy')).toBe(false);
  expect(localStorage.getItem('gopheratlas-theme')).toBe(root.dataset.theme);
};
it('reveals the new theme from the button in both directions, persists and notifies Giscus once, suppressing repeat clicks', async () => {
  dispose = mountTheme(button);
  for (const theme of ['light', 'dark']) {
    const n = native();
    changes.mockClear();
    button.click();
    button.click();
    button.click();
    expect(n.start).toHaveBeenCalledOnce();
    n.update();
    n.ready.resolve();
    await vi.waitFor(() => expect(n.animate).toHaveBeenCalledOnce());
    expect(root.dataset.theme).toBe(theme);
    expect(changes).toHaveBeenCalledOnce();
    expect(changes.mock.calls[0][0].detail).toBe(theme);
    expect(n.animate).toHaveBeenCalledWith(
      {
        clipPath: [
          'circle(0px at 900px 36px)',
          `circle(${Math.hypot(900, 564)}px at 900px 36px)`,
        ],
      },
      expect.objectContaining({
        duration: 420,
        pseudoElement: '::view-transition-new(root)',
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      }),
    );
    n.animated.resolve();
    n.finished.resolve();
    await vi.waitFor(settled);
    expect(changes).toHaveBeenCalledOnce();
  }
});
it.each(['missing API', 'reduced motion', 'hidden document'])(
  'switches immediately without snapshots for %s',
  (mode) => {
    const n = native();
    if (mode === 'missing API')
      document.startViewTransition =
        undefined as unknown as typeof document.startViewTransition;
    if (mode === 'reduced motion') preference.matches = true;
    if (mode === 'hidden document')
      vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    dispose = mountTheme(button);
    button.click();
    expect(n.start).not.toHaveBeenCalled();
    expect(n.animate).not.toHaveBeenCalled();
    expect(root.dataset.theme).toBe('light');
    expect(changes).toHaveBeenCalledOnce();
    settled();
  },
);
it.each([
  'ready rejected',
  'animation rejected',
  'animation throws',
  'start throws',
])('settles the real theme with no snapshot scope when %s', async (mode) => {
  const n = native();
  if (mode === 'start throws')
    n.start.mockImplementation(() => {
      throw Error('unsupported');
    });
  if (mode === 'animation throws')
    n.animate.mockImplementation(() => {
      throw Error('unsupported');
    });
  dispose = mountTheme(button);
  button.click();
  if (mode !== 'start throws') {
    n.update();
    if (mode === 'ready rejected') n.ready.reject(Error('skipped'));
    else n.ready.resolve();
    if (mode === 'animation rejected') {
      await vi.waitFor(() => expect(n.animate).toHaveBeenCalledOnce());
      n.animated.reject(Error('cancelled'));
    }
  }
  await vi.waitFor(settled);
  expect(root.dataset.theme).toBe('light');
  expect(changes).toHaveBeenCalledOnce();
});
it.each([
  'resize',
  'pagehide',
  'pageswap',
  'visibilitychange',
  'reduced motion',
])(
  'safely interrupts on %s before the pending update, ignoring stale completions',
  async (event) => {
    const old = native();
    dispose = mountTheme(button);
    button.click();
    if (event === 'reduced motion') {
      preference.matches = true;
      preference.dispatchEvent(new Event('change'));
      preference.matches = false;
    } else if (event === 'visibilitychange') {
      const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
      document.dispatchEvent(new Event(event));
      hidden.mockRestore();
    } else window.dispatchEvent(new Event(event));
    expect(old.skipTransition).toHaveBeenCalledOnce();
    settled();
    const next = native();
    button.click();
    next.update();
    old.update();
    old.ready.reject(Error('skipped'));
    old.finished.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(root.dataset.themeTransition).toBe('reveal');
    expect(root.dataset.theme).toBe('dark');
    expect(changes).toHaveBeenCalledTimes(2);
    next.finished.resolve();
    await vi.waitFor(settled);
  },
);
it.each([
  [2026, '2026'],
  [2027, '2026–2027'],
  [2030, '2026–2030'],
])('formats copyright at build year %i', (year, expected) => {
  expect(copyrightYears(year as number)).toBe(expected);
});
