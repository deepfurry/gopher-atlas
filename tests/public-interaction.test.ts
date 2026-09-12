// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { mountChrome } from '../apps/web/src/lib/chrome';
import { mountSelect } from '../apps/web/src/lib/explorer';
import { displayDate } from '../apps/web/src/lib/i18n';

afterEach(() => {
  document.body.replaceChildren();
  delete document.documentElement.dataset.locale;
  vi.restoreAllMocks();
});

it('keeps language navigation on the current filtered route and fragment after history changes', () => {
  document.body.innerHTML = '<a data-language-link href="/en/articles/">EN</a>';
  document.documentElement.dataset.locale = 'zh';
  mountChrome();
  history.replaceState({}, '', '/topics/go-new-features/?page=2#reading');
  const link = document.querySelector('a')!;
  link.addEventListener('click', (event) => event.preventDefault());
  link.click();
  expect(link.getAttribute('href')).toBe(
    '/en/topics/go-new-features/?page=2#reading',
  );
  history.replaceState({}, '', '/notes/go/a/#example');
  link.click();
  expect(link.getAttribute('href')).toBe('/en/notes/go/a/#example');
});

it('select opens accessibly, survives rapid toggles, and closes when focus leaves without changing selection', () => {
  document.body.innerHTML =
    '<div data-select><input value="go"><button><span data-value>Go</span></button><div role="listbox"><button role="option" data-value="">All</button><button role="option" data-value="go"><span data-option-label>Go</span><span aria-hidden="true">✓</span></button></div></div><button id="outside">Outside</button>';
  const root = document.querySelector<HTMLElement>('[data-select]')!,
    trigger = root.querySelector('button')!,
    list = root.querySelector<HTMLElement>('[role=listbox]')!;
  mountSelect(root)();
  expect(root.querySelector('[data-value]')!.textContent).toBe('Go');
  for (let i = 0; i < 3; i++) trigger.click();
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  expect(list.inert).toBe(false);
  expect(document.activeElement).toBe(
    root.querySelector('[role=option][data-value=go]'),
  );
  document.querySelector<HTMLButtonElement>('#outside')!.focus();
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(list.inert).toBe(true);
  expect(list.getAttribute('aria-hidden')).toBe('true');
  expect(root.querySelector('input')!.value).toBe('go');
  trigger.click();
  expect(list.inert).toBe(false);
});

it('mobile navigation closes outside, on Escape and on desktop resize; theme persists independently', () => {
  document.body.innerHTML =
    '<button data-menu-toggle aria-expanded="false">菜单</button><nav id="primary-navigation"></nav><button data-theme-toggle>切换主题</button><div id="outside"></div>';
  document.documentElement.dataset.theme = 'dark';
  mountChrome();
  const menu = document.querySelector<HTMLButtonElement>('[data-menu-toggle]')!,
    nav = document.querySelector('nav')!;
  menu.click();
  expect(nav.classList.contains('open')).toBe(true);
  document.querySelector<HTMLElement>('#outside')!.click();
  expect(nav.classList.contains('open')).toBe(false);
  menu.click();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(menu.getAttribute('aria-expanded')).toBe('false');
  menu.click();
  window.dispatchEvent(new Event('resize'));
  expect(menu.getAttribute('aria-expanded')).toBe('false');
  document.querySelector<HTMLButtonElement>('[data-theme-toggle]')!.click();
  expect(document.documentElement.dataset.theme).toBe('light');
  expect(localStorage.getItem('gopheratlas-theme')).toBe('light');
});

it('shows legacy Chinese dates and English chrome dates without changing the UTC calendar day', () => {
  const time = Date.parse('2026-04-23T00:00:00Z');
  expect(displayDate(time, 'zh')).toBe('2026年4月23日');
  expect(displayDate(time, 'en')).toBe('April 23, 2026');
});

it('Note group pagination keeps four entries per page, bounded controls and independent groups', () => {
  document.body.innerHTML = [6, 1]
    .map(
      (count, group) =>
        `<section data-paged="4" id="group-${group}"><button data-prev>上一页</button><span data-page-label></span><button data-next>下一页</button>${Array.from({ length: count }, (_, index) => `<a data-page-item href="/notes/group/n-${index}/">${index}</a>`).join('')}</section>`,
    )
    .join('');
  mountChrome();
  const group = document.querySelector<HTMLElement>('#group-0')!,
    next = group.querySelector<HTMLButtonElement>('[data-next]')!,
    prev = group.querySelector<HTMLButtonElement>('[data-prev]')!;
  expect(group.querySelectorAll('[data-page-item]:not([hidden])')).toHaveLength(
    4,
  );
  expect(prev.disabled).toBe(true);
  next.click();
  expect(group.querySelectorAll('[data-page-item]:not([hidden])')).toHaveLength(
    2,
  );
  expect(group.querySelector('[data-page-label]')!.textContent).toBe('2 / 2');
  expect(next.disabled).toBe(true);
  expect(
    document.querySelectorAll('#group-1 [data-page-item]:not([hidden])'),
  ).toHaveLength(1);
  prev.click();
  expect(group.querySelectorAll('[data-page-item]:not([hidden])')).toHaveLength(
    4,
  );
});
