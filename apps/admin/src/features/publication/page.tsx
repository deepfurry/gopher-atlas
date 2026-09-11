import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowClockwise,
  ArrowRight,
  CheckCircle,
  Clock,
  WarningCircle,
  Info,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
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
import { date, jobStates, publicationStates } from '@/shared/status';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/dialog';
import {
  PageHeader,
  Badge,
  Table,
  LoadingState,
  EmptyState,
} from '@/components/ui/workspace';
function JobDetails({ job }: { job: Schema<'PublicationJob'> }) {
  return (
    <dl className="technical-details">
      {[
        ['发布版本', job.generation],
        ['任务状态', jobStates[job.state]],
        ['快照路径', job.snapshotKey],
        ['SHA-256', job.snapshotSha256],
        ['尝试次数', job.attempts],
        ['错误分类', job.lastError],
        ['下次重试', job.nextAttemptAt ? date(job.nextAttemptAt) : null],
        ['请求构建时间', job.triggeredAt ? date(job.triggeredAt) : null],
        ['创建时间', date(job.createdAt)],
        ['更新时间', date(job.updatedAt)],
      ].map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value === '' || value == null ? '—' : value}</dd>
        </div>
      ))}
    </dl>
  );
}
export default function Publication() {
  const me = useMe(),
    cache = useQueryClient(),
    enabled = me.permissions.retryBuild;
  const [detail, setDetail] = useState<Schema<'PublicationJob'> | null>(null);
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
    onSuccess: async () => {
      await refresh();
      toast.success('已安排重试发布。');
    },
  });
  if (!enabled) return <NoAccess />;
  const data = status.data;
  const problem =
    data?.latestJob?.state === 'failed' || data?.computedState === 'behind';
  const StatusIcon =
    data?.computedState === 'live'
      ? CheckCircle
      : problem
        ? WarningCircle
        : Clock;
  return (
    <>
      <PageHeader
        title="发布状态"
        description="查看 CMS 内容版本与公开站点的实际同步进度。"
        actions={
          <Button variant="outline" onClick={() => void refresh()}>
            <ArrowClockwise />
            刷新状态
          </Button>
        }
      />
      <ErrorNotice error={status.error || jobs.error || retry.error} />
      {status.isPending && <LoadingState label="正在检查发布状态…" />}
      {data && (
        <section className="publication-hero">
          <div className="publication-hero-heading">
            <StatusIcon />
            <div>
              <h2>
                {problem
                  ? '发布需要关注'
                  : publicationStates[data.computedState]}
              </h2>
              <p className="caption">
                {data.computedState === 'live'
                  ? '公开站点已构建当前 CMS 发布版本。'
                  : data.computedState === 'behind'
                    ? '公开站点版本高于 CMS，请核对当前环境与数据库。'
                    : data.computedState === 'unknown'
                      ? '暂时无法读取有效的公开站点构建标记。'
                      : '内容已在 CMS 发布，等待公开站点完成构建。'}
              </p>
            </div>
          </div>
          <div className="publication-generations">
            <div>
              <span className="caption">CMS 发布版本</span>
              <strong>{data.desiredGeneration}</strong>
            </div>
            <ArrowRight />
            <div>
              <span className="caption">公开站点版本</span>
              <strong>{data.publicMarker?.generation ?? '—'}</strong>
            </div>
            <div>
              <span className="caption">公开站点最近构建</span>
              <span>
                {data.publicMarker
                  ? new Date(data.publicMarker.builtAt).toLocaleString('zh-CN')
                  : '暂无法确认'}
              </span>
              <Badge
                tone={data.latestJob?.state === 'failed' ? 'danger' : 'neutral'}
              >
                {data.latestJob
                  ? jobStates[data.latestJob.state]
                  : '暂无发布任务'}
              </Badge>
            </div>
          </div>
          {!data.pipelineConfigured && (
            <p className="caption publication-mini">
              当前环境未启用发布流水线；CMS 的发布操作仍会进入队列。
            </p>
          )}
        </section>
      )}
      <div className="section-heading">
        <h2>发布记录</h2>
        <span className="caption">
          构建请求已受理，不代表公开站点已完成更新。
        </span>
      </div>
      {jobs.isPending ? (
        <LoadingState />
      ) : !jobs.items.length ? (
        <EmptyState
          title="暂无发布记录"
          description="内容发布后，会自动创建发布任务。"
        />
      ) : (
        <Table label="发布任务">
          <thead>
            <tr>
              <th>发布版本</th>
              <th>任务状态</th>
              <th>创建时间</th>
              <th>请求构建</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {jobs.items.map((job) => (
              <tr key={job.id}>
                <td>
                  <strong>版本 {job.generation}</strong>
                </td>
                <td>
                  <Badge
                    tone={
                      job.state === 'failed'
                        ? 'danger'
                        : job.state === 'build_triggered'
                          ? 'info'
                          : 'neutral'
                    }
                  >
                    {jobStates[job.state]}
                  </Badge>
                </td>
                <td>{date(job.createdAt)}</td>
                <td>{job.triggeredAt ? date(job.triggeredAt) : '尚未请求'}</td>
                <td>
                  <div className="toolbar">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDetail(job)}
                    >
                      <Info />
                      详细信息
                    </Button>
                    {job.retry && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={retry.isPending}
                        onClick={() => retry.mutate(job.id)}
                        aria-label={`重试发布版本 ${job.generation}`}
                      >
                        <ArrowClockwise />
                        重试发布
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <div className="pagination">
        <span>已加载 {jobs.items.length} 条</span>
        <LoadMore {...jobs} />
      </div>
      <Sheet
        open={!!detail}
        onOpenChange={(open) => !open && setDetail(null)}
        title={`发布版本 ${detail?.generation ?? ''}`}
        description="任务技术详情，仅展示安全元数据。"
      >
        {detail && <JobDetails job={detail} />}
      </Sheet>
    </>
  );
}
