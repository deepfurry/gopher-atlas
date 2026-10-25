import { useState } from 'react';
import type { paths } from '@gopheratlas/api-client';
import { useSearchParams } from 'react-router';
import { useMe } from '@/app/context';
import { client, unwrap, ErrorNotice } from '@/shared/api';
import { usePages } from '@/shared/query';
import { LoadMore } from '@/shared/pagination';
import { useDebounced } from '@/hooks/use-debounced';
import {
  states,
  types,
  productTypes,
  ratings,
  difficulties,
} from '@/shared/status';
import { Button } from '@/components/ui/button';
import { SearchInput, Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SearchSelect } from '@/components/ui/search-select';
import { Checkbox } from '@/components/ui/checkbox';
import { FilterBar } from '@/components/ui/workspace';
import { AuthorSelect } from './selectors';

type Query = NonNullable<
  paths['/api/admin/v1/content']['get']['parameters']['query']
>;
const advancedKeys = [
  'state',
  'owner',
  'archived',
  'tag',
  'group',
  'language',
  'topic',
  'rating',
  'difficulty',
  'sourceLanguage',
] as const;
const onlyCurated = ['topic', 'rating', 'difficulty', 'sourceLanguage'];
export function contentListQuery(params: URLSearchParams): Query {
  const type = (params.get('type') || 'curated_article') as Query['type'];
  return {
    type,
    q: params.get('q') || undefined,
    editorialState: (params.get('state') ||
      undefined) as Query['editorialState'],
    published: (params.get('published') || undefined) as Query['published'],
    sort: (params.get('sort') || 'updated_desc') as Query['sort'],
    ownerUserId: Number(params.get('owner')) || undefined,
    includeArchived: params.get('archived') === 'true',
    tagId:
      type !== 'topic' ? Number(params.get('tag')) || undefined : undefined,
    groupSlug: type === 'note' ? params.get('group') || undefined : undefined,
    language: params.get('language') || undefined,
    ...(type === 'curated_article'
      ? {
          topicId: Number(params.get('topic')) || undefined,
          rating: (params.get('rating') || undefined) as Query['rating'],
          difficulty: (params.get('difficulty') ||
            undefined) as Query['difficulty'],
          sourceLanguage: params.get('sourceLanguage') || undefined,
        }
      : {}),
  };
}
// Options have their own bounded server search, independent of loaded content rows.
function RelationFilter({
  kind,
  value,
  onChange,
}: {
  kind: 'tag' | 'group' | 'topic';
  value: string;
  onChange: (value: string) => void;
}) {
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const tags = usePages(
    ['tags', 'list-filter', q],
    async (after, signal) =>
      unwrap(
        await client.GET('/api/admin/v1/tags', {
          signal,
          params: { query: { after, q } },
        }),
      ),
    kind === 'tag',
  );
  const groups = usePages(
    ['note-groups', 'list-filter', q],
    async (after, signal) =>
      unwrap(
        await client.GET('/api/admin/v1/note-groups', {
          signal,
          params: { query: { after, q } },
        }),
      ),
    kind === 'group',
  );
  const topics = usePages(
    ['content', 'topic-filter', q],
    async (after, signal) =>
      unwrap(
        await client.GET('/api/admin/v1/content-filter-topics', {
          signal,
          params: { query: { after, q } },
        }),
      ),
    kind === 'topic',
  );
  const label = { tag: '标签', group: '分组', topic: '话题' }[kind];
  const page = kind === 'tag' ? tags : kind === 'group' ? groups : topics;
  const options = [
    { value: '', label: `全部${label}` },
    ...(kind === 'tag'
      ? tags.items.map((t) => ({ value: String(t.id), label: t.name }))
      : kind === 'group'
        ? groups.items.map((g) => ({ value: g.slug, label: g.name }))
        : topics.items.map((t) => ({
            value: String(t.id),
            label: t.title || '未命名话题',
          }))),
  ];
  if (value && !options.some((o) => o.value === value))
    options.push({ value, label: `已选${label} ${value}` });
  return (
    <SearchSelect
      label={`${label}筛选`}
      value={value}
      onValueChange={onChange}
      options={options}
      search={search}
      onSearchChange={setSearch}
      footer={
        <>
          <ErrorNotice error={page.error} />
          <LoadMore {...page} />
        </>
      }
    />
  );
}
export function ContentListFilters() {
  const [params, setParams] = useSearchParams();
  const me = useMe();
  const type = params.get('type') || 'curated_article';
  const get = (key: string) => params.get(key) || '';
  const change = (key: string, value: string) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key === 'type') {
        for (const name of [...onlyCurated, 'tag', 'group']) next.delete(name);
      }
      return next;
    });
  const applicable = advancedKeys.filter(
    (key) =>
      (!['owner', 'archived'].includes(key) || me.permissions.manageUsers) &&
      (!onlyCurated.includes(key) || type === 'curated_article') &&
      (key !== 'group' || type === 'note') &&
      (key !== 'tag' || type !== 'topic'),
  );
  const count = applicable.filter(
    (key) => get(key) && get(key) !== 'false',
  ).length;
  const open =
    get('filters') === 'open' || (count > 0 && get('filters') !== 'closed');
  const active =
    !!get('q') ||
    !!get('published') ||
    count > 0 ||
    (get('sort') && get('sort') !== 'updated_desc');
  return (
    <section aria-label="内容筛选" className="content-list-filters">
      <FilterBar>
        <SearchInput
          aria-label="搜索标题、摘要或 Slug"
          placeholder="搜索中英文标题、摘要或 Slug…"
          maxLength={200}
          value={get('q')}
          onChange={(e) => change('q', e.target.value)}
        />
        <Select
          label="内容类型"
          value={type}
          onValueChange={(v) => change('type', v)}
          options={productTypes
            .filter((v) => v !== 'topic' || me.permissions.createTopic)
            .map((value) => ({ value, label: types[value] }))}
        />
        <Select
          label="CMS 发布状态"
          value={get('published')}
          onValueChange={(v) => change('published', v)}
          options={[
            { value: '', label: '全部发布状态' },
            { value: 'yes', label: '已发布' },
            { value: 'no', label: '未发布' },
          ]}
        />
        <Select
          label="更新时间排序"
          value={get('sort') || 'updated_desc'}
          onValueChange={(v) => change('sort', v)}
          options={[
            { value: 'updated_desc', label: '最近更新' },
            { value: 'updated_asc', label: '最早更新' },
          ]}
        />
        <Button
          variant="ghost"
          aria-expanded={open}
          aria-controls="content-advanced-filters"
          onClick={() => change('filters', open ? 'closed' : 'open')}
        >
          高级筛选{count ? ` (${count})` : ''}
        </Button>
        {active && (
          <Button variant="ghost" onClick={() => setParams({ type })}>
            清空筛选
          </Button>
        )}
      </FilterBar>
      {open && (
        <div id="content-advanced-filters">
          <FilterBar>
            <Select
              label="编辑状态"
              value={get('state')}
              onValueChange={(v) => change('state', v)}
              options={[
                { value: '', label: '全部编辑状态' },
                ...Object.entries(states).map(([value, label]) => ({
                  value,
                  label,
                })),
              ]}
            />
            {type !== 'topic' && (
              <RelationFilter
                kind="tag"
                value={get('tag')}
                onChange={(v) => change('tag', v)}
              />
            )}
            {type === 'note' && (
              <RelationFilter
                kind="group"
                value={get('group')}
                onChange={(v) => change('group', v)}
              />
            )}
            {type === 'curated_article' && (
              <>
                <RelationFilter
                  kind="topic"
                  value={get('topic')}
                  onChange={(v) => change('topic', v)}
                />
                <Select
                  label="评级筛选"
                  value={get('rating')}
                  onValueChange={(v) => change('rating', v)}
                  options={[
                    { value: '', label: '全部评级' },
                    ...ratings.map((value) => ({ value, label: value })),
                  ]}
                />
                <Select
                  label="难度筛选"
                  value={get('difficulty')}
                  onValueChange={(v) => change('difficulty', v)}
                  options={[
                    { value: '', label: '全部难度' },
                    ...Object.entries(difficulties).map(([value, label]) => ({
                      value,
                      label,
                    })),
                  ]}
                />
                <Input
                  aria-label="原文语言"
                  placeholder="原文语言，如 en"
                  maxLength={32}
                  value={get('sourceLanguage')}
                  onChange={(e) => change('sourceLanguage', e.target.value)}
                />
              </>
            )}
            <Input
              aria-label="内容语言"
              placeholder="内容语言，如 zh-CN"
              maxLength={32}
              value={get('language')}
              onChange={(e) => change('language', e.target.value)}
            />
            {me.permissions.manageUsers && (
              <>
                <AuthorSelect
                  label="负责人"
                  value={Number(get('owner')) || 0}
                  onChange={(v) => change('owner', v ? String(v) : '')}
                  allowAll
                />
                <Checkbox
                  label="包含归档"
                  checked={get('archived') === 'true'}
                  onCheckedChange={(v) => change('archived', v ? 'true' : '')}
                />
              </>
            )}
          </FilterBar>
        </div>
      )}
    </section>
  );
}
