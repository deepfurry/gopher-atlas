import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import {
  ArrowUpRight,
  BookmarkSimple,
  Notebook,
  Stack,
  Tray,
  CloudArrowUp,
  Pulse,
} from '@phosphor-icons/react';
import { client, unwrap, ErrorNotice, type Schema } from '@/shared/api';
import { useMe } from '@/app/context';
import {
  PageHeader,
  LoadingState,
  EmptyState,
  Badge,
} from '@/components/ui/workspace';
import { CreateContent } from '@/components/admin/create-content';
import {
  date,
  states,
  types,
  productTypes,
  publicationStates,
} from '@/shared/status';
export default function Overview() {
  const me = useMe();
  const ready = useQuery({
    queryKey: ['readiness'],
    queryFn: async ({ signal }) =>
      unwrap(await client.GET('/readyz', { signal })),
    retry: false,
  });
  const content = useQuery({
    queryKey: ['content', 'overview'],
    queryFn: async ({ signal }) =>
      unwrap(await client.GET('/api/admin/v1/content', { signal })),
  });
  const reviews = useQuery({
    queryKey: ['reviews', 'overview'],
    enabled: me.permissions.review,
    queryFn: async ({ signal }) =>
      unwrap(
        await client.GET('/api/admin/v1/reviews', {
          signal,
          params: { query: { view: 'pending' } },
        }),
      ),
  });
  const publication = useQuery({
    queryKey: ['publication', 'status'],
    enabled: me.permissions.retryBuild,
    queryFn: async ({ signal }) =>
      unwrap(await client.GET('/api/admin/v1/publication/status', { signal })),
  });
  const items = (content.data?.items ?? []).filter(
      (item) => item.type !== 'post',
    ),
    pending = reviews.data?.items ?? [];
  const recent = [...items]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 6);
  const published = items.filter((item) => item.publishedRevisionId !== null);
  const list = (rows: Schema<'ContentSummary'>[], publication = false) =>
    rows.map((item) => (
      <Link className="work-row" key={item.id} to={`/content/${item.id}`}>
        <span className="work-type">{types[item.type]}</span>
        <div>
          <strong>{item.title || '未命名内容'}</strong>
          <span className="caption">
            {states[item.editorialState]} ·{' '}
            {date(
              publication
                ? (item.lastPublishedAt ?? item.updatedAt)
                : item.updatedAt,
            )}
          </span>
        </div>
        <ArrowUpRight />
      </Link>
    ));
  return (
    <>
      <PageHeader
        title="工作台"
        description={`${me.profile.displayName}，继续今天的编辑工作。`}
        actions={<CreateContent />}
      />
      <div className="workbench-summary">
        {productTypes
          .filter((type) => type !== 'topic' || me.permissions.createTopic)
          .map((type) => {
            const Icon = {
              curated_article: BookmarkSimple,
              topic: Stack,
              note: Notebook,
            }[type];
            const rows = items.filter((item) => item.type === type);
            return (
              <Link key={type} to={`/content?type=${type}`}>
                <Icon />
                <div>
                  <span>{types[type]}</span>
                  <strong>
                    {content.isPending ? '—' : rows.length}
                    {content.data?.nextCursor ? '+' : ''}
                  </strong>
                  <span className="caption">
                    {type === 'curated_article'
                      ? '发现值得反复阅读的原文'
                      : type === 'topic'
                        ? '组织导读与推荐阅读'
                        : '记录原创学习与实践'}
                  </span>
                </div>
              </Link>
            );
          })}
        {me.permissions.review && (
          <Link to="/reviews">
            <Tray />
            <div>
              <span>待审核</span>
              <strong>
                {reviews.isPending
                  ? '—'
                  : `${pending.length}${reviews.data?.nextCursor ? '+' : ''}`}
              </strong>
            </div>
          </Link>
        )}
      </div>
      <p className="caption summary-scope">
        内容摘要基于可访问内容的第一页；最近编辑按这些内容的更新时间排序。
      </p>
      <ErrorNotice error={content.error || reviews.error} />
      <div className="workbench-grid">
        <div>
          <section className="workbench-section">
            <div className="section-heading">
              <h2>最近编辑</h2>
              <Link to="/content?type=curated_article" className="caption">
                查看内容 →
              </Link>
            </div>
            {content.isPending ? (
              <LoadingState />
            ) : recent.length ? (
              list(recent)
            ) : (
              <EmptyState
                title="开始积累第一份内容"
                description="收录精选文章、编排话题专区，或写一篇学习随笔。"
              />
            )}
          </section>
          <section className="workbench-section">
            <div className="section-heading">
              <h2>最近发布</h2>
              <span className="caption">当前加载范围</span>
            </div>
            {published.length ? (
              list(
                [...published]
                  .sort(
                    (a, b) =>
                      (b.lastPublishedAt ?? 0) - (a.lastPublishedAt ?? 0),
                  )
                  .slice(0, 4),
                true,
              )
            ) : (
              <EmptyState
                title="尚无已发布内容"
                description="完成审核后，内容会在这里出现。"
              />
            )}
          </section>
        </div>
        <aside className="workbench-aside">
          {me.permissions.review && (
            <section className="workbench-section">
              <div className="section-heading">
                <h2>等待你的审核</h2>
                <Tray />
              </div>
              {pending.length ? (
                pending.slice(0, 4).map((r) => {
                  const item = r as Schema<'PendingReview'>;
                  return (
                    <Link
                      className="review-quick-row"
                      key={item.revisionId}
                      to={`/reviews/pending/${item.contentId}`}
                    >
                      <strong>{item.title || '未命名内容'}</strong>
                      <span className="caption">
                        版本 {item.revisionNo} · {date(item.submittedAt)}
                      </span>
                    </Link>
                  );
                })
              ) : (
                <p className="caption">目前没有待审核内容。</p>
              )}
              <Link className="text-action" to="/reviews">
                进入审核队列 <ArrowUpRight />
              </Link>
            </section>
          )}
          {me.permissions.retryBuild && (
            <section className="workbench-section">
              <div className="section-heading">
                <h2>发布状态</h2>
                <CloudArrowUp />
              </div>
              <ErrorNotice error={publication.error} />
              {publication.data ? (
                <>
                  <Badge
                    tone={
                      publication.data.computedState === 'live'
                        ? 'success'
                        : 'warning'
                    }
                  >
                    {publicationStates[publication.data.computedState]}
                  </Badge>
                  <p className="caption publication-mini">
                    CMS {publication.data.desiredGeneration} → 公开站点{' '}
                    {publication.data.publicMarker?.generation ?? '未知'}
                  </p>
                </>
              ) : (
                <p className="caption">正在读取发布状态…</p>
              )}
              <Link className="text-action" to="/publication">
                查看发布详情 <ArrowUpRight />
              </Link>
            </section>
          )}
          <section className="workbench-section">
            <div className="section-heading">
              <h2>服务状态</h2>
              <Pulse />
            </div>
            <Badge tone={ready.isSuccess ? 'success' : 'warning'}>
              {ready.isPending
                ? '正在检查'
                : ready.isSuccess
                  ? 'CMS 已就绪'
                  : 'CMS 暂未就绪'}
            </Badge>
            <ErrorNotice error={ready.error} />
            {me.permissions.viewMonitor && (
              <a className="text-action" href="/ops/monitor">
                运行监控 <ArrowUpRight />
              </a>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
