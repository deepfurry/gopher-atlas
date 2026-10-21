import { mountChart } from './chart';
import { growthCalendar, type GrowthSeries } from './content';

const mounted = new WeakMap<HTMLElement, () => void>();
/** Progressive enhancement: the default chart and native data table need no JS. */
export function mountStatistics(root: HTMLElement) {
  if (mounted.has(root)) return mounted.get(root);
  const controls = root.querySelector<HTMLElement>('[data-stats-switch]');
  if (!controls || controls.dataset.mounted) return;
  const tabs = [
    ...controls.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
  ];
  const panels = [...root.querySelectorAll<HTMLElement>('[data-stats-panel]')];
  if (!tabs.length || tabs.length !== panels.length) return;
  const charts = panels.flatMap((panel) => {
    const chart = panel.querySelector<HTMLElement>('[data-growth-chart]');
    if (!chart) return [];
    const points = [
      ...panel.querySelectorAll<HTMLElement>('[data-growth-point]'),
    ].map((row) => ({
      date: row.dataset.date!,
      total: Number(row.dataset.total),
    }));
    if (!points.length) return [];
    const series: GrowthSeries = {
      points,
      total: points.at(-1)!.total,
      firstDate: points[0].date,
      lastDate: points.at(-1)!.date,
    };
    const calendar = growthCalendar(series);
    const zh = root.dataset.locale !== 'en';
    return [
      mountChart(chart, {
        count: calendar.count,
        sample(index) {
          const point = calendar.point(index);
          return {
            ...point,
            rows: [
              {
                label: zh ? '累计内容' : 'Cumulative items',
                value: String(point.total),
              },
              {
                label: zh ? '当日新增' : 'Added that day',
                value: String(point.added),
              },
            ],
          };
        },
      }),
    ];
  });
  function select(index: number) {
    charts.forEach((chart) => chart.reset());
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      panels[i].hidden = i !== index;
    });
  }
  const removers: (() => void)[] = [];
  tabs.forEach((tab, index) => {
    const click = () => select(index);
    const keydown = (event: KeyboardEvent) => {
      let next: number;
      switch (event.key) {
        case 'ArrowRight':
          next = (index + 1) % tabs.length;
          break;
        case 'ArrowLeft':
          next = (index + tabs.length - 1) % tabs.length;
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = tabs.length - 1;
          break;
        default:
          return;
      }
      event.preventDefault();
      select(next);
      tabs[next].focus();
    };
    tab.addEventListener('click', click);
    tab.addEventListener('keydown', keydown);
    removers.push(() => {
      tab.removeEventListener('click', click);
      tab.removeEventListener('keydown', keydown);
    });
  });
  // No deferred animation or request: rapid input and reduced motion settle immediately.
  select(0);
  controls.dataset.mounted = 'true';
  controls.hidden = false;
  const observer = new MutationObserver(() => {
    if (!root.isConnected) stop();
  });
  observer.observe(root.ownerDocument.documentElement, {
    childList: true,
    subtree: true,
  });
  function stop() {
    charts.forEach((chart) => chart.destroy());
    removers.forEach((remove) => remove());
    observer.disconnect();
    mounted.delete(root);
    delete controls!.dataset.mounted;
  }
  mounted.set(root, stop);
  return stop;
}
