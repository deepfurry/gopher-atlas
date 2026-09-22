import { Link } from 'react-router';
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
import { date, name, decisions } from '@/shared/status';
import {
  PageHeader,
  Table,
  EmptyState,
  LoadingState,
  Badge,
} from '@/components/ui/workspace';
export default function History() {
  const me = useMe();
  const list = usePages<Schema<'Review'>>(
    ['reviews', 'history'],
    async (after, signal) => {
      const result = unwrap(
        await client.GET('/api/admin/v1/reviews', {
          signal,
          params: { query: { after, view: 'history' } },
        }),
      );
      return { ...result, items: result.items as Schema<'Review'>[] };
    },
    me.permissions.review,
  );
  if (!me.permissions.review) return <NoAccess />;
  return (
    <>
      <PageHeader
        title="审核历史"
        description="回顾审核决定与对应的固定版本。"
      />
      <ErrorNotice error={list.error} />
      {list.isPending ? (
        <LoadingState />
      ) : !list.items.length ? (
        <EmptyState
          title="暂无审核记录"
          description="完成审核后，审核决定会永久保留在这里。"
        />
      ) : (
        <Table label="审核历史列表">
          <thead>
            <tr>
              <th>审核结果</th>
              <th>内容</th>
              <th>版本</th>
              <th>审核人</th>
              <th>时间</th>
              <th>意见摘要</th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((r) => (
              <tr key={r.id}>
                <td>
                  <Badge
                    tone={r.decision === 'approved' ? 'success' : 'warning'}
                  >
                    {decisions[r.decision]}
                  </Badge>
                </td>
                <td>
                  <Link to={`/reviews/history/${r.id}`}>
                    {r.title || '未命名内容'}
                  </Link>
                </td>
                <td>v{r.revisionNo}</td>
                <td>{name(r.reviewer)}</td>
                <td>{date(r.createdAt)}</td>
                <td className="excerpt">
                  {r.commentMarkdown.slice(0, 140) || '—'}
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
