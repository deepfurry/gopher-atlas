import {
  ranges,
  type Readership,
  type StatsRange,
} from './readership-contract';

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const count = (n: unknown): n is number =>
  typeof n === 'number' &&
  Number.isFinite(n) &&
  n >= 0 &&
  n <= Number.MAX_SAFE_INTEGER;

export function validateReadership(
  input: unknown,
  range: StatsRange,
): Readership {
  const v = input as Readership;
  if (
    !v ||
    v.schemaVersion !== 1 ||
    v.range !== range ||
    v.timezone !== 'UTC' ||
    !dayPattern.test(v.start) ||
    !dayPattern.test(v.end) ||
    v.quality?.source !== 'Cloudflare Web Analytics RUM' ||
    v.quality.botFilter !== 'unverified' ||
    v.quality.visitsAreUniqueUsers !== false ||
    typeof v.quality.estimated !== 'boolean' ||
    !Array.isArray(v.daily) ||
    v.daily.length !== Number(range.slice(0, -1)) ||
    !Array.isArray(v.popularPages) ||
    v.popularPages.length > 10 ||
    !Array.isArray(v.referrers) ||
    v.referrers.length > 3
  )
    throw Error('stats_response_invalid');
  for (const dim of ['site', 'pages', 'referrers'] as const) {
    const c = v.coverage?.[dim];
    if (
      !c ||
      typeof c.available !== 'boolean' ||
      !['complete', 'partial', 'unavailable'].includes(c.status) ||
      !Number.isInteger(c.days) ||
      c.days < 0 ||
      c.days > v.daily.length ||
      ![c.startedAt, c.lastCompleteDay].every(
        (d) => d === null || (typeof d === 'string' && dayPattern.test(d)),
      ) ||
      !(
        c.lastSyncedAt === null ||
        (typeof c.lastSyncedAt === 'string' &&
          /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(c.lastSyncedAt))
      )
    )
      throw Error('stats_response_invalid');
  }
  if (
    v.totals !== null &&
    (!count(v.totals?.pageLoads) || !count(v.totals?.visits))
  )
    throw Error('stats_response_invalid');
  v.daily.forEach((row, i) => {
    if (
      !row ||
      row.date !==
        new Date(Date.parse(v.start) + i * 86400000)
          .toISOString()
          .slice(0, 10) ||
      (!(
        row.pageLoads === null &&
        row.visits === null &&
        row.quality === null
      ) &&
        !(
          count(row.pageLoads) &&
          count(row.visits) &&
          ['observed', 'sampled-estimate', 'partial'].includes(
            row.quality ?? '',
          )
        ))
    )
      throw Error('stats_response_invalid');
  });
  if (v.daily.at(-1)?.date !== v.end) throw Error('stats_response_invalid');
  for (const p of v.popularPages)
    if (
      !p ||
      !/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)*$/.test(p.path) ||
      /^\/(api|admin)\//.test(p.path) ||
      typeof p.title !== 'string' ||
      p.title.length > 500 ||
      !count(p.pageLoads) ||
      !count(p.share) ||
      p.share > 1
    )
      throw Error('stats_response_invalid');
  for (const r of v.referrers)
    if (
      !r ||
      !['direct-unknown', 'search', 'external-other'].includes(r.source) ||
      !count(r.visits)
    )
      throw Error('stats_response_invalid');
  return v;
}

export function trafficPlot(
  daily: Readership['daily'],
  metric: 'pageLoads' | 'visits',
) {
  const maximum = Math.max(1, ...daily.map((d) => d[metric] ?? 0));
  const points: { x: number; y: number }[] = [],
    paths: string[] = [];
  let path = '';
  daily.forEach((d, i) => {
    const value = d[metric];
    if (value === null) {
      if (path) paths.push(path);
      path = '';
      return;
    }
    const x = 1 + (i / Math.max(1, daily.length - 1)) * 98,
      y = 98 - (value / maximum) * 96;
    points.push({ x, y });
    path += `${path ? ' L' : 'M'}${x} ${y}`;
  });
  if (path) paths.push(path);
  return { maximum, points, paths };
}

export function mountReadership(
  root: HTMLElement,
  fetcher: typeof fetch = fetch,
) {
  const zh = root.dataset.locale !== 'en',
    format = new Intl.NumberFormat(zh ? 'zh-CN' : 'en', {
      maximumFractionDigits: 2,
    });
  const el = <T extends Element = HTMLElement>(name: string) =>
    root.querySelector<T>(`[data-traffic-${name}]`)!;
  const text = (name: string, value: string) => {
    el(name).textContent = value;
  };
  let data: Readership | null = null,
    metric: 'pageLoads' | 'visits' = 'pageLoads',
    selected: StatsRange = '30d',
    controller: AbortController | undefined;
  const number = (n: number | null) => (n === null ? '—' : format.format(n));
  const hide = () => {
    for (const part of ['site', 'pages', 'referrers', 'quality'])
      el<HTMLElement>(part).hidden = true;
  };
  const render = () => {
    if (!data) return;
    el<HTMLElement>('site').hidden =
      !data.coverage.site.available || data.totals === null;
    el<HTMLElement>('pages').hidden =
      !data.coverage.pages.available || !data.popularPages.length;
    el<HTMLElement>('referrers').hidden =
      !data.coverage.referrers.available || !data.referrers.length;
    const available = !el<HTMLElement>('site').hidden;
    el<HTMLElement>('quality').hidden = !available;
    text(
      'notice',
      available
        ? ''
        : zh
          ? '流量统计尚未可用。内容统计不受影响。'
          : 'Traffic statistics are not available. Published content statistics remain available.',
    );
    text(
      'quality',
      zh
        ? '来源：Cloudflare Web Analytics RUM · UTC。数据为供应商聚合观测，可能包含采样估计；机器人过滤口径尚未验证。仅显示已归档日期，不补全未知历史。'
        : 'Source: Cloudflare Web Analytics RUM · UTC. Provider aggregates may be sampled estimates; bot filtering is unverified. Only archived days are shown, without invented history.',
    );
    if (data.totals) {
      text('pv', number(data.totals.pageLoads));
      text('visits', number(data.totals.visits));
    }
    const c = data.coverage.site;
    text(
      'coverage',
      zh
        ? `已覆盖 ${c.days} / ${data.daily.length} 个 UTC 日；采集起点 ${c.startedAt ?? '—'}；上次同步 ${c.lastSyncedAt ?? '—'}。总量仅含这些已覆盖日期。`
        : `${c.days} / ${data.daily.length} UTC days covered; collection starts ${c.startedAt ?? '—'}; last synced ${c.lastSyncedAt ?? '—'}. Totals include covered days only.`,
    );
    root
      .querySelectorAll<HTMLButtonElement>('[data-traffic-range]')
      .forEach((b) =>
        b.setAttribute(
          'aria-pressed',
          String(b.dataset.trafficRange === data!.range),
        ),
      );
    root
      .querySelectorAll<HTMLButtonElement>('[data-traffic-metric]')
      .forEach((b) =>
        b.setAttribute(
          'aria-pressed',
          String(b.dataset.trafficMetric === metric),
        ),
      );
    const plot = trafficPlot(data.daily, metric);
    text('max', number(plot.maximum));
    text('start', data.start);
    text('end', data.end);
    text(
      'caption',
      `${metric === 'pageLoads' ? 'Page Views' : 'Visits'} · ${data.start} — ${data.end} · UTC`,
    );
    root.querySelector('#traffic-chart-title')!.textContent =
      el('caption').textContent;
    const group = el<SVGGElement>('lines');
    group.replaceChildren();
    for (const path of plot.paths) {
      const node = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'path',
      );
      node.setAttribute('d', path);
      node.setAttribute('vector-effect', 'non-scaling-stroke');
      group.append(node);
    }
    for (const p of plot.points) {
      const node = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'circle',
      );
      node.setAttribute('cx', String(p.x));
      node.setAttribute('cy', String(p.y));
      node.setAttribute('r', '0.6');
      node.setAttribute('fill', 'currentColor');
      node.setAttribute('stroke', 'none');
      group.append(node);
    }
    const tbody = el('table');
    tbody.replaceChildren();
    for (const day of data.daily) {
      const row = document.createElement('tr');
      for (const value of [
        day.date,
        number(day.pageLoads),
        number(day.visits),
      ]) {
        const cell = document.createElement('td');
        cell.className = root.dataset.cellClass ?? '';
        cell.textContent = value;
        row.append(cell);
      }
      tbody.append(row);
    }
    const list = el('pages-list');
    list.replaceChildren();
    for (const [index, page] of data.popularPages.entries()) {
      const row = document.createElement('li'),
        link = document.createElement('a'),
        value = document.createElement('span'),
        bar = document.createElement('meter');
      row.className = root.dataset.rowClass ?? '';
      link.className = root.dataset.linkClass ?? '';
      value.className = root.dataset.valueClass ?? '';
      bar.className = root.dataset.meterClass ?? '';
      link.href = page.path;
      link.textContent = `${String(index + 1).padStart(2, '0')} / ${page.title}`;
      value.textContent = number(page.pageLoads);
      bar.min = 0;
      bar.max = 1;
      bar.value = page.share;
      bar.setAttribute(
        'aria-label',
        `${format.format(page.share * 100)}% ${zh ? '已覆盖浏览量' : 'of covered page views'}`,
      );
      row.append(link, value, bar);
      list.append(row);
    }
    const sources = el('referrers-list');
    sources.replaceChildren();
    const labels = {
      'direct-unknown': 'Direct / Unknown',
      search: zh ? '搜索（已识别）' : 'Search (identified)',
      'external-other': zh ? '其他外部来源' : 'Other external sources',
    };
    for (const source of data.referrers) {
      const row = document.createElement('li'),
        label = document.createElement('div'),
        value = document.createElement('span');
      row.className = root.dataset.rowClass ?? '';
      value.className = root.dataset.valueClass ?? '';
      label.textContent = labels[source.source];
      value.textContent = number(source.visits);
      row.append(label, value);
      sources.append(row);
    }
  };
  async function load(range: StatsRange) {
    controller?.abort();
    const request = (controller = new AbortController());
    selected = range;
    root.setAttribute('aria-busy', 'true');
    el<HTMLElement>('retry').hidden = true;
    const timer = setTimeout(() => request.abort(), 10000);
    try {
      const response = await fetcher(`/api/stats?range=${range}`, {
        signal: request.signal,
        credentials: 'omit',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw Error('unavailable');
      const body = await response.text();
      if (body.length > 256 * 1024) throw Error('invalid');
      const result = validateReadership(JSON.parse(body), range);
      if (controller !== request) return;
      data = result;
      render();
    } catch {
      if (controller !== request) return;
      data = null;
      hide();
      text(
        'notice',
        zh
          ? '流量统计暂时不可用。内容统计不受影响。'
          : 'Traffic statistics are temporarily unavailable. Published content statistics remain available.',
      );
      el<HTMLElement>('retry').hidden = false;
    } finally {
      clearTimeout(timer);
      if (controller === request) root.removeAttribute('aria-busy');
    }
  }
  const click = (event: Event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>(
      'button',
    );
    if (!button) return;
    const range = button.dataset.trafficRange;
    if (range && ranges.includes(range as StatsRange))
      void load(range as StatsRange);
    if (button.dataset.trafficMetric) {
      metric =
        button.dataset.trafficMetric === 'visits' ? 'visits' : 'pageLoads';
      render();
    }
    if (button.hasAttribute('data-traffic-retry')) void load(selected);
  };
  root.addEventListener('click', click);
  void load('30d');
  return () => {
    controller?.abort();
    controller = undefined;
    root.removeEventListener('click', click);
  };
}
