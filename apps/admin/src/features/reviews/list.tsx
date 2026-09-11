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
      <p className="caption">REVIEWS</p>
      <h1>Pending reviews</h1>
      <p className="caption">
        Open the exact immutable submission. Author Drafts are never loaded
        here.
      </p>
      <ErrorNotice error={list.error} />
      {list.isPending && <p role="status">Loading reviews…</p>}
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Pending reviews"
      >
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Revision</th>
              <th>Owner</th>
              <th>Byline</th>
              <th>Submitted</th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((r) => (
              <tr key={r.revisionId}>
                <td>
                  <Link to={`/reviews/pending/${r.contentId}`}>{r.title}</Link>
                </td>
                <td>Revision {r.revisionNo}</td>
                <td>{name(r.owner)}</td>
                <td>{name(r.byline)}</td>
                <td>{date(r.submittedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!list.isPending && !list.items.length && (
        <p>No pending reviews available.</p>
      )}
      <LoadMore {...list} />
    </>
  );
}
