import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { client, unwrap, ErrorNotice, APIError } from '@/shared/api';
import { usePages, useEditorialRefresh } from '@/shared/query';
import { LoadMore } from '@/shared/pagination';
import { useConfirm } from '@/shared/confirm';
import { date, name, decisions } from '@/shared/status';
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
          title: `将版本 ${no} 恢复为草稿？`,
          description:
            '将此固定版本复制到当前草稿。当前发布版本与历史记录保持不变。',
          confirm: '恢复为草稿',
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
        toast.success('历史版本已恢复为草稿。');
      }
    },
  });
  return (
    <section className="workspace-section">
      <h2>版本历史</h2>
      <ErrorNotice error={list.error} />
      <ul className="revision-list">
        {list.items.map((r) => (
          <li key={r.id}>
            <Button variant="outline" onClick={() => setNo(r.revisionNo)}>
              查看版本 {r.revisionNo}
            </Button>
            <span>
              {date(r.createdAt)} · {name(r.creator)} / {name(r.byline)}
            </span>
            {r.pending && <span className="badge">待审核</span>}
            {r.published && (
              <span className="badge published">已在 CMS 发布</span>
            )}
            {r.reviewDecision && (
              <span className="badge">{decisions[r.reviewDecision]}</span>
            )}
          </li>
        ))}
      </ul>
      {!list.isPending && !list.items.length && (
        <p>尚无历史版本。提交审核或直接发布时会创建固定版本。</p>
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
              将版本 {no} 恢复为草稿
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
      <h2>路径历史</h2>
      <ErrorNotice error={routes.error} />
      <ul className="route-history">
        {routes.items.map((route) => (
          <li key={route.path}>
            <code>{route.path}</code>
            <span className="badge">
              {route.kind === 'canonical' ? '主路径' : '重定向'}
            </span>
            <span className="caption">永久保留的历史路径</span>
          </li>
        ))}
      </ul>
      {!routes.items.length && (
        <p className="caption">首次在 CMS 发布时会确定主路径。</p>
      )}
      <LoadMore {...routes} />
    </section>
  );
}
