import { createCMSClient, type components } from '@gopheratlas/api-client';
export type Schema<K extends keyof components['schemas']> =
  components['schemas'][K];
export const client = createCMSClient();
export class APIError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function unwrap<T>(
  result: { data?: T; error?: Schema<'ErrorResponse'> },
  authEvent = true,
): T {
  if (result.error) {
    const { code, message } = result.error.error;
    if (
      authEvent &&
      (code === 'authentication_required' || code === 'account_disabled')
    )
      window.dispatchEvent(new Event('cms-auth-expired'));
    throw new APIError(code, message);
  }
  if (result.data === undefined) throw new Error('CMS unavailable');
  return result.data;
}
const messages: Record<string, string> = {
  asset_invalid: '图片无效，请选择有效的 PNG/JPEG/WebP/GIF。',
  asset_too_large: '图片不得超过 10 MiB。',
  asset_format_unsupported: '仅支持 PNG/JPEG/WebP/GIF，不支持 SVG。',
  asset_dimension_invalid: '图片尺寸超过 16384 px 或 100M 像素限制。',
  asset_deleted: '图片已被停用，请更换封面或由管理员恢复图片。',
  storage_unavailable: '对象存储暂不可用，请稍后重试。',
  storage_integrity_error: '不可变对象完整性检查失败。',
  publication_not_configured: '尚未配置 R2 与发布流水线。',
  publication_job_conflict: '发布任务正在处理或状态已改变，请刷新。',
  publication_retry_forbidden: '仅可重试当前发布版本的失败任务。',

  last_admin_required: '必须保留至少一位已启用的管理员。请先授权另一位管理员。',
  account_disabled: '账户已停用，请联系管理员。',
  account_pending: '账户正在等待管理员审批。',
  permission_denied: '当前账户没有执行此操作的权限。',
  authentication_required: '登录已过期，请重新登录。',
  csrf_invalid: '会话验证失败。请先复制未保存的内容，再刷新页面或重新登录。',
  validation_failed: '请检查必填字段、格式及长度。',
  dependency_unavailable: 'CMS 持久层暂未就绪，请稍后重试。',
  content_version_conflict:
    '另一会话已修改此草稿。自动保存已暂停，本地内容仍保留。',
  invalid_editorial_state: '状态已变化，请重新读取当前版本后操作。',
  route_conflict: '此路径已被其他内容永久保留，请修改路径标识。',
  review_revision_conflict: '待审版本已变化，请刷新审核队列。',
  self_review_forbidden: '不能审核自己拥有或署名的内容。',
  content_archived: '内容已归档，请先恢复归档。',
  content_not_published: '此内容尚未在 CMS 发布。',
  invalid_markdown: 'Markdown 不符合安全规则或超过长度限制，请查看正文提示。',
  invalid_payload: '请检查此类型的属性格式及长度。',
  tag_conflict: '标签名称或路径标识已存在。',
  topic_target_unpublished: '专题的所有条目必须已在 CMS 发布且未归档。',
  payload_too_large: '请求过大，正文最多 512 KiB。',
  not_found: '内容不存在或当前无法访问。',
};
export function message(error: unknown): string {
  return error instanceof APIError
    ? (messages[error.code] ?? '请求未完成，请稍后重试。')
    : '无法完成请求，请检查连接或表单内容后重试。';
}
export function ErrorNotice({ error }: { error: unknown }) {
  return error ? (
    <p className="error-message" role="alert">
      {message(error)}
    </p>
  ) : null;
}
export function NoAccess() {
  return <p role="alert">当前账户没有执行此操作的权限。</p>;
}
