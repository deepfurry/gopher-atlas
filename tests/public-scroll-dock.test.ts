// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  mountScrollDock,
  scrollProgress,
  scrollUpTarget,
} from '../apps/web/src/lib/scroll-dock';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});
it('clamps progress and moves up a quarter of the total scrollable distance', () => {
  expect(scrollProgress(-20, 2400, 800)).toBe(0);
  expect(scrollProgress(800, 2400, 800)).toBe(0.5);
  expect(scrollProgress(1800, 2400, 800)).toBe(1);
  expect(scrollProgress(0, 400, 800)).toBe(0);
  expect(scrollUpTarget(1200, 2400, 800)).toBe(800);
  expect(scrollUpTarget(100, 2400, 800)).toBe(0);
});
it('tracks scroll and changing page height, hides short pages, restores focus and uses instant reduced-motion scrolling', async () => {
  vi.useFakeTimers();
  const preference = Object.assign(new EventTarget(), { matches: true });
  vi.stubGlobal('matchMedia', () => preference);
  vi.stubGlobal('innerHeight', 800);
  vi.stubGlobal('scrollY', 0);
  let height = 2400,
    resized!: ResizeObserverCallback;
  vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockImplementation(
    () => height,
  );
  const disconnect = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        resized = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  document.body.innerHTML =
    '<main id="main" tabindex="-1"></main><button data-scroll-dock hidden inert><svg><rect data-scroll-progress /></svg></button>';
  const button = document.querySelector('button')!;
  const dispose = mountScrollDock(button);
  expect(button.hidden).toBe(true);
  vi.stubGlobal('scrollY', 1000);
  window.dispatchEvent(new Event('scroll'));
  await vi.advanceTimersByTimeAsync(20);
  expect(button.hidden).toBe(false);
  expect(button.inert).toBe(false);
  expect(button.getAttribute('aria-label')).toContain('63%');
  expect(
    button.querySelector<SVGRectElement>('rect')!.style.strokeDashoffset,
  ).toBe('37.5');
  button.click();
  expect(scroll).toHaveBeenCalledExactlyOnceWith({
    top: 600,
    behavior: 'instant',
  });
  button.focus();
  height = 1000;
  resized([], {} as ResizeObserver);
  await vi.advanceTimersByTimeAsync(20);
  expect(button.hidden).toBe(true);
  expect(button.inert).toBe(true);
  expect(document.activeElement?.id).toBe('main');
  dispose();
  expect(disconnect).toHaveBeenCalledOnce();
});
