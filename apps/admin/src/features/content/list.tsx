import { useMemo } from 'react';
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
import { ErrorNotice, type Schema } from '@/shared/api';
import { useContentPages } from '@/shared/query';
import { useDebounced } from '@/hooks/use-debounced';
import { LoadMore } from '@/shared/pagination';
import {
  EditorialBadge,
  PublishedBadge,
  date,
  name,
  types,
} from '@/shared/status';
import { Button, IconButton } from '@/components/ui/button';
import {
  PageHeader,
  EmptyState,
  LoadingState,
  Badge,
} from '@/components/ui/workspace';
import { DropdownMenu, MenuItem } from '@/components/ui/menu';
import { CreateContent } from '@/components/admin/create-content';
import { productColumns } from './product-list';
import { ContentListFilters, contentListQuery } from './list-filters';
export { CreateContent } from '@/components/admin/create-content';
type Row = Schema<'ContentSummary'>;
export default function ContentList() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const filters = contentListQuery(params);
  const q = useDebounced(filters.q ?? '');
  const type = filters.type || 'curated_article';
  const query = { ...filters, q };
  const list = useContentPages(['content', 'list', query], query);
  const hasFilters = Object.entries(filters).some(
    ([key, value]) =>
      !['type', 'sort', 'includeArchived'].includes(key) &&
      value !== undefined &&
      value !== '',
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
  const rows = list.items;
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
      <ContentListFilters />
      <ErrorNotice error={list.error} />
      {list.isPending ? (
        <LoadingState label="正在加载内容…" />
      ) : list.isError && !rows.length ? (
        <EmptyState
          title="内容加载失败"
          description="请重试，当前筛选条件已保留。"
          action={
            <Button variant="outline" onClick={() => void list.refetch()}>
              重新加载
            </Button>
          }
        />
      ) : (
        <>
          {rows.length ? (
            <div
              className="table-scroll content-list-table"
              role="region"
              tabIndex={0}
              aria-label="内容列表"
            >
              <table>
                <thead>
                  {table.getHeaderGroups().map((group) => (
                    <tr key={group.id}>
                      {group.headers.map((header) => (
                        <th
                          key={header.id}
                          scope="col"
                          data-column={header.column.id}
                        >
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
                        <td key={cell.id} data-column={cell.column.id}>
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
              title={
                hasFilters || filters.includeArchived
                  ? '没有匹配的内容'
                  : '还没有内容'
              }
              description={
                hasFilters
                  ? '调整或清空筛选条件后重试。'
                  : '新建一份内容开始编写。'
              }
            />
          )}
          <div className="pagination">
            <span>已加载 {list.items.length} 条</span>
            <LoadMore {...list} />
          </div>
        </>
      )}
    </>
  );
}
