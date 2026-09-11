import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { validateMarkdown } from '@gopheratlas/markdown';
import { useMe } from '@/app/context';
import { client, unwrap, ErrorNotice, NoAccess, APIError } from '@/shared/api';
import { useEditorialRefresh } from '@/shared/query';
import { useConfirm } from '@/shared/confirm';
import { ContentStatus, name } from '@/shared/status';
import { MarkdownFeedback } from '@/shared/markdown';
import { Button } from '@/components/ui/button';
import { RevisionView } from '@/features/content/revision-view';
export default function ReviewWorkspace() {
  const { id, reviewId } = useParams();
  const me = useMe();
  const confirm = useConfirm();
  const refresh = useEditorialRefresh();
  const [comment, setComment] = useState('');
  const [completed, setCompleted] = useState(false);
  const view = useQuery({
    queryKey: ['reviews', 'detail', id, reviewId],
    queryFn: async ({ signal }) =>
      reviewId
        ? unwrap(
            await client.GET('/api/admin/v1/reviews/{id}', {
              signal,
              params: { path: { id: Number(reviewId) } },
            }),
          )
        : unwrap(
            await client.GET('/api/admin/v1/content/{id}/review', {
              signal,
              params: { path: { id: Number(id) } },
            }),
          ),
    enabled: me.permissions.review && !completed,
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: async (kind: 'changes' | 'approve') => {
      const data = view.data!;
      const revisionId = data.revision.id;
      const revisionNo = data.revision.revisionNo;
      const params = { path: { id: data.content.id } };
      if (kind === 'changes') {
        if (
          !comment.trim() ||
          new TextEncoder().encode(comment).length > 16384 ||
          validateMarkdown(comment).length
        )
          throw new APIError(
            'invalid_markdown',
            'Comment is required and must be safe',
          );
        return unwrap(
          await client.POST(
            '/api/admin/v1/content/{id}/actions/request-changes',
            { params, body: { revisionId, commentMarkdown: comment } },
          ),
        );
      }
      if (
        !(await confirm({
          title: `Approve Revision ${revisionNo}?`,
          description: `Publishes exact immutable Revision ${revisionNo} in CMS. This does not publish the public site.`,
          confirm: `Approve Revision ${revisionNo} & Publish in CMS`,
        }))
      )
        return null;
      return unwrap(
        await client.POST('/api/admin/v1/content/{id}/actions/publish', {
          params,
          body: { mode: 'reviewed', revisionId },
        }),
      );
    },
    onSuccess: async (result) => {
      if (result) {
        setCompleted(true);
        await refresh();
        toast.success('Review decision saved.');
      }
    },
  });
  if (!me.permissions.review) return <NoAccess />;
  if (completed)
    return (
      <>
        <h1>Review completed</h1>
        <p>The exact Revision decision was saved in CMS.</p>
        <Link to="/reviews">Return to pending queue</Link> ·{' '}
        <Link to="/reviews/history">Review history</Link>
      </>
    );
  return (
    <>
      <p className="caption">IMMUTABLE REVIEW WORKSPACE</p>
      <h1>{reviewId ? 'Historical review' : 'Pending review'}</h1>
      <ErrorNotice error={view.error} />
      {view.isPending && <p role="status">Loading immutable Revision…</p>}
      {view.data && (
        <>
          <p>
            Owner: {name(view.data.content.owner)} · Byline:{' '}
            {name(view.data.revision.byline)}
          </p>
          <ContentStatus content={view.data.content} />
          <RevisionView
            revision={view.data.revision}
            type={view.data.content.type}
          />
          <ErrorNotice error={mutation.error} />
          {view.data.actions.requestChanges && (
            <section className="workspace-section">
              <h2>Request changes</h2>
              <label>
                Review comment (required)
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={5}
                  disabled={mutation.isPending}
                />
              </label>
              <MarkdownFeedback source={comment} />
              <Button
                variant="outline"
                disabled={mutation.isPending || !comment.trim()}
                onClick={() => mutation.mutate('changes')}
              >
                Request changes
              </Button>
            </section>
          )}
          {view.data.actions.approvePublish && (
            <Button
              disabled={mutation.isPending}
              onClick={() => mutation.mutate('approve')}
            >
              Approve &amp; Publish in CMS
            </Button>
          )}
        </>
      )}
    </>
  );
}
