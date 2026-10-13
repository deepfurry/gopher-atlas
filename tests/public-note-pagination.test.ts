// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { mountNotePagination } from '../apps/web/src/lib/note-pagination';
import { createMotionScope } from '../apps/web/src/lib/motion';

vi.mock('../apps/web/src/lib/motion', () => ({
  createMotionScope: vi.fn(() => ({
    cancel: vi.fn(),
    enter: vi.fn(),
    dispose: vi.fn(),
  })),
}));
const cleanups: (() => void)[] = [];
const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
afterEach(() => {
  cleanups.splice(0).forEach((dispose) => dispose());
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts);
  else Reflect.deleteProperty(document, 'fonts');
});
function group(count: number) {
  const section = document.createElement('section');
  section.dataset.paged = '4';
  section.innerHTML = `<div data-page-list>${Array.from({ length: count }, (_, i) => `<a data-page-item href="/notes/test/${i}/">${i}</a>`).join('')}</div><button data-prev>Previous</button><span data-page-label></span><button data-next>Next</button>`;
  document.body.append(section);
  let width = 600;
  const list = section.querySelector<HTMLElement>('[data-page-list]')!;
  vi.spyOn(list, 'getBoundingClientRect').mockImplementation(
    () => ({ width }) as DOMRect,
  );
  section
    .querySelectorAll<HTMLElement>('[data-page-item]')
    .forEach((item, i) => {
      vi.spyOn(item, 'getBoundingClientRect').mockImplementation(
        () =>
          ({
            height: item.hidden ? 0 : (width < 400 ? 120 : 80) + (i % 4) * 10,
          }) as DOMRect,
      );
    });
  // SSR exposes all links; only mounting the enhancement hides alternate pages.
  expect(section.querySelectorAll('[hidden]')).toHaveLength(0);
  cleanups.push(mountNotePagination(section));
  return {
    section,
    list,
    resize: (w: number) => {
      width = w;
    },
    next: section.querySelector<HTMLButtonElement>('[data-next]')!,
    prev: section.querySelector<HTMLButtonElement>('[data-prev]')!,
  };
}
it('reserves the largest actual four-row page, holds the two-row tail and keeps groups independent during rapid paging', () => {
  const first = group(26),
    second = group(6),
    single = group(1);
  const motion = vi.mocked(createMotionScope).mock.results[0].value;
  expect(first.list.style.minHeight).toBe('380px');
  expect(single.list.style.minHeight).toBe('');
  for (let i = 0; i < 9; i++) first.next.click();
  expect(first.section.querySelector('[data-page-label]')!.textContent).toBe(
    '7 / 7',
  );
  expect(first.list.querySelectorAll(':scope > :not([hidden])')).toHaveLength(
    2,
  );
  expect(first.list.style.minHeight).toBe('380px');
  expect(first.next.disabled).toBe(true);
  expect(second.list.querySelectorAll(':scope > :not([hidden])')).toHaveLength(
    4,
  );
  expect(motion.enter).toHaveBeenLastCalledWith(expect.any(Array), {
    duration: 0.16,
    distance: 0,
    opacity: 0.8,
  });
  for (let i = 0; i < 8; i++) first.prev.click();
  expect(first.prev.disabled).toBe(true);
  expect(first.list.querySelectorAll(':scope > :not([hidden])')).toHaveLength(
    4,
  );
});
it('remeasures on width and font readiness without resetting the active page or adding single-page space', async () => {
  let resize!: ResizeObserverCallback, loaded!: () => void;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {
      ready: new Promise<void>((resolve) => {
        loaded = resolve;
      }),
    },
  });
  const item = group(6);
  item.next.click();
  item.resize(360);
  resize([], {} as ResizeObserver);
  expect(item.list.style.minHeight).toBe('540px');
  expect(item.section.querySelector('[data-page-label]')!.textContent).toBe(
    '2 / 2',
  );
  expect(item.list.querySelectorAll(':scope > :not([hidden])')).toHaveLength(2);
  item.resize(600);
  loaded();
  await Promise.resolve();
  expect(item.list.style.minHeight).toBe('380px');
});
