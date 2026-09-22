import { useState } from 'react';
import { Info } from '@phosphor-icons/react';
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
import {
  date,
  name,
  auditActions,
  entityTypes,
  roles,
  statuses,
} from '@/shared/status';
import {
  PageHeader,
  FilterBar,
  Table,
  LoadingState,
  EmptyState,
  Badge,
  Avatar,
} from '@/components/ui/workspace';
import { Select } from '@/components/ui/select';
import { SearchInput } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/dialog';
export default function Audit() {
  const me = useMe();
  const [action, setAction] = useState(''),
    [entity, setEntity] = useState(''),
    [search, setSearch] = useState(''),
    [detail, setDetail] = useState<Schema<'AuditEvent'> | null>(null);
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
  const items = list.items.filter(
    (event) =>
      (!action || event.action === action) &&
      (!entity || event.entityType === entity) &&
      (!search ||
        `${name(event.actor)} ${event.requestId} ${event.entityId}`
          .toLowerCase()
          .includes(search.toLowerCase())),
  );
  return (
    <>
      <PageHeader
        title="操作审计"
        description="记录已成功提交的重要操作。草稿自动保存不生成审计记录。"
      />
      <FilterBar>
        <SearchInput
          aria-label="搜索已加载审计"
          placeholder="搜索操作者、实体 ID 或请求 ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          label="审计动作"
          value={action}
          onValueChange={setAction}
          options={[
            { value: '', label: '全部动作' },
            ...Object.entries(auditActions).map(([value, label]) => ({
              value,
              label,
            })),
          ]}
        />
        <Select
          label="实体类型"
          value={entity}
          onValueChange={setEntity}
          options={[
            { value: '', label: '全部实体' },
            ...Object.entries(entityTypes).map(([value, label]) => ({
              value,
              label,
            })),
          ]}
        />
      </FilterBar>
      <p className="caption">筛选范围为已加载记录，可继续加载更多记录。</p>
      <ErrorNotice error={list.error} />
      {list.isPending ? (
        <LoadingState label="正在加载审计…" />
      ) : !items.length ? (
        <EmptyState title="没有匹配的审计记录" />
      ) : (
        <Table label="审计日志">
          <thead>
            <tr>
              <th>时间</th>
              <th>操作者</th>
              <th>动作</th>
              <th>实体</th>
              <th>结果</th>
              <th>详情</th>
            </tr>
          </thead>
          <tbody>
            {items.map((event) => (
              <tr key={event.id}>
                <td>{date(event.createdAt)}</td>
                <td>
                  <div className="person">
                    <Avatar name={name(event.actor)} />
                    <span>{name(event.actor)}</span>
                  </div>
                </td>
                <td>{auditActions[event.action] ?? event.action}</td>
                <td>
                  {entityTypes[event.entityType] ?? event.entityType} #
                  {event.entityId}
                </td>
                <td>
                  <Badge tone="success">已完成</Badge>
                </td>
                <td>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`查看审计 ${event.id}`}
                    onClick={() => setDetail(event)}
                  >
                    <Info />
                    详情
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <div className="pagination">
        <span>
          已加载 {list.items.length} 条，当前显示 {items.length} 条
        </span>
        <LoadMore {...list} />
      </div>
      <Sheet
        open={!!detail}
        onOpenChange={(open) => !open && setDetail(null)}
        title="审计详情"
        description={
          detail ? (auditActions[detail.action] ?? detail.action) : ''
        }
      >
        {detail && (
          <dl className="technical-details">
            <div>
              <dt>时间</dt>
              <dd>{date(detail.createdAt)}</dd>
            </div>
            <div>
              <dt>操作者</dt>
              <dd>{name(detail.actor)}</dd>
            </div>
            <div>
              <dt>实体</dt>
              <dd>
                {entityTypes[detail.entityType]} #{detail.entityId}
              </dd>
            </div>
            <div>
              <dt>版本 ID</dt>
              <dd>{detail.revisionId ?? '—'}</dd>
            </div>
            <div>
              <dt>请求 ID</dt>
              <dd>{detail.requestId || '—'}</dd>
            </div>
            <div>
              <dt>动作代码</dt>
              <dd>
                <code>{detail.action}</code>
              </dd>
            </div>
            {detail.metadata.role && (
              <div>
                <dt>角色</dt>
                <dd>
                  {roles[detail.metadata.role as keyof typeof roles] ??
                    detail.metadata.role}
                </dd>
              </div>
            )}
            {detail.metadata.status && (
              <div>
                <dt>状态</dt>
                <dd>
                  {statuses[detail.metadata.status as keyof typeof statuses] ??
                    detail.metadata.status}
                </dd>
              </div>
            )}
          </dl>
        )}
      </Sheet>
    </>
  );
}
