import {
  ranges,
  rumBotFilter,
  type Readership,
  type StatsRange,
} from './readership-contract';
import { mountChart } from './chart';

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
    v.quality.botFilter !== rumBotFilter ||
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
  const valid = daily.filter((d) => d[metric] !== null);
  const mode =
    valid.length === 0 ? 'empty' : valid.length <= 3 ? 'discrete' : 'trend';
  const samples = (mode === 'discrete' ? valid : daily).map((day, i, all) => ({
    ...day,
    x:
      mode === 'discrete'
        ? all.length === 1
          ? 50
          : 20 + (i / (all.length - 1)) * 60
        : 1 + (i / Math.max(1, daily.length - 1)) * 98,
    y: day[metric] === null ? null : 98 - (day[metric] / maximum) * 96,
  }));
  const points: { x: number; y: number; date: string; value: number }[] = [],
    paths: string[] = [];
  let path = '';
  samples.forEach((d) => {
    const value = d[metric];
    if (value === null) {
      if (path) paths.push(path);
      path = '';
      return;
    }
    const { x } = d,
      y = d.y!;
    points.push({ x, y, date: d.date, value });
    if (mode === 'trend') path += `${path ? ' L' : 'M'}${x} ${y}`;
  });
  if (path) paths.push(path);
  return { maximum, points, paths, samples, mode, observedCount: valid.length };
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
  let chart: ReturnType<typeof mountChart> | undefined;
  const number = (n: number | null) => (n === null ? '—' : format.format(n));
  const hide = () => {
    chart?.destroy();
    chart = undefined;
    for (const part of ['site', 'pages', 'referrers', 'quality'])
      el<HTMLElement>(part).hidden = true;
  };
  const render = () => {
    if (!data) return;
    chart?.destroy();
    chart = undefined;
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
        ? '来源：Cloudflare Web Analytics RUM · UTC。三个统计维度均使用 RUM bot: 0 过滤，不保证全部为真人访问，也不等同于 WAF Bot Score。供应商聚合数据仍可能包含采样估计；Visits 不代表独立访客 UV。仅显示已归档日期，不补全未知历史。'
        : 'Source: Cloudflare Web Analytics RUM · UTC. All three dimensions use the RUM bot: 0 filter; this does not guarantee human-only traffic and is not WAF Bot Score. Provider aggregates may still be sampled estimates; Visits are not unique visitors (UV). Only archived days are shown, without invented history.',
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
    const plotRoot = el<HTMLElement>('plot');
    plotRoot.dataset.chartMode = plot.mode;
    el<HTMLElement>('plot-layout').hidden = plot.mode === 'empty';
    el<HTMLElement>('empty').hidden = plot.mode !== 'empty';
    text('max', number(plot.maximum));
    text('start', data.start);
    text('end', data.end);
    text(
      'caption',
      `${metric === 'pageLoads' ? 'Page Views' : 'Visits'} · ${data.start} — ${data.end} · UTC · ${plot.observedCount} / ${data.daily.length} ${zh ? '个已归档日' : 'archived days'}${plot.mode === 'discrete' ? (zh ? ' · 离散日读数' : ' · discrete daily readings') : ''}`,
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
    // HTML dots retain a constant pixel size under the SVG's nonuniform scaling.
    plotRoot
      .querySelectorAll('[data-traffic-point]')
      .forEach((node) => node.remove());
    const pointLabels = el('point-labels');
    pointLabels.replaceChildren();
    for (const point of plot.points) {
      const dot = document.createElement('span');
      dot.dataset.trafficPoint = '';
      dot.className = root.dataset.dotClass ?? '';
      dot.style.setProperty('--point-x', `${point.x}%`);
      dot.style.setProperty('--point-y', `${point.y}%`);
      dot.setAttribute('aria-hidden', 'true');
      plotRoot.append(dot);
      if (plot.mode === 'discrete') {
        const date = document.createElement('time');
        date.dateTime = point.date;
        date.textContent = point.date;
        date.className = root.dataset.pointClass ?? '';
        date.style.setProperty('--point-x', `${point.x}%`);
        pointLabels.append(date);
      }
    }
    if (plot.mode !== 'empty' && available)
      chart = mountChart(plotRoot, {
        count: plot.samples.length,
        sample(index) {
          const day = plot.samples[index];
          const quality =
            day.quality === 'sampled-estimate'
              ? zh
                ? '采样估计'
                : 'Sampled estimate'
              : day.quality === 'partial'
                ? zh
                  ? '部分覆盖'
                  : 'Partial coverage'
                : day.quality === 'observed'
                  ? zh
                    ? '观测值'
                    : 'Observed'
                  : zh
                    ? '缺失'
                    : 'Missing';
          return {
            date: day.date,
            x: day.x,
            y: day.y,
            rows: [
              {
                label: metric === 'pageLoads' ? 'Page Views' : 'Visits',
                value:
                  day[metric] === null
                    ? zh
                      ? '缺失'
                      : 'Missing'
                    : String(day[metric]),
              },
              { label: zh ? '数据状态' : 'Data quality', value: quality },
            ],
          };
        },
      });
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
    chart?.destroy();
    chart = undefined;
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
  const observer = new MutationObserver(() => {
    if (!root.isConnected) stop();
  });
  observer.observe(root.ownerDocument.documentElement, {
    childList: true,
    subtree: true,
  });
  const pagehide = (event: PageTransitionEvent) => {
    if (event.persisted) chart?.reset();
    else stop();
  };
  window.addEventListener('pagehide', pagehide);
  void load('30d');
  function stop() {
    chart?.destroy();
    chart = undefined;
    controller?.abort();
    controller = undefined;
    root.removeEventListener('click', click);
    window.removeEventListener('pagehide', pagehide);
    observer.disconnect();
  }
  return stop;
}
