import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import {
  DotsThree,
  PencilSimple,
  Eye,
  ClockCounterClockwise,
} from '@phosphor-icons/react';
import { client, unwrap, ErrorNotice, type Schema } from '@/shared/api';
import { useMe } from '@/app/context';
import { usePages } from '@/shared/query';
import { useDebounced } from '@/hooks/use-debounced';
import { LoadMore } from '@/shared/pagination';
import {
  EditorialBadge,
  PublishedBadge,
  date,
  name,
  states,
  types,
  productTypes,
  ratings,
  difficulties,
} from '@/shared/status';
import { IconButton } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { SearchInput } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  PageHeader,
  FilterBar,
  EmptyState,
  LoadingState,
  Badge,
} from '@/components/ui/workspace';
import { DropdownMenu, MenuItem } from '@/components/ui/menu';
import { CreateContent } from '@/components/admin/create-content';
import { AuthorSelect } from './selectors';
import {
  productColumns,
  filterProducts,
  note,
  type ProductFilters,
} from './product-list';
export { CreateContent } from '@/components/admin/create-content';
type Row = Schema<'ContentSummary'>;
export default function ContentList() {
  const me = useMe(),
    navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [published, setPublished] = useState('');
  const type = params.get('type') ?? 'curated_article',
    state = params.get('state') ?? '';
  const q = useDebounced(params.get('q') ?? '');
  const [productFilters, setProductFilters] = useState<ProductFilters>({
    rating: '',
    difficulty: '',
    language: '',
    topic: '',
    tag: '',
    group: '',
    sort: 'recommended',
  });
  const setFilter = (key: keyof ProductFilters, value: string) =>
    setProductFilters((previous) => ({ ...previous, [key]: value }));
  useEffect(() => {
    setProductFilters({
      rating: '',
      difficulty: '',
      language: '',
      topic: '',
      tag: '',
      group: '',
      sort: type === 'curated_article' ? 'recommended' : 'order',
    });
    setPublished('');
  }, [type]);
  const owner = Number(params.get('owner') || 0),
    archived = params.get('archived') === 'true';
  const change = (key: string, value: string) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });
  const list = usePages(
    ['content', 'list', { type, state, q, owner, archived }],
    async (after, signal) =>
      unwrap(
        await client.GET('/api/admin/v1/content', {
          signal,
          params: {
            query: {
              after,
              type: (type || undefined) as Schema<'ContentType'> | undefined,
              editorialState: (state || undefined) as
                Schema<'EditorialState'> | undefined,
              q,
              ownerUserId: owner || undefined,
              includeArchived: archived,
            },
          },
        }),
      ),
  );
  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        accessorKey: 'title',
        header: '标题',
        cell: ({ row: { original: r } }) => (
          <div className="content-title-cell">
            <Link to={`/content/${r.id}`}>{r.title || '未命名内容'}</Link>
            {r.archivedAt !== null && <Badge>已归档</Badge>}
          </div>
        ),
      },
      ...productColumns(type),
      {
        id: 'editorial',
        header: '编辑状态',
        cell: ({ row }) => (
          <EditorialBadge state={row.original.editorialState} />
        ),
      },
      {
        id: 'published',
        header: 'CMS 发布',
        cell: ({ row }) => (
          <PublishedBadge
            id={row.original.publishedRevisionId}
            no={row.original.publishedRevisionNo}
          />
        ),
      },
      {
        id: 'authors',
        header: '负责人 / 署名',
        cell: ({ row }) => (
          <>
            {name(row.original.owner)}
            <span className="caption">{name(row.original.byline)}</span>
          </>
        ),
      },
      {
        accessorKey: 'updatedAt',
        header: '更新时间',
        cell: ({ row }) => (
          <span className="caption">{date(row.original.updatedAt)}</span>
        ),
      },
      {
        id: 'actions',
        header: '操作',
        cell: ({ row: { original: r } }) => (
          <DropdownMenu
            trigger={
              <IconButton label={`${r.title || '未命名内容'}的操作`}>
                <DotsThree />
              </IconButton>
            }
          >
            <MenuItem onClick={() => navigate(`/content/${r.id}`)}>
              {r.actions.editDraft ? <PencilSimple /> : <Eye />}
              {r.actions.editDraft ? '编辑草稿' : '查看内容'}
            </MenuItem>
            <MenuItem onClick={() => navigate(`/content/${r.id}?view=history`)}>
              <ClockCounterClockwise />
              版本历史
            </MenuItem>
          </DropdownMenu>
        ),
      },
    ],
    [navigate, type],
  );
  const rows = useMemo(
    () =>
      filterProducts(list.items, productFilters).filter(
        (item) =>
          !published ||
          (published === 'yes'
            ? item.publishedRevisionId !== null
            : item.publishedRevisionId === null),
      ),
    [list.items, published, productFilters],
  );
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    // Pagination is owned by the server cursor, not a table page index.
    autoResetPageIndex: false,
  });
  return (
    <>
      <PageHeader
        title={
          type ? (types[type as keyof typeof types] ?? '全部内容') : '全部内容'
        }
        description={
          type === 'curated_article'
            ? '收录外部优质文章，整理来源、评级与编辑点评。'
            : type === 'topic'
              ? '围绕主题组织精选文章，编排导读与推荐阅读。'
              : '按分组持续写作，记录原创学习与实践。'
        }
        actions={<CreateContent />}
      />
      <FilterBar>
        <SearchInput
          aria-label="搜索标题或摘要"
          placeholder="搜索标题或摘要…"
          maxLength={200}
          value={params.get('q') ?? ''}
          onChange={(e) => change('q', e.target.value)}
        />
        <Select
          label="内容类型"
          value={type}
          onValueChange={(v) => change('type', v)}
          options={[
            ...productTypes
              .filter(
                (value) => value !== 'topic' || me.permissions.createTopic,
              )
              .map((value) => ({ value, label: types[value] })),
          ]}
        />
        <Select
          label="编辑状态"
          value={state}
          onValueChange={(v) => change('state', v)}
          options={[
            { value: '', label: '全部编辑状态' },
            ...Object.entries(states).map(([value, label]) => ({
              value,
              label,
            })),
          ]}
        />
        <Select
          label="发布状态（已加载内容）"
          value={published}
          onValueChange={setPublished}
          options={[
            { value: '', label: '全部发布状态' },
            { value: 'yes', label: '已发布 · 已加载' },
            { value: 'no', label: '未发布 · 已加载' },
          ]}
        />
        {me.permissions.manageUsers && (
          <>
            <AuthorSelect
              value={owner}
              onChange={(v) => change('owner', v ? String(v) : '')}
              allowAll
              label="负责人"
            />
            <Checkbox
              label="包含归档"
              checked={archived}
              onCheckedChange={(v) => change('archived', v ? 'true' : '')}
            />
          </>
        )}
      </FilterBar>
      <FilterBar>
        {type === 'curated_article' && (
          <>
            <Select
              label="专区筛选"
              value={productFilters.topic}
              onValueChange={(v) => setFilter('topic', v)}
              options={[
                { value: '', label: '全部专区' },
                ...[
                  ...new Map(
                    list.items
                      .flatMap((r) => r.product?.topics ?? [])
                      .map((t) => [t.id, t]),
                  ).values(),
                ].map((t) => ({ value: String(t.id), label: t.title })),
              ]}
            />
            <Select
              label="标签筛选"
              value={productFilters.tag}
              onValueChange={(v) => setFilter('tag', v)}
              options={[
                { value: '', label: '全部标签' },
                ...[
                  ...new Map(
                    list.items
                      .flatMap((r) => r.product?.tags ?? [])
                      .map((t) => [t.id, t]),
                  ).values(),
                ].map((t) => ({ value: String(t.id), label: t.name })),
              ]}
            />
            <Select
              label="评级筛选"
              value={productFilters.rating}
              onValueChange={(v) => setFilter('rating', v)}
              options={[
                { value: '', label: '全部评级' },
                ...ratings.map((value) => ({ value, label: value })),
              ]}
            />
            <Select
              label="难度筛选"
              value={productFilters.difficulty}
              onValueChange={(v) => setFilter('difficulty', v)}
              options={[
                { value: '', label: '全部难度' },
                ...Object.entries(difficulties).map(([value, label]) => ({
                  value,
                  label,
                })),
              ]}
            />
            <Select
              label="语言筛选"
              value={productFilters.language}
              onValueChange={(v) => setFilter('language', v)}
              options={[
                { value: '', label: '全部语言' },
                ...Array.from(
                  new Set(
                    list.items.map((r) => r.product?.language).filter(Boolean),
                  ),
                ).map((value) => ({ value: value!, label: value! })),
              ]}
            />
          </>
        )}
        {type === 'note' && (
          <Select
            label="分组筛选"
            value={productFilters.group}
            onValueChange={(v) => setFilter('group', v)}
            options={[
              { value: '', label: '全部分组' },
              ...[
                ...new Map(
                  list.items.map((r) => [note(r)?.groupSlug, note(r)]),
                ).values(),
              ]
                .filter((p) => p?.groupSlug)
                .map((p) => ({ value: p!.groupSlug!, label: p!.group! })),
            ]}
          />
        )}
        <Select
          label="排序（已加载内容）"
          value={productFilters.sort}
          onValueChange={(v) => setFilter('sort', v)}
          options={
            type === 'curated_article'
              ? [
                  { value: 'recommended', label: '推荐优先' },
                  { value: 'rating', label: '按评级' },
                  { value: 'recent', label: '最近收录' },
                  { value: 'source-date', label: '原文日期' },
                  { value: 'title', label: '标题' },
                ]
              : [
                  { value: 'order', label: '内容顺序' },
                  { value: 'recent', label: '最近新增' },
                  { value: 'title', label: '标题' },
                ]
          }
        />
      </FilterBar>
      <p className="caption">
        产品属性筛选与排序作用于已加载内容，可通过分页继续加载。
      </p>
      <ErrorNotice error={list.error} />
      {list.isPending ? (
        <LoadingState label="正在加载内容…" />
      ) : (
        <>
          {published && (
            <p className="caption">
              发布状态仅筛选已加载内容，可继续加载更多。
            </p>
          )}
          {rows.length ? (
            <div
              className="table-scroll"
              role="region"
              tabIndex={0}
              aria-label="内容列表"
            >
              <table>
                <thead>
                  {table.getHeaderGroups().map((group) => (
                    <tr key={group.id}>
                      {group.headers.map((header) => (
                        <th key={header.id} scope="col">
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="没有匹配的内容"
              description="调整筛选条件，或新建一份内容开始编写。"
            />
          )}
          <div className="pagination">
            <span>
              已加载 {list.items.length} 条
              {published && `，当前显示 ${rows.length} 条`}
            </span>
            <LoadMore {...list} />
          </div>
        </>
      )}
    </>
  );
}
