import type { Schema } from './api';
export const roles = { admin: '管理员', reviewer: '审核员', editor: '编者' };
export const statuses = {
  pending: '待审批',
  active: '已启用',
  disabled: '已停用',
};
export const types = {
  post: 'Post',
  note: 'Note',
  curated_article: 'Curated Article',
  topic: 'Topic',
};
export const states = {
  draft: 'Draft',
  in_review: 'In review',
  changes_requested: 'Changes requested',
  synced: 'Synced',
};
export function date(value: number) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
export function name(author?: Schema<'AuthorSummary'>) {
  return author?.displayName || author?.slug || '未公开的作者';
}
export function ContentStatus({
  content,
}: {
  content: Pick<
    Schema<'ContentSummary'>,
    | 'editorialState'
    | 'publishedRevisionId'
    | 'publishedRevisionNo'
    | 'archivedAt'
  >;
}) {
  return (
    <span className="status-group">
      <span className={`badge state-${content.editorialState}`}>
        {states[content.editorialState]}
      </span>
      <span
        className={content.publishedRevisionId ? 'badge published' : 'badge'}
      >
        {content.publishedRevisionId
          ? `Published in CMS · Revision ${content.publishedRevisionNo ?? '—'}`
          : 'Not published in CMS'}
      </span>
      {content.archivedAt && <span className="badge">Archived</span>}
    </span>
  );
}
