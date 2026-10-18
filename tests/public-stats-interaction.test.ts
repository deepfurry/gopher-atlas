// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { mountStatistics } from '../apps/web/src/lib/stats/switcher';

afterEach(() => document.body.replaceChildren());
function mount() {
  document.body.innerHTML = `<section data-statistics><div data-stats-switch role="tablist" hidden>${['all', 'note', 'curated_article', 'topic'].map((key, i) => `<button role="tab" id="tab-${key}" aria-controls="panel-${key}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${key}</button>`).join('')}</div>${['all', 'note', 'curated_article', 'topic'].map((key, i) => `<section data-stats-panel="${key}" id="panel-${key}" ${i ? 'hidden' : ''}><details><summary>Data</summary><table><tbody><tr><td>2026-09-11</td><td>1</td></tr></tbody></table></details></section>`).join('')}</section>`;
  const root = document.querySelector<HTMLElement>('[data-statistics]')!;
  mountStatistics(root);
  return {
    root,
    tabs: [...root.querySelectorAll<HTMLButtonElement>('[role=tab]')],
    panels: [...root.querySelectorAll<HTMLElement>('[data-stats-panel]')],
  };
}
it('switches synchronously, keeps native table nodes and responds to the final rapid selection', () => {
  const { root, tabs, panels } = mount();
  expect(root.querySelector<HTMLElement>('[data-stats-switch]')!.hidden).toBe(
    false,
  );
  const table = panels[0].querySelector('table'),
    details = panels[0].querySelector('details')!;
  details.open = true;
  tabs[1].click();
  tabs[3].click();
  tabs[2].click();
  expect(panels.map((panel) => panel.hidden)).toEqual([
    true,
    true,
    false,
    true,
  ]);
  expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual([
    'false',
    'false',
    'true',
    'false',
  ]);
  tabs[0].click();
  expect(details.open).toBe(true);
  expect(panels[0].querySelector('table')).toBe(table);
  mountStatistics(root);
  expect(panels[0].querySelector('table')).toBe(table);
});
it('uses one Tab stop and supports arrow wrap, Home and End without moving focus on pointer activation', () => {
  const { tabs, panels } = mount();
  tabs[0].focus();
  const key = (value: string) =>
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: value,
        bubbles: true,
        cancelable: true,
      }),
    );
  key('ArrowLeft');
  expect(document.activeElement).toBe(tabs[3]);
  key('ArrowRight');
  expect(document.activeElement).toBe(tabs[0]);
  key('End');
  expect(document.activeElement).toBe(tabs[3]);
  key('Home');
  key('ArrowRight');
  expect(document.activeElement).toBe(tabs[1]);
  expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, 0, -1, -1]);
  expect(panels[1].hidden).toBe(false);
  key('Tab');
  expect(document.activeElement).toBe(tabs[1]);
});
