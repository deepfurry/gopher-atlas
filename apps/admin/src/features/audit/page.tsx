import { useMe } from '@/app/context';
import { client, unwrap, ErrorNotice, NoAccess } from '@/shared/api';
import { usePages } from '@/shared/query';
import { LoadMore } from '@/shared/pagination';
import { date, name } from '@/shared/status';
export default function Audit() {
  const me = useMe();
  const list = usePages(
    ['audit'],
    async (after, signal) =>
      unwrap(
        await client.GET('/api/admin/v1/audit', {
          signal,
          params: { query: { after } },
        }),
      ),
    me.permissions.viewAudit,
  );
  if (!me.permissions.viewAudit) return <NoAccess />;
  return (
    <>
      <p className="caption">OPERATIONS</p>
      <h1>Audit</h1>
      <p className="caption">
        Significant transactional events. Draft saves are not audited.
      </p>
      <ErrorNotice error={list.error} />
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Audit events"
      >
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Revision</th>
              <th>Request ID</th>
              <th>Safe metadata</th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((event) => (
              <tr key={event.id}>
                <td>{date(event.createdAt)}</td>
                <td>{name(event.actor)}</td>
                <td>{event.action}</td>
                <td>
                  {event.entityType} #{event.entityId}
                </td>
                <td>{event.revisionId ?? '—'}</td>
                <td className="break-anywhere">{event.requestId || '—'}</td>
                <td>
                  {event.metadata.role && (
                    <span>role: {event.metadata.role} </span>
                  )}
                  {event.metadata.status && (
                    <span>status: {event.metadata.status}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!list.items.length && !list.isPending && <p>No audit events.</p>}
      <LoadMore {...list} />
    </>
  );
}
