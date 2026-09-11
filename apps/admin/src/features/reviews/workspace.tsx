import { useState } from 'react';
import { CheckCircle, ChatText } from '@phosphor-icons/react';
import { Dialog } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/input';
import {
  PageHeader,
  LoadingState,
  EmptyState,
  Badge,
} from '@/components/ui/workspace';
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
  const [feedbackOpen, setFeedbackOpen] = useState(false);
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
          title: `确认通过版本 ${revisionNo}？`,
          description: `将在 CMS 发布当前阅读的固定版本 ${revisionNo}，并安排公开站点构建。实际同步进度请查看发布状态。`,
          confirm: `通过版本 ${revisionNo} 并发布到 CMS`,
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
        toast.success('审核决定已保存。');
      }
    },
  });
  if (!me.permissions.review) return <NoAccess />;
  if (completed)
    return (
      <>
        <PageHeader title="审核已完成" />
        <EmptyState
          title="审核决定已保存"
          description="决定关联的固定版本已保留，可在审核历史中查看。"
          action={
            <div className="toolbar">
              <Link to="/reviews">返回待审核队列</Link>
              <Link to="/reviews/history">查看审核历史</Link>
            </div>
          }
        />
      </>
    );
  return (
    <div className="review-workspace">
      <PageHeader
        title={reviewId ? '历史审核' : '审核详情'}
        description="当前阅读的是提交时固定的版本，不包含后续草稿修改。"
      />
      <ErrorNotice error={view.error} />
      {view.isPending && <LoadingState label="正在加载固定版本…" />}
      {view.data && (
        <>
          <div className="section-heading">
            <p className="caption">
              负责人：{name(view.data.content.owner)} · 署名作者：
              {name(view.data.revision.byline)}
            </p>
            <ContentStatus content={view.data.content} />
          </div>
          <RevisionView
            revision={view.data.revision}
            type={view.data.content.type}
          />
          {(view.data.actions.requestChanges ||
            view.data.actions.approvePublish) && (
            <div className="review-action-bar">
              <span className="caption">
                当前审核 <Badge>版本 {view.data.revision.revisionNo}</Badge>
              </span>
              <div className="toolbar">
                {view.data.actions.requestChanges && (
                  <Button
                    variant="outline"
                    disabled={mutation.isPending}
                    onClick={() => setFeedbackOpen(true)}
                  >
                    <ChatText />
                    要求修改
                  </Button>
                )}
                {view.data.actions.approvePublish && (
                  <Button
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate('approve')}
                  >
                    <CheckCircle />
                    通过并发布到 CMS
                  </Button>
                )}
              </div>
              <ErrorNotice error={mutation.error} />
            </div>
          )}
          <Dialog
            open={feedbackOpen && view.data.actions.requestChanges}
            onOpenChange={setFeedbackOpen}
            title="要求修改"
            description={`为版本 ${view.data.revision.revisionNo} 留下具体、可执行的修改意见。`}
            busy={mutation.isPending}
            footer={
              <>
                <Button
                  variant="outline"
                  disabled={mutation.isPending}
                  onClick={() => setFeedbackOpen(false)}
                >
                  取消
                </Button>
                <Button
                  disabled={mutation.isPending || !comment.trim()}
                  onClick={() => mutation.mutate('changes')}
                >
                  提交修改意见
                </Button>
              </>
            }
          >
            <label>
              审核意见（必填）
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={8}
                disabled={mutation.isPending}
                placeholder="说明需要调整的内容、原因与建议…"
                autoFocus
              />
            </label>
            <p className="caption">支持安全 Markdown，最多 16 KiB。</p>
            <MarkdownFeedback source={comment} />
            <ErrorNotice error={mutation.error} />
          </Dialog>
        </>
      )}
    </div>
  );
}
