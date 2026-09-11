import type { Schema } from '@/shared/api';
import { date, name, types } from '@/shared/status';
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
          Revision {revision.revisionNo} · {revision.title}
        </h2>
        <div className="status-group">
          <span className="badge">Immutable</span>
          {revision.pending && <span className="badge">Pending</span>}
          {revision.published && (
            <span className="badge published">Published in CMS</span>
          )}
          {revision.review && (
            <span className="badge">{revision.review.decision}</span>
          )}
        </div>
      </div>
      <p className="caption">
        {types[type]} · By {name(revision.byline)} · Created by{' '}
        {name(revision.creator)} · {date(revision.createdAt)}
      </p>
      <output className="route-preview">
        {routePreview(type, revision.slug, revision.payload)}
      </output>
      <div className="revision-layout">
        <MarkdownPreview source={revision.bodyMarkdown} />
        <aside className="metadata-rail">
          <h3>Snapshot metadata</h3>
          <dl>
            <dt>Summary</dt>
            <dd>{revision.summary || '—'}</dd>
            <dt>Language</dt>
            <dd>{revision.language}</dd>
            <dt>Featured</dt>
            <dd>{revision.featured ? 'Yes' : 'No'}</dd>
            <dt>SEO title</dt>
            <dd>{revision.seoTitle || '—'}</dd>
            <dt>SEO description</dt>
            <dd>{revision.seoDescription || '—'}</dd>
            {Object.entries(revision.payload)
              .filter(([key]) => key !== 'relatedLinks')
              .map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{String(value)}</dd>
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
              <h3>Tags</h3>
              <p>{revision.tags.map((tag) => tag.name).join(', ')}</p>
            </>
          )}
          {type === 'topic' && (
            <>
              <h3>Ordered entries</h3>
              <ol>
                {revision.topicTargets.map((target) => (
                  <li key={target.id}>
                    {target.title || `Content #${target.id}`}
                    {(!target.published || target.archived) && (
                      <p className="caption">
                        Unpublished — Topic cannot be published yet
                      </p>
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
          <h3>Review feedback</h3>
          <MarkdownPreview source={revision.review.commentMarkdown} />
        </section>
      )}
    </article>
  );
}
