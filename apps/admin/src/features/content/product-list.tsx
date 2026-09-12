import { Link } from 'react-router';
import type { ColumnDef } from '@tanstack/react-table';
import type { Schema } from '@/shared/api';
import { Badge } from '@/components/ui/workspace';
import { difficulties, ratings } from '@/shared/status';

type Row = Schema<'ContentSummary'>;
export const curated = (row: Row) =>
  row.product?.payload as Schema<'CuratedPayload'> | undefined;
export const note = (row: Row) =>
  row.product?.payload as Schema<'NotePayload'> | undefined;
export const topic = (row: Row) =>
  row.product?.payload as Schema<'TopicPayload'> | undefined;
export function productColumns(type: string): ColumnDef<Row>[] {
  if (type === 'curated_article')
    return [
      {
        id: 'source',
        header: '来源 / 外部作者',
        cell: ({ row: { original: r } }) => (
          <>
            {curated(r)?.sourceName || '—'}
            <span className="caption">
              {curated(r)?.sourceAuthor || '作者未注明'}
            </span>
          </>
        ),
      },
      {
        id: 'rating',
        header: '评级 / 难度',
        cell: ({ row: { original: r } }) => (
          <>
            <Badge>{curated(r)?.rating || '待评定'}</Badge>
            <span className="caption">
              {difficulties[
                curated(r)?.difficulty as keyof typeof difficulties
              ] || '未设置'}{' '}
              · {curated(r)?.sourceLanguage || r.product?.language}
            </span>
          </>
        ),
      },
      {
        id: 'topics',
        header: '所属专区',
        cell: ({ row: { original: r } }) => (
          <div className="table-relations">
            {r.product?.topics.map((t) => (
              <Link key={t.id} to={`/content/${t.id}`}>
                {t.title}
              </Link>
            ))}
            {!r.product?.topics.length && '—'}
          </div>
        ),
      },
      {
        id: 'tags',
        header: '标签',
        cell: ({ row: { original: r } }) => (
          <div className="table-relations">
            {r.product?.tags.slice(0, 3).map((t) => (
              <Badge key={t.id}>{t.name}</Badge>
            ))}
            {(r.product?.tags.length ?? 0) > 3 && (
              <span
                className="caption"
                title={r.product!.tags.map((t) => t.name).join(' · ')}
              >
                +{r.product!.tags.length - 3}
              </span>
            )}
          </div>
        ),
      },
    ];
  if (type === 'topic')
    return [
      {
        id: 'summary',
        header: '简介',
        cell: ({ row: { original: r } }) => (
          <span className="table-summary">
            {r.product?.summary || '尚未填写'}
          </span>
        ),
      },
      {
        id: 'count',
        header: '精选 / 推荐',
        cell: ({ row: { original: r } }) =>
          `${r.product?.entryCount ?? 0} / ${topic(r)?.recommendedCount ?? 0}`,
      },
      {
        id: 'order',
        header: '排序',
        cell: ({ row: { original: r } }) => topic(r)?.order ?? 0,
      },
    ];
  if (type === 'note')
    return [
      {
        id: 'group',
        header: '分组',
        cell: ({ row: { original: r } }) => note(r)?.group || '未设置',
      },
      {
        id: 'order',
        header: '组内排序',
        cell: ({ row: { original: r } }) => note(r)?.order ?? 0,
      },
    ];
  return [];
}
export type ProductFilters = {
  rating: string;
  difficulty: string;
  language: string;
  topic: string;
  tag: string;
  group: string;
  sort: string;
};
export function filterProducts(rows: Row[], filters: ProductFilters) {
  const result = rows.filter((row) => {
    const p = row.product,
      c = curated(row),
      n = note(row);
    return (
      (!filters.rating || c?.rating === filters.rating) &&
      (!filters.difficulty || c?.difficulty === filters.difficulty) &&
      (!filters.language ||
        (c?.sourceLanguage ?? p?.language) === filters.language) &&
      (!filters.topic ||
        p?.topics.some((t) => String(t.id) === filters.topic)) &&
      (!filters.tag || p?.tags.some((t) => String(t.id) === filters.tag)) &&
      (!filters.group || n?.groupSlug === filters.group)
    );
  });
  const ratingRank = (row: Row) => {
    const index = ratings.indexOf(
      curated(row)?.rating as (typeof ratings)[number],
    );
    return index < 0 ? 99 : index;
  };
  return result.sort((a, b) => {
    if (filters.sort === 'rating')
      return ratingRank(a) - ratingRank(b) || a.id - b.id;
    if (filters.sort === 'title')
      return a.title.localeCompare(b.title, 'zh-CN') || a.id - b.id;
    if (filters.sort === 'source-date')
      return (
        (curated(b)?.sourcePublishedAt ?? '').localeCompare(
          curated(a)?.sourcePublishedAt ?? '',
        ) || b.id - a.id
      );
    if (filters.sort === 'recommended')
      return (
        Number(b.product?.featured) - Number(a.product?.featured) ||
        Number(curated(b)?.mustRead) - Number(curated(a)?.mustRead) ||
        ratingRank(a) - ratingRank(b) ||
        b.createdAt - a.createdAt
      );
    if (filters.sort === 'order')
      return (
        (note(a)?.groupOrder ?? 0) - (note(b)?.groupOrder ?? 0) ||
        (note(a)?.order ?? topic(a)?.order ?? 0) -
          (note(b)?.order ?? topic(b)?.order ?? 0) ||
        a.id - b.id
      );
    return b.createdAt - a.createdAt || b.id - a.id;
  });
}
