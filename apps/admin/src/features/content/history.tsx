import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { client, unwrap, ErrorNotice, APIError } from '@/shared/api';
import { usePages, useEditorialRefresh } from '@/shared/query';
import { LoadMore } from '@/shared/pagination';
import { useConfirm } from '@/shared/confirm';
import { date, name } from '@/shared/status';
import { Button } from '@/components/ui/button';
import { contentKey, type Content } from './api';
import { RevisionView } from './revision-view';
import { toast } from 'sonner';
export function RevisionHistory({
  content,
  flush,
  busy = false,
  onBusyChange,
  onRestored,
  onConflict,
}: {
  content: Content;
  flush: () => Promise<number>;
  busy?: boolean;
  onBusyChange: (value: boolean) => void;
  onRestored: (content: Content) => void;
  onConflict: (error: unknown) => void;
}) {
  const [no, setNo] = useState<number | null>(null);
  const confirm = useConfirm();
  const refresh = useEditorialRefresh();
  const cache = useQueryClient();
  const list = usePages(['revisions', content.id], async (after, signal) =>
    unwrap(
      await client.GET('/api/admin/v1/content/{id}/revisions', {
        signal,
        params: { path: { id: content.id }, query: { after } },
      }),
    ),
  );
  const view = useQuery({
    queryKey: ['revisions', content.id, no],
    queryFn: async ({ signal }) =>
      unwrap(
        await client.GET('/api/admin/v1/content/{id}/revisions/{revisionNo}', {
          signal,
          params: { path: { id: content.id, revisionNo: no! } },
        }),
      ),
    enabled: no !== null,
    retry: false,
  });
  const restore = useMutation({
    mutationFn: async () => {
      onBusyChange(true);
      const version = await flush();
      if (
        !(await confirm({
          title: `Restore Revision ${no} to Draft?`,
          description:
            'Copies this immutable snapshot into the current Draft. The published pointer and revision history remain unchanged.',
          confirm: 'Restore to Draft',
        }))
      )
        return null;
      return unwrap(
        await client.POST(
          '/api/admin/v1/content/{id}/revisions/{revisionNo}/actions/restore',
          {
            params: { path: { id: content.id, revisionNo: no! } },
            body: { version },
          },
        ),
      );
    },
    onSettled: () => onBusyChange(false),
    onError: (error) => {
      if (
        error instanceof APIError &&
        error.code === 'content_version_conflict'
      )
        onConflict(error);
    },
    onSuccess: async (result) => {
      if (result) {
        cache.setQueryData(contentKey(content.id), result);
        onRestored(result);
        await refresh();
        toast.success('Revision restored to Draft.');
      }
    },
  });
  return (
    <section className="workspace-section">
      <h2>Revision history</h2>
      <ErrorNotice error={list.error} />
      <ul className="revision-list">
        {list.items.map((r) => (
          <li key={r.id}>
            <Button variant="outline" onClick={() => setNo(r.revisionNo)}>
              View Revision {r.revisionNo}
            </Button>
            <span>
              {date(r.createdAt)} · {name(r.creator)} / {name(r.byline)}
            </span>
            {r.pending && <span className="badge">Pending</span>}
            {r.published && (
              <span className="badge published">Published in CMS</span>
            )}
            {r.reviewDecision && (
              <span className="badge">{r.reviewDecision}</span>
            )}
          </li>
        ))}
      </ul>
      {!list.isPending && !list.items.length && (
        <p>No revisions yet. Submit or direct publish creates a snapshot.</p>
      )}
      <LoadMore {...list} />
      <ErrorNotice error={view.error} />
      {view.data && (
        <div className="history-detail">
          <RevisionView revision={view.data} type={content.type} />
          {content.actions.restoreRevision && view.data.restoreDraft && (
            <Button
              disabled={busy || restore.isPending}
              onClick={() => restore.mutate()}
            >
              Restore Revision {no} to Draft
            </Button>
          )}
          <ErrorNotice error={restore.error} />
        </div>
      )}
    </section>
  );
}
export function RouteHistory({ id }: { id: number }) {
  const routes = usePages(['content', 'routes', id], async (after, signal) =>
    unwrap(
      await client.GET('/api/admin/v1/content/{id}/routes', {
        signal,
        params: { path: { id }, query: { after } },
      }),
    ),
  );
  return (
    <section className="workspace-section">
      <h2>Route history</h2>
      <ErrorNotice error={routes.error} />
      <ul className="route-history">
        {routes.items.map((route) => (
          <li key={route.path}>
            <code>{route.path}</code>
            <span className="badge">
              {route.kind === 'canonical' ? 'Canonical' : 'Redirect'}
            </span>
            <span className="caption">Reserved historical path</span>
          </li>
        ))}
      </ul>
      {!routes.items.length && (
        <p className="caption">
          The first CMS publication reserves a canonical route.
        </p>
      )}
      <LoadMore {...routes} />
    </section>
  );
}
