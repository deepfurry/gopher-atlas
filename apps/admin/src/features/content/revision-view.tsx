import { AssetImage } from '@/features/assets/browser';
import type { Schema } from '@/shared/api';
import { date, name, types, decisions, payloadLabels } from '@/shared/status';
import { MarkdownPreview } from '@/shared/markdown';
import { routePreview } from './api';
export function RevisionView({
  revision,
  type,
}: {
  revision: Schema<'Revision'>;
  type: Schema<'ContentType'>;
}) {
  return (
    <article className="revision-view">
      <div className="section-heading">
        <h2>
          版本 {revision.revisionNo} · {revision.title}
        </h2>
        <div className="status-group">
          <span className="badge">固定版本</span>
          {revision.pending && <span className="badge">待审核</span>}
          {revision.published && (
            <span className="badge published">已在 CMS 发布</span>
          )}
          {revision.review && (
            <span className="badge">{decisions[revision.review.decision]}</span>
          )}
        </div>
      </div>
      <p className="caption">
        {types[type]} · 署名：{name(revision.byline)} · 创建者：{' '}
        {name(revision.creator)} · {date(revision.createdAt)}
      </p>
      <output className="route-preview">
        {routePreview(type, revision.slug, revision.payload)}
      </output>
      <div className="revision-layout">
        <MarkdownPreview source={revision.bodyMarkdown} />
        <aside className="metadata-rail">
          <h3>版本属性</h3>
          {revision.coverAsset && <AssetImage asset={revision.coverAsset} />}
          <dl>
            <dt>摘要</dt>
            <dd>{revision.summary || '—'}</dd>
            <dt>语言</dt>
            <dd>{revision.language}</dd>
            <dt>重点推荐</dt>
            <dd>{revision.featured ? '是' : '否'}</dd>
            <dt>搜索标题</dt>
            <dd>{revision.seoTitle || '—'}</dd>
            <dt>搜索描述</dt>
            <dd>{revision.seoDescription || '—'}</dd>
            {Object.entries(revision.payload)
              .filter(([key]) => key !== 'relatedLinks')
              .map(([key, value]) => (
                <div key={key}>
                  <dt>{payloadLabels[key] ?? key}</dt>
                  <dd>
                    {typeof value === 'boolean'
                      ? value
                        ? '是'
                        : '否'
                      : String(value)}
                  </dd>
                </div>
              ))}
          </dl>
          {'relatedLinks' in revision.payload &&
            revision.payload.relatedLinks?.map((link, index) => (
              <p key={index}>
                {link.label}: <span className="break-anywhere">{link.url}</span>
              </p>
            ))}
          {revision.tags.length > 0 && (
            <>
              <h3>标签</h3>
              <p>{revision.tags.map((tag) => tag.name).join(', ')}</p>
            </>
          )}
          {type === 'topic' && (
            <>
              <h3>专题条目</h3>
              <ol>
                {revision.topicTargets.map((target) => (
                  <li key={target.id}>
                    {target.title || `内容 #${target.id}`}
                    {(!target.published || target.archived) && (
                      <p className="caption">条目未发布，专题暂时无法发布</p>
                    )}
                  </li>
                ))}
              </ol>
            </>
          )}
        </aside>
      </div>
      {revision.review?.commentMarkdown && (
        <section className="review-feedback">
          <h3>审核意见</h3>
          <MarkdownPreview source={revision.review.commentMarkdown} />
        </section>
      )}
    </article>
  );
}
