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
import { date, name } from '@/shared/status';
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
      <p className="caption">REVIEWS</p>
      <h1>Review history</h1>
      <ErrorNotice error={list.error} />
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Review history"
      >
        <table>
          <thead>
            <tr>
              <th>Decision</th>
              <th>Content</th>
              <th>Revision</th>
              <th>Reviewer</th>
              <th>Time</th>
              <th>Comment excerpt</th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((r) => (
              <tr key={r.id}>
                <td>{r.decision}</td>
                <td>
                  <Link to={`/reviews/history/${r.id}`}>{r.title}</Link>
                </td>
                <td>{r.revisionNo}</td>
                <td>{name(r.reviewer)}</td>
                <td>{date(r.createdAt)}</td>
                <td className="excerpt">
                  {r.commentMarkdown.slice(0, 140) || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!list.isPending && !list.items.length && <p>No review decisions yet.</p>}
      <LoadMore {...list} />
    </>
  );
}
