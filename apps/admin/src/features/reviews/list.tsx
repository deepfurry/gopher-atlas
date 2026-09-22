import { Link } from 'react-router';
import { Tray, ArrowRight } from '@phosphor-icons/react';
import { useMe } from '@/app/context';
import {
  client,
  unwrap,
  ErrorNotice,
  NoAccess,
  type Schema,
} from '@/shared/api';
import { usePages } from '@/shared/query';
import { LoadMore } from '@/shared/pagination';
import { date, name } from '@/shared/status';
import {
  PageHeader,
  Table,
  EmptyState,
  LoadingState,
  Avatar,
  Badge,
} from '@/components/ui/workspace';
export default function Pending() {
  const me = useMe();
  const list = usePages<Schema<'PendingReview'>>(
    ['reviews', 'pending'],
    async (after, signal) => {
      const result = unwrap(
        await client.GET('/api/admin/v1/reviews', {
          signal,
          params: { query: { after, view: 'pending' } },
        }),
      );
      return { ...result, items: result.items as Schema<'PendingReview'>[] };
    },
    me.permissions.review,
  );
  if (!me.permissions.review) return <NoAccess />;
  return (
    <>
      <PageHeader
        title="待审核"
        description="阅读提交时固定的内容版本，给出修改意见或确认发布。"
      />
      <ErrorNotice error={list.error} />
      {list.isPending ? (
        <LoadingState label="正在加载审核队列…" />
      ) : !list.items.length ? (
        <EmptyState
          title="待审核队列已清空"
          description="新的内容提交审核后会出现在这里。"
        />
      ) : (
        <Table label="待审核列表">
          <thead>
            <tr>
              <th>内容</th>
              <th>版本</th>
              <th>负责人</th>
              <th>署名作者</th>
              <th>提交时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((r) => (
              <tr key={r.revisionId}>
                <td>
                  <Link
                    to={`/reviews/pending/${r.contentId}`}
                    className="person"
                  >
                    <Tray />
                    {r.title || '未命名内容'}
                  </Link>
                </td>
                <td>
                  <Badge tone="info">v{r.revisionNo}</Badge>
                </td>
                <td>{name(r.owner)}</td>
                <td>
                  <span className="person">
                    <Avatar name={name(r.byline)} />
                    {name(r.byline)}
                  </span>
                </td>
                <td>{date(r.submittedAt)}</td>
                <td>
                  <Link
                    className="text-action"
                    to={`/reviews/pending/${r.contentId}`}
                  >
                    开始审核
                    <ArrowRight />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <div className="pagination">
        <span>已加载 {list.items.length} 条</span>
        <LoadMore {...list} />
      </div>
    </>
  );
}
