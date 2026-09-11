import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import { client, unwrap, ErrorNotice, type Schema } from '@/shared/api';
import { useMe } from '@/app/context';
import { usePages } from '@/shared/query';
import { useDebounced } from '@/shared/markdown';
import { LoadMore } from '@/shared/pagination';
import { ContentStatus, date, name, states, types } from '@/shared/status';
import { Button } from '@/components/ui/button';
type Row = Schema<'ContentSummary'>;
export function CreateContent() {
  const me = useMe();
  const navigate = useNavigate();
  const [kind, setKind] = useState<Schema<'ContentType'>>('post');
  const create = useMutation({
    mutationFn: async () =>
      unwrap(
        await client.POST('/api/admin/v1/content', { body: { type: kind } }),
      ),
    onSuccess: (item) => navigate(`/content/${item.id}`),
  });
  return (
    <div>
      <div className="toolbar">
        <select
          aria-label="New content type"
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
        >
          {Object.entries(types)
            .filter(([type]) => type !== 'topic' || me.permissions.createTopic)
            .map(([type, label]) => (
              <option key={type} value={type}>
                {label}
              </option>
            ))}
        </select>
        <Button disabled={create.isPending} onClick={() => create.mutate()}>
          Create content
        </Button>
      </div>
      <ErrorNotice error={create.error} />
    </div>
  );
}
export default function ContentList() {
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const type = params.get('type') ?? '';
  const state = params.get('state') ?? '';
  const q = useDebounced(params.get('q') ?? '');
  const owner = Number(params.get('owner') || 0);
  const archived = params.get('archived') === 'true';
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
        header: 'Title',
        cell: ({ row }) => (
          <Link to={`/content/${row.original.id}`}>
            {row.original.title || 'Untitled'}
          </Link>
        ),
      },
      {
        accessorKey: 'type',
        header: 'Type',
        cell: ({ row }) => types[row.original.type],
      },
      {
        id: 'status',
        header: 'Editorial / publication',
        cell: ({ row }) => <ContentStatus content={row.original} />,
      },
      {
        id: 'authors',
        header: 'Owner / Byline',
        cell: ({ row }) => (
          <>
            {name(row.original.owner)}
            <span className="caption user-id">
              By {name(row.original.byline)}
            </span>
          </>
        ),
      },
      {
        accessorKey: 'updatedAt',
        header: 'Updated',
        cell: ({ row }) => date(row.original.updatedAt),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <Link to={`/content/${row.original.id}`}>
            {row.original.actions.editDraft ? 'Edit Draft' : 'View'}
          </Link>
        ),
      },
    ],
    [],
  );
  const table = useReactTable({
    data: list.items,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="caption">CONTENT</p>
          <h1>
            {type
              ? (types[type as keyof typeof types] ?? 'Content')
              : 'All Content'}
          </h1>
        </div>
        <CreateContent />
      </div>
      <div className="filters">
        <label>
          Type
          <select value={type} onChange={(e) => change('type', e.target.value)}>
            <option value="">All types</option>
            {Object.entries(types).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Editorial state
          <select
            value={state}
            onChange={(e) => change('state', e.target.value)}
          >
            <option value="">All states</option>
            {Object.entries(states).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Search title / summary
          <input
            type="search"
            maxLength={200}
            value={params.get('q') ?? ''}
            onChange={(e) => change('q', e.target.value)}
          />
        </label>
        {me.permissions.manageUsers && (
          <>
            <label>
              Owner user ID
              <input
                type="number"
                min={1}
                value={owner || ''}
                onChange={(e) => change('owner', e.target.value)}
              />
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={archived}
                onChange={(e) =>
                  change('archived', e.target.checked ? 'true' : '')
                }
              />
              Include archived
            </label>
          </>
        )}
      </div>
      <ErrorNotice error={list.error} />
      {list.isPending ? (
        <p role="status">Loading content…</p>
      ) : (
        <>
          <div
            className="table-scroll"
            role="region"
            tabIndex={0}
            aria-label="Content table"
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
          {!list.items.length && <p>No content matches these filters.</p>}
          <LoadMore {...list} />
        </>
      )}
    </>
  );
}
