// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  mountChart,
  nearestSampleIndex,
  tooltipPosition,
  type ChartSeries,
} from '../apps/web/src/lib/stats/chart';

let frames: Map<number, FrameRequestCallback>, serial: number;
const stops: (() => void)[] = [];
const model: ChartSeries = {
  count: 3,
  sample(i) {
    return {
      date: `2026-10-${17 + i}`,
      x: 1 + i * 49,
      y: i === 1 ? null : 98 - i * 40,
      rows: [
        {
          label: 'Page Views <img src=x>',
          value: i === 0 ? '0' : i === 1 ? 'Missing' : '12.3456789',
        },
      ],
    };
  },
};
function fixture(series = model) {
  const root = document.createElement('div');
  root.innerHTML =
    '<svg></svg><span data-chart-guide hidden></span><span data-chart-dot hidden></span><div data-chart-tooltip hidden></div><span data-chart-status></span><span data-chart-instructions hidden id="chart-keys"></span>';
  document.body.append(root);
  vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({
    left: 100,
    right: 500,
    top: 80,
    bottom: 280,
    width: 400,
    height: 200,
    x: 100,
    y: 80,
    toJSON() {},
  });
  const tip = root.querySelector<HTMLElement>('[data-chart-tooltip]')!;
  Object.defineProperties(tip, {
    offsetWidth: { value: 200 },
    offsetHeight: { value: 90 },
  });
  const interaction = mountChart(root, series);
  stops.push(interaction.destroy);
  return {
    root,
    tip,
    interaction,
    dot: root.querySelector<HTMLElement>('[data-chart-dot]')!,
    guide: root.querySelector<HTMLElement>('[data-chart-guide]')!,
    status: root.querySelector<HTMLElement>('[data-chart-status]')!,
  };
}
function pointer(
  root: EventTarget,
  type: string,
  x: number,
  y: number,
  pointerType = 'mouse',
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, {
    clientX: x,
    clientY: y,
    pointerType,
    pointerId: 1,
    button: 0,
  });
  root.dispatchEvent(event);
  return event;
}
function flush() {
  const current = [...frames.values()];
  frames.clear();
  current.forEach((callback) => callback(0));
}
function key(root: HTMLElement, value: string) {
  root.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: value,
      bubbles: true,
      cancelable: true,
    }),
  );
}
beforeEach(() => {
  frames = new Map();
  serial = 0;
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback) => {
      frames.set(++serial, callback);
      return serial;
    }),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id) => frames.delete(id)),
  );
});
afterEach(() => {
  stops.splice(0).forEach((stop) => stop());
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('hits by X over the whole plot, coalesces pointer moves and builds text-only tooltips', () => {
  const { root, tip, dot, guide } = fixture();
  pointer(root, 'pointermove', 110, 100);
  pointer(root, 'pointermove', 250, 260);
  pointer(root, 'pointermove', 499, 270);
  expect(frames.size).toBe(1);
  flush();
  expect(tip.hidden).toBe(false);
  expect(tip.textContent).toContain('2026-10-19 · UTC');
  expect(tip.textContent).toContain('Page Views <img src=x>: 12.3456789');
  expect(tip.querySelector('img')).toBeNull();
  expect(dot.hidden).toBe(false);
  expect(guide.style.left).toBe('99%');
  pointer(root, 'pointerleave', 500, 270);
  expect(tip.hidden).toBe(true);
  expect(frames.size).toBe(0);
});
it('preserves real zero and missing samples for keyboard and screen readers, and cancels queued hover on Escape', () => {
  const { root, tip, dot, guide, status } = fixture();
  root.focus();
  expect(status.textContent).toContain(': 0');
  key(root, 'ArrowRight');
  expect(status.textContent).toContain('Missing');
  expect(dot.hidden).toBe(true);
  expect(guide.hidden).toBe(false);
  key(root, 'End');
  expect(status.textContent).toContain('12.3456789');
  key(root, 'ArrowLeft');
  expect(tip.textContent).toContain('2026-10-18');
  key(root, 'Home');
  expect(tip.textContent).toContain('2026-10-17');
  pointer(root, 'pointermove', 490, 150);
  key(root, 'Escape');
  flush();
  expect(tip.hidden).toBe(true);
  expect(status.textContent).toBe('');
  key(root, 'ArrowRight');
  expect(tip.hidden).toBe(false);
  root.blur();
  expect(tip.hidden).toBe(true);
});
it('keeps a click hit when native focus follows pointerdown before the animation frame', () => {
  const { root, tip } = fixture();
  pointer(root, 'pointerdown', 490, 150);
  root.focus();
  flush();
  expect(tip.textContent).toContain('2026-10-19');
});
it('supports touch tap and horizontal scrubbing, keeps vertical scroll native and clears on scroll/cancel', () => {
  const { root, tip } = fixture();
  expect(pointer(root, 'pointerdown', 105, 160, 'touch').defaultPrevented).toBe(
    false,
  );
  flush();
  pointer(root, 'pointerup', 105, 160, 'touch');
  pointer(root, 'pointerleave', 105, 160, 'touch');
  expect(tip.hidden).toBe(false);
  pointer(root, 'pointerdown', 105, 160, 'touch');
  expect(pointer(root, 'pointermove', 490, 165, 'touch').defaultPrevented).toBe(
    false,
  );
  flush();
  expect(tip.textContent).toContain('2026-10-19');
  window.dispatchEvent(new Event('scroll'));
  expect(tip.hidden).toBe(true);
  pointer(root, 'pointerdown', 110, 160, 'touch');
  flush();
  pointer(root, 'pointermove', 112, 190, 'touch');
  expect(tip.hidden).toBe(true);
  pointer(root, 'pointerdown', 110, 160, 'touch');
  flush();
  pointer(root, 'pointercancel', 110, 160, 'touch');
  expect(tip.hidden).toBe(true);
});
it('isolates instances and resets on outside activation, resize, replacement, detach and destruction', async () => {
  const a = fixture(),
    b = fixture();
  pointer(a.root, 'pointerdown', 110, 150);
  flush();
  pointer(b.root, 'pointerdown', 490, 150);
  flush();
  expect(a.tip.hidden).toBe(true);
  expect(b.tip.hidden).toBe(false);
  window.dispatchEvent(new Event('resize'));
  expect(b.tip.hidden).toBe(true);
  pointer(a.root, 'pointermove', 200, 150);
  a.interaction.destroy();
  flush();
  expect(a.root.hasAttribute('tabindex')).toBe(false);
  expect(a.tip.hidden).toBe(true);
  const replacement = mountChart(b.root, {
    count: 1,
    sample: () => model.sample(0),
  });
  stops.push(replacement.destroy);
  b.root.focus();
  expect(b.tip.textContent).toContain('2026-10-17');
  pointer(b.root, 'pointermove', 200, 150);
  b.root.remove();
  await Promise.resolve();
  flush();
  expect(b.tip.hidden).toBe(true);
  expect(frames.size).toBe(0);
});
it('does not invent an interaction or Tab stop for empty data', () => {
  const { root, tip } = fixture({
    count: 0,
    sample: () => {
      throw Error('empty');
    },
  });
  expect(root.hasAttribute('tabindex')).toBe(false);
  pointer(root, 'pointerdown', 100, 100);
  flush();
  expect(tip.hidden).toBe(true);
});
it.each([
  [12, 12],
  [268, 12],
  [12, 188],
  [268, 188],
  [140, 100],
])('flips and clamps tooltips at viewport edges (%i, %i)', (x, y) => {
  for (const touch of [true, false]) {
    const position = tooltipPosition(
      x,
      y,
      150,
      80,
      { left: 0, top: 0, width: 280, height: 200 },
      touch,
    );
    expect(position.left).toBeGreaterThanOrEqual(12);
    expect(position.left + 150).toBeLessThanOrEqual(268);
    expect(position.top).toBeGreaterThanOrEqual(12);
    expect(position.top + 80).toBeLessThanOrEqual(188);
  }
});
it('selects nearest samples at either edge without skipping gaps or allocating a long calendar', () => {
  expect(nearestSampleIndex(model, -10)).toBe(0);
  expect(nearestSampleIndex(model, 49)).toBe(1);
  expect(nearestSampleIndex(model, 999)).toBe(2);
  const sample = vi.fn((i: number) => ({
    ...model.sample(0),
    x: (i / 999999) * 100,
  }));
  expect(nearestSampleIndex({ count: 1000000, sample }, 50)).toBe(499999);
  expect(sample.mock.calls.length).toBeLessThan(30);
});
