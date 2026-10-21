// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/dom';
import {
  mountReadership,
  trafficPlot,
  validateReadership,
} from '../apps/web/src/lib/stats/readership';
import type {
  Readership,
  StatsRange,
} from '../apps/web/src/lib/stats/readership-contract';

function fixture(range: StatsRange = '30d'): Readership {
  const length = Number(range.slice(0, -1)),
    end = Date.parse('2026-10-19T00:00:00Z');
  const daily = Array.from({ length }, (_, i) => ({
    date: new Date(end - (length - i) * 86400000).toISOString().slice(0, 10),
    pageLoads: i === length - 1 ? 12.5 : null,
    visits: i === length - 1 ? 3 : null,
    quality: i === length - 1 ? ('sampled-estimate' as const) : null,
  }));
  const coverage = {
    available: true,
    status: 'partial' as const,
    days: 1,
    startedAt: '2026-10-18',
    lastCompleteDay: '2026-10-18',
    lastSyncedAt: '2026-10-19T01:00:00.000Z',
  };
  return {
    schemaVersion: 1,
    range,
    timezone: 'UTC',
    start: daily[0].date,
    end: daily.at(-1)!.date,
    quality: {
      source: 'Cloudflare Web Analytics RUM',
      botFilter: 'cloudflare-rum-bot-0',
      visitsAreUniqueUsers: false,
      estimated: true,
    },
    coverage: {
      site: { ...coverage },
      pages: { ...coverage },
      referrers: { ...coverage },
    },
    totals: { pageLoads: 12.5, visits: 3 },
    daily,
    popularPages: [
      { path: '/', title: 'Home <img src=x>', pageLoads: 12.5, share: 1 },
    ],
    referrers: [{ source: 'direct-unknown', visits: 3 }],
  };
}
function dom() {
  document.body.innerHTML = `<div data-stat-count="note">5</div><div data-readership data-locale="en">
    <section data-traffic-site hidden><div>${['7d', '30d', '90d'].map((r) => `<button data-traffic-range="${r}">${r}</button>`).join('')}</div>
    <button data-traffic-metric="pageLoads">Page Views</button><button data-traffic-metric="visits">Visits</button>
    ${['pv', 'visits', 'coverage', 'max', 'start', 'end', 'caption'].map((k) => `<span data-traffic-${k}></span>`).join('')}
    <p data-traffic-empty hidden></p><div data-traffic-plot-layout><div data-traffic-plot>
    <svg><title id="traffic-chart-title"></title><g data-traffic-lines></g></svg>
    <div data-traffic-point-labels></div><span data-chart-guide hidden></span><span data-chart-dot hidden></span><div data-chart-tooltip hidden></div><span data-chart-status></span><span data-chart-instructions id="traffic-keys" hidden></span></div></div>
    <details><summary>Data</summary><table><tbody data-traffic-table></tbody></table></details></section>
    <section data-traffic-pages hidden><ol data-traffic-pages-list></ol></section>
    <section data-traffic-referrers hidden><ul data-traffic-referrers-list></ul></section>
    <p data-traffic-quality hidden></p><p data-traffic-notice></p><button data-traffic-retry hidden>Retry</button></div>`;
  return document.querySelector<HTMLElement>('[data-readership]')!;
}
let stop: (() => void) | undefined;
afterEach(() => {
  stop?.();
  stop = undefined;
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
it('shows independent valid dimensions, preserves keyboard focus and table state on metric switches, and uses safe text', async () => {
  const root = dom(),
    data = fixture();
  data.coverage.referrers.available = false;
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () => new Response(JSON.stringify(data)),
  );
  stop = mountReadership(root, fetch);
  await waitFor(() =>
    expect(root.querySelector<HTMLElement>('[data-traffic-site]')!.hidden).toBe(
      false,
    ),
  );
  expect(root.querySelector<HTMLElement>('[data-traffic-pages]')!.hidden).toBe(
    false,
  );
  expect(
    root.querySelector<HTMLElement>('[data-traffic-referrers]')!.hidden,
  ).toBe(true);
  expect(root.querySelector('[data-traffic-pv]')!.textContent).toBe('12.5');
  expect(root.querySelector('img')).toBeNull();
  expect(root.querySelector('a')!.textContent).toContain('<img');
  const details = root.querySelector('details')!;
  details.open = true;
  const button = root.querySelector<HTMLButtonElement>(
    '[data-traffic-metric="visits"]',
  )!;
  button.focus();
  button.click();
  expect(document.activeElement).toBe(button);
  expect(details.open).toBe(true);
  expect(root.querySelector('svg title')!.textContent).toContain('Visits');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(root.querySelectorAll('tbody tr')).toHaveLength(30);
  expect(root.textContent).toContain(
    'All three dimensions use the RUM bot: 0 filter',
  );
  expect(root.textContent).toContain('does not guarantee human-only traffic');
  expect(root.textContent).toContain('not WAF Bot Score');
  expect(root.textContent).toContain('may still be sampled estimates');
  expect(root.textContent).toContain('Visits are not unique visitors');
});
it('describes the same limited RUM filter scope in Chinese', async () => {
  const root = dom();
  root.dataset.locale = 'zh';
  stop = mountReadership(root, async () => Response.json(fixture()));
  await waitFor(() =>
    expect(root.textContent).toContain('三个统计维度均使用 RUM bot: 0 过滤'),
  );
  expect(root.textContent).toContain('不保证全部为真人访问');
  expect(root.textContent).toContain('不等同于 WAF Bot Score');
  expect(root.textContent).toContain('仍可能包含采样估计');
  expect(root.textContent).toContain('Visits 不代表独立访客 UV');
});
it.each([0, 1, 2, 3, 4])(
  'renders %i archived dates without replacing nulls, losing quality or shortening the selected range',
  async (n) => {
    const root = dom(),
      data = fixture();
    data.daily = data.daily.map((day, i) => ({
      ...day,
      pageLoads: i >= 30 - n ? (i === 30 - n ? 0 : 12.3456789) : null,
      visits: i >= 30 - n ? (i === 30 - n ? 0 : 3) : null,
      quality: i >= 30 - n ? (i === 29 ? 'sampled-estimate' : 'partial') : null,
    }));
    data.coverage.site.days = n;
    if (!n) {
      data.totals = null;
      data.coverage.site.available = false;
    }
    stop = mountReadership(root, async () => Response.json(data));
    await waitFor(() =>
      expect(root.querySelectorAll('tbody tr')).toHaveLength(30),
    );
    expect(root.querySelector('[data-traffic-caption]')!.textContent).toContain(
      `${data.start} — ${data.end}`,
    );
    expect(root.querySelector('[data-traffic-caption]')!.textContent).toContain(
      `${n} / 30 archived days`,
    );
    expect(
      root.querySelectorAll('[data-traffic-point-labels] time'),
    ).toHaveLength(n < 4 ? n : 0);
    const plot = root.querySelector<HTMLElement>('[data-traffic-plot]')!;
    expect(plot.dataset.chartMode).toBe(
      n === 0 ? 'empty' : n < 4 ? 'discrete' : 'trend',
    );
    expect(root.querySelectorAll('[data-traffic-point]')).toHaveLength(n);
    expect(root.querySelector('tbody')!.textContent).toContain('—');
    if (!n) {
      expect(plot.hasAttribute('tabindex')).toBe(false);
      expect(
        root.querySelector<HTMLElement>('[data-traffic-site]')!.hidden,
      ).toBe(true);
      return;
    }
    plot.focus();
    const tip = plot.querySelector<HTMLElement>('[data-chart-tooltip]')!;
    expect(tip.textContent).toContain(n < 4 ? 'Page Views: 0' : 'Missing');
    plot.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'End', bubbles: true }),
    );
    expect(tip.textContent).toContain('Sampled estimate');
    if (n > 1) expect(tip.textContent).toContain('12.3456789');
    const metricButton = root.querySelector<HTMLButtonElement>(
      '[data-traffic-metric="visits"]',
    )!;
    metricButton.focus();
    metricButton.click();
    expect(tip.hidden).toBe(true);
    plot.focus();
    expect(tip.textContent).toContain('Visits');
  },
);
it.each(['unverified', 'human-only', undefined])(
  'rejects a stale, misleading or missing filter contract: %s',
  (botFilter) => {
    const data = fixture();
    Object.assign(data.quality, { botFilter });
    expect(() => validateReadership(data, '30d')).toThrow(
      'stats_response_invalid',
    );
  },
);
it('hides unavailable/failing traffic without disturbing A, and supports explicit retry', async () => {
  const root = dom();
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(new Response('', { status: 503 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(fixture())));
  stop = mountReadership(root, fetch);
  await waitFor(() =>
    expect(
      root.querySelector<HTMLElement>('[data-traffic-retry]')!.hidden,
    ).toBe(false),
  );
  for (const part of ['site', 'pages', 'referrers'])
    expect(
      root.querySelector<HTMLElement>(`[data-traffic-${part}]`)!.hidden,
    ).toBe(true);
  expect(document.querySelector('[data-stat-count]')!.textContent).toBe('5');
  root.querySelector<HTMLButtonElement>('[data-traffic-retry]')!.click();
  await waitFor(() =>
    expect(root.querySelector<HTMLElement>('[data-traffic-site]')!.hidden).toBe(
      false,
    ),
  );
});
it('cancels previous ranges and ignores stale completions without leaking unhandled failures', async () => {
  const root = dom();
  const replies: ((response: Response) => void)[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(
    () => new Promise((resolve) => replies.push(resolve)),
  );
  stop = mountReadership(root, fetch);
  replies[0](new Response(JSON.stringify(fixture())));
  await waitFor(() => expect(root.hasAttribute('aria-busy')).toBe(false));
  root.querySelector<HTMLButtonElement>('[data-traffic-range="7d"]')!.click();
  root.querySelector<HTMLButtonElement>('[data-traffic-range="90d"]')!.click();
  expect(fetch.mock.calls[1][1]?.signal?.aborted).toBe(true);
  replies[2](new Response(JSON.stringify(fixture('90d'))));
  await waitFor(() =>
    expect(root.querySelectorAll('tbody tr')).toHaveLength(90),
  );
  replies[1](new Response(JSON.stringify(fixture('7d'))));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(root.querySelectorAll('tbody tr')).toHaveLength(90);
});
it('leaves missing dates as disconnected gaps and retains actual zero points', () => {
  const d = fixture('7d').daily;
  d[0] = { ...d[0], pageLoads: 0, visits: 0, quality: 'observed' };
  d[1] = { ...d[1], pageLoads: 1, visits: 1, quality: 'observed' };
  d[2] = { ...d[2], pageLoads: 2, visits: 2, quality: 'observed' };
  const plot = trafficPlot(d, 'pageLoads');
  expect(plot.paths).toHaveLength(2);
  expect(plot.mode).toBe('trend');
  expect(plot.points).toHaveLength(4);
  expect(plot.paths[0]).toContain(' L');
  expect(plot.paths[1]).not.toContain(' L');
});
it.each([0, 1, 2, 3, 4, 7])(
  'uses the full selected calendar or compact discrete days for %i real readings',
  (n) => {
    const data = fixture('7d');
    data.daily = data.daily.map((day, i) => ({
      ...day,
      pageLoads: i < n ? i : null,
      visits: i < n ? i : null,
      quality: i < n ? 'observed' : null,
    }));
    const plot = trafficPlot(data.daily, 'pageLoads');
    expect(plot.observedCount).toBe(n);
    expect(plot.mode).toBe(n === 0 ? 'empty' : n < 4 ? 'discrete' : 'trend');
    expect(plot.points).toHaveLength(n);
    if (n < 4) expect(plot.paths).toEqual([]);
    if (n > 0) expect(plot.points[0].value).toBe(0);
    if (n >= 4) expect(plot.samples).toHaveLength(7);
    expect(data.daily).toHaveLength(7);
  },
);
it('rejects invalid API shapes, private/protocol paths and unsupported source keys', () => {
  for (const mutate of [
    (v: Readership) => {
      v.schemaVersion = 2 as 1;
    },
    (v: Readership) => {
      v.popularPages[0].path = 'javascript:alert(1)';
    },
    (v: Readership) => {
      v.popularPages[0].path = '/admin/secret/';
    },
    (v: Readership) => {
      v.referrers[0].source = 'personal.example' as 'search';
    },
    (v: Readership) => {
      v.daily[0].pageLoads = -1;
    },
  ]) {
    const v = fixture();
    mutate(v);
    expect(() => validateReadership(v, '30d')).toThrow();
  }
});
