import type { Schema } from './api';
import { Badge } from '@/components/ui/workspace';
export const roles = { admin: '管理员', reviewer: '审核员', editor: '编辑' };
export const statuses = {
  pending: '待审批',
  active: '正常',
  disabled: '已停用',
};
export const types = {
  post: '文章',
  note: '笔记',
  curated_article: '精选',
  topic: '专题',
};
export const states = {
  draft: '草稿',
  in_review: '审核中',
  changes_requested: '需要修改',
  synced: '已定稿',
};
export const decisions = {
  approved: '审核通过',
  changes_requested: '需要修改',
};
export const jobStates = {
  pending: '等待处理',
  snapshot_uploaded: '快照已就绪',
  build_triggered: '已请求构建',
  failed: '处理失败',
  superseded: '已被新版替代',
};
export const publicationStates = {
  live: '已同步',
  pending: '等待发布',
  behind: 'CMS 版本落后',
  unknown: '暂无法确认',
};
export const payloadLabels: Record<string, string> = {
  group: '分组',
  groupSlug: '分组路径标识',
  order: '排序',
  sourceUrl: '来源 URL',
  originalUrl: '原文 URL',
  sourceAuthor: '原作者',
  sourceName: '来源名称',
  sourcePublishedAt: '原文发布日期',
  sourceLanguage: '原文语言',
  difficulty: '难度',
  rating: '评分',
  mustRead: '必读',
  relatedLinks: '相关链接',
};
export const auditActions: Record<string, string> = {
  'auth.login': '登录',
  'user.approved': '审批用户',
  'user.role_changed': '变更角色',
  'user.disabled': '停用用户',
  'user.enabled': '启用用户',
  'author.profile_updated': '更新作者资料',
  'content.created': '创建内容',
  'content.submitted': '提交审核',
  'content.review_withdrawn': '撤回审核',
  'content.changes_requested': '要求修改',
  'content.published': '审核发布',
  'content.published_direct': '直接发布',
  'content.unpublished': '取消发布',
  'content.archived': '归档内容',
  'content.archive_restored': '恢复归档',
  'content.revision_restored': '恢复历史版本',
  'tag.created': '创建标签',
  'tag.updated': '更新标签',
  'asset.uploaded': '上传素材',
  'asset.deleted': '删除素材',
  'asset.restored': '恢复素材',
  'publication.retry_requested': '重试发布',
};
export const entityTypes: Record<string, string> = {
  user: '用户',
  author: '作者',
  content: '内容',
  tag: '标签',
  asset: '素材',
  publication: '发布',
};
export function date(value: number) {
  return new Date(value).toLocaleString('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
export function name(author?: Schema<'AuthorSummary'>) {
  return author?.displayName || author?.slug || '未公开的作者';
}
export function EditorialBadge({ state }: { state: Schema<'EditorialState'> }) {
  return (
    <Badge
      tone={
        state === 'in_review'
          ? 'info'
          : state === 'changes_requested'
            ? 'warning'
            : 'neutral'
      }
    >
      {states[state]}
    </Badge>
  );
}
export function PublishedBadge({
  id,
  no,
}: {
  id: number | null;
  no?: number | null;
}) {
  return (
    <Badge tone={id ? 'success' : 'neutral'}>
      {id ? `已在 CMS 发布 · v${no ?? '—'}` : '未发布'}
    </Badge>
  );
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
      <EditorialBadge state={content.editorialState} />
      <PublishedBadge
        id={content.publishedRevisionId}
        no={content.publishedRevisionNo}
      />
      {content.archivedAt !== null && <Badge>已归档</Badge>}
    </span>
  );
}
