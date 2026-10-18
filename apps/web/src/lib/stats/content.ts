import {
  compareText,
  dateLabel,
  type Publication,
} from '../publication/indexes.ts';

export const growthTypes = ['all', 'note', 'curated_article', 'topic'] as const;
export type GrowthType = (typeof growthTypes)[number];
export interface GrowthPoint {
  date: string;
  total: number;
}
export interface GrowthSeries {
  points: GrowthPoint[];
  total: number;
  firstDate: string | null;
  lastDate: string | null;
}

/** Consume validated identities, never URL aliases, Drafts or historical inventories. */
export function contentStatistics(publication: Publication) {
  // Generation zero is the existing Development placeholder, not a published input.
  if (publication.snapshot.generation === 0)
    return { available: false } as const;
  const daily = new Map<string, Record<Exclude<GrowthType, 'all'>, number>>();
  const counts = {
    note: 0,
    curated_article: 0,
    topic: 0,
    tags: publication.tagById.size,
  };
  for (const item of publication.contentById.values()) {
    if (item.type === 'post') continue;
    // dateLabel also rejects numbers beyond JavaScript's Date range. The existing
    // wire schema rejects negative/non-integer values but allows larger integers.
    const date = dateLabel(item.firstPublishedAt);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      throw new Error('public_date_invalid');
    const day = daily.get(date) ?? { note: 0, curated_article: 0, topic: 0 };
    day[item.type]++;
    counts[item.type]++;
    daily.set(date, day);
  }
  const days = [...daily].sort(([a], [b]) => compareText(a, b));
  const series = Object.fromEntries(
    growthTypes.map((type) => {
      let total = 0;
      const points: GrowthPoint[] = [];
      for (const [date, day] of days) {
        const added =
          type === 'all'
            ? day.note + day.curated_article + day.topic
            : day[type];
        if (!added) continue;
        total += added;
        points.push({ date, total });
      }
      return [
        type,
        {
          points,
          total,
          firstDate: points[0]?.date ?? null,
          lastDate: points.at(-1)?.date ?? null,
        },
      ];
    }),
  ) as Record<GrowthType, GrowthSeries>;
  return {
    available: true,
    counts,
    series,
    updatedAt: publication.snapshot.exportedAt,
  } as const;
}

/** Step geometry holds counts between publication dates; it never invents days. */
export function growthPlot(series: GrowthSeries) {
  if (!series.points.length) return null;
  const step = Math.max(1, Math.ceil(series.total / 4));
  const ceiling = Math.ceil(series.total / step) * step;
  const ticks = Array.from({ length: ceiling / step + 1 }, (_, i) => ({
    value: ceiling - i * step,
    y: ((i * step) / ceiling) * 100,
  }));
  const start = Date.parse(series.firstDate!),
    end = Date.parse(series.lastDate!);
  const points = series.points.map((point) => ({
    x:
      end === start
        ? 50
        : 1 + ((Date.parse(point.date) - start) / (end - start)) * 98,
    y: (1 - point.total / ceiling) * 100,
  }));
  const path = points
    .map((point, i) =>
      i === 0 ? `M ${point.x} ${point.y}` : `H ${point.x} V ${point.y}`,
    )
    .join(' ');
  return { ticks, path, end: points.at(-1)! };
}
