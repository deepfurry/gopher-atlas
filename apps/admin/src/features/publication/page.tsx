import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMe } from '@/app/context';
import { client, unwrap, ErrorNotice, NoAccess } from '@/shared/api';
import { usePages } from '@/shared/query';
import { LoadMore } from '@/shared/pagination';
import { date } from '@/shared/status';
import { Button } from '@/components/ui/button';

export default function Publication() {
  const me = useMe(),
    cache = useQueryClient();
  const enabled = me.permissions.retryBuild;
  const status = useQuery({
    queryKey: ['publication', 'status'],
    enabled,
    queryFn: async ({ signal }) =>
      unwrap(await client.GET('/api/admin/v1/publication/status', { signal })),
    retry: false,
    refetchInterval: 15000,
  });
  const jobs = usePages(
    ['publication', 'jobs'],
    async (after, signal) =>
      unwrap(
        await client.GET('/api/admin/v1/publication/jobs', {
          signal,
          params: { query: { after } },
        }),
      ),
    enabled,
  );
  const refresh = async () => {
    await cache.invalidateQueries({ queryKey: ['publication'] });
    await cache.invalidateQueries({ queryKey: ['audit'] });
  };
  const retry = useMutation({
    mutationFn: async (id: number) =>
      unwrap(
        await client.POST('/api/admin/v1/publication/jobs/{id}/actions/retry', {
          params: { path: { id } },
        }),
      ),
    onSuccess: refresh,
  });
  if (!enabled) return <NoAccess />;
  return (
    <>
      <div className="page-heading">
        <h1>Publication</h1>
        <Button variant="outline" onClick={() => void refresh()}>
          Refresh publication
        </Button>
      </div>
      <p className="caption">
        Published in CMS records the selected Revision. The public build marker
        independently reports what the public site built.
      </p>
      <ErrorNotice error={status.error || jobs.error || retry.error} />
      {status.data && (
        <dl className="publication-status">
          <dt>Desired generation</dt>
          <dd>{status.data.desiredGeneration}</dd>
          <dt>Public marker generation</dt>
          <dd>{status.data.publicMarker?.generation ?? 'Unknown'}</dd>
          <dt>Computed status</dt>
          <dd>{status.data.computedState}</dd>
          <dt>Worker</dt>
          <dd>
            {status.data.pipelineConfigured
              ? 'Configured'
              : 'Disabled / not configured — mutations still queue jobs'}
          </dd>
          <dt>Latest job</dt>
          <dd>{status.data.latestJob?.state ?? 'No jobs'}</dd>
        </dl>
      )}
      <p className="caption">
        live: generations match · pending: public marker is older · behind: CMS
        is behind the public marker · unknown: marker unavailable or invalid.
        Hook acceptance does not prove build completion.
      </p>
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Publication jobs"
      >
        <table>
          <thead>
            <tr>
              {[
                'Generation',
                'State',
                'Snapshot / SHA-256',
                'Attempts / safe error',
                'Next retry',
                'Triggered',
                'Action',
              ].map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jobs.items.map((job) => (
              <tr key={job.id}>
                <td>{job.generation}</td>
                <td>{job.state}</td>
                <td className="break-anywhere">
                  {job.snapshotKey ?? '—'}
                  <br />
                  <code>{job.snapshotSha256 ?? '—'}</code>
                </td>
                <td>
                  {job.attempts}
                  <br />
                  {job.lastError || '—'}
                </td>
                <td>{job.nextAttemptAt ? date(job.nextAttemptAt) : '—'}</td>
                <td>{job.triggeredAt ? date(job.triggeredAt) : '—'}</td>
                <td>
                  {job.retry && (
                    <Button
                      variant="outline"
                      disabled={retry.isPending}
                      onClick={() => retry.mutate(job.id)}
                    >
                      Retry generation {job.generation}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!jobs.items.length && !jobs.isPending && <p>No publication jobs yet.</p>}
      <LoadMore {...jobs} />
    </>
  );
}
