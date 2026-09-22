import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowClockwise,
  DotsThree,
  ShieldCheck,
  UserMinus,
  UserPlus,
} from '@phosphor-icons/react';
import {
  client,
  unwrap,
  ErrorNotice,
  NoAccess,
  type Schema,
} from '@/shared/api';
import { Button, IconButton } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { SearchInput } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { DropdownMenu, MenuItem } from '@/components/ui/menu';
import {
  PageHeader,
  FilterBar,
  Table,
  Avatar,
  Badge,
  LoadingState,
  EmptyState,
} from '@/components/ui/workspace';
import { useMe } from '@/app/context';
import { roles, statuses, date } from '@/shared/status';
import { useConfirm } from '@/shared/confirm';
import { toast } from 'sonner';
type User = Schema<'User'>;
function UserRow({ user, refresh }: { user: User; refresh: () => void }) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false),
    [role, setRole] = useState<User['role']>(
      user.status === 'pending' ? 'editor' : user.role,
    );
  const action = useMutation({
    mutationFn: async (kind: 'approve' | 'disable' | 'enable' | 'role') => {
      if (
        (kind === 'disable' || kind === 'role') &&
        !(await confirm({
          title: kind === 'disable' ? '停用此账户？' : '更新账户角色？',
          description:
            kind === 'disable'
              ? '停用后，该账户的全部会话将失效。系统会保护最后一位正常状态的管理员。'
              : `将 ${user.githubLogin} 的角色更新为${roles[role]}。`,
          confirm: '确认更改',
          danger: kind === 'disable',
        }))
      )
        return null;
      const params = { path: { id: user.id } };
      if (kind === 'role')
        return unwrap(
          await client.PUT('/api/admin/v1/users/{id}/role', {
            params,
            body: { role },
          }),
        );
      if (kind === 'approve') {
        if (role === 'admin') throw new Error('invalid_approval_role');
        return unwrap(
          await client.POST('/api/admin/v1/users/{id}/actions/approve', {
            params,
            body: { role },
          }),
        );
      }
      return unwrap(
        await client.POST(
          kind === 'disable'
            ? '/api/admin/v1/users/{id}/actions/disable'
            : '/api/admin/v1/users/{id}/actions/enable',
          { params },
        ),
      );
    },
    onSuccess: (result) => {
      if (result) {
        setEditing(false);
        refresh();
        toast.success('用户访问权限已更新。');
      }
    },
  });
  return (
    <tr>
      <td>
        <div className="person">
          <Avatar name={user.githubLogin} />
          <div>
            <strong>{user.githubLogin}</strong>
            <span className="caption">GitHub ID {user.githubUserId}</span>
          </div>
        </div>
      </td>
      <td>
        <Badge>{roles[user.role]}</Badge>
      </td>
      <td>
        <Badge
          tone={
            user.status === 'active'
              ? 'success'
              : user.status === 'pending'
                ? 'warning'
                : 'neutral'
          }
        >
          {statuses[user.status]}
        </Badge>
      </td>
      <td>{user.lastLoginAt ? date(user.lastLoginAt) : '尚未登录'}</td>
      <td>
        <div className="toolbar">
          {user.status === 'pending' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing(true)}
            >
              审批账户
            </Button>
          )}
          <DropdownMenu
            trigger={
              <IconButton label={`${user.githubLogin} 的操作`}>
                <DotsThree />
              </IconButton>
            }
          >
            {user.status !== 'pending' && (
              <MenuItem onClick={() => setEditing(true)}>
                <ShieldCheck />
                变更角色
              </MenuItem>
            )}
            <MenuItem
              danger={user.status !== 'disabled'}
              disabled={action.isPending}
              onClick={() =>
                action.mutate(user.status === 'disabled' ? 'enable' : 'disable')
              }
            >
              {user.status === 'disabled' ? <UserPlus /> : <UserMinus />}
              {user.status === 'disabled' ? '启用账户' : '停用账户'}
            </MenuItem>
          </DropdownMenu>
        </div>
        <ErrorNotice error={action.error} />
        <Dialog
          open={editing}
          onOpenChange={setEditing}
          title={user.status === 'pending' ? '审批账户' : '变更角色'}
          description={`GitHub：${user.githubLogin}`}
          busy={action.isPending}
          footer={
            <>
              <Button
                variant="outline"
                disabled={action.isPending}
                onClick={() => setEditing(false)}
              >
                取消
              </Button>
              <Button
                disabled={action.isPending}
                onClick={() =>
                  action.mutate(user.status === 'pending' ? 'approve' : 'role')
                }
              >
                {user.status === 'pending' ? '批准账户' : '更新角色'}
              </Button>
            </>
          }
        >
          <label>
            账户角色
            <Select
              label={`${user.githubLogin} 的角色`}
              value={role}
              onValueChange={(v) => setRole(v as User['role'])}
              options={Object.entries(roles)
                .filter(
                  ([value]) => user.status !== 'pending' || value !== 'admin',
                )
                .map(([value, label]) => ({ value, label }))}
            />
          </label>
          <p className="caption">角色控制可用功能，最终权限由服务器验证。</p>
          <ErrorNotice error={action.error} />
        </Dialog>
      </td>
    </tr>
  );
}
export default function Users() {
  const me = useMe(),
    cache = useQueryClient();
  const [after, setAfter] = useState(0),
    [cursors, setCursors] = useState<number[]>([]),
    [search, setSearch] = useState(''),
    [status, setStatus] = useState('');
  const users = useQuery({
    queryKey: ['users', after],
    enabled: me.permissions.manageUsers,
    queryFn: async ({ signal }) =>
      unwrap(
        await client.GET('/api/admin/v1/users', {
          signal,
          params: { query: { after } },
        }),
      ),
    retry: false,
  });
  if (!me.permissions.manageUsers) return <NoAccess />;
  const refresh = () => {
    void cache.invalidateQueries({ queryKey: ['users'] });
    void cache.invalidateQueries({ queryKey: ['me'] });
  };
  const items = (users.data?.users ?? []).filter(
    (user) =>
      (!status || user.status === status) &&
      user.githubLogin.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeader
        title="用户管理"
        description="审批新账户、管理角色与访问状态。"
        actions={
          <Button variant="outline" onClick={refresh}>
            <ArrowClockwise />
            刷新用户
          </Button>
        }
      />
      <FilterBar>
        <SearchInput
          aria-label="搜索本页用户"
          placeholder="搜索本页 GitHub 用户…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          label="用户状态（本页）"
          value={status}
          onValueChange={setStatus}
          options={[
            { value: '', label: '全部状态 · 本页' },
            ...Object.entries(statuses).map(([value, label]) => ({
              value,
              label,
            })),
          ]}
        />
      </FilterBar>
      <ErrorNotice error={users.error} />
      {users.isPending ? (
        <LoadingState label="正在读取用户…" />
      ) : !items.length ? (
        <EmptyState title="本页没有匹配的用户" />
      ) : (
        <Table label="用户列表">
          <thead>
            <tr>
              <th>GitHub 用户</th>
              <th>角色</th>
              <th>状态</th>
              <th>最近登录</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((user) => (
              <UserRow
                key={`${user.id}-${user.role}-${user.status}`}
                user={user}
                refresh={refresh}
              />
            ))}
          </tbody>
        </Table>
      )}
      <div className="pagination">
        <span>
          第 {cursors.length + 1} 页 · 显示 {items.length} 位用户
        </span>
        <div className="toolbar">
          <Button
            variant="outline"
            disabled={!cursors.length}
            onClick={() => {
              setAfter(cursors.at(-1)!);
              setCursors(cursors.slice(0, -1));
            }}
          >
            上一页
          </Button>
          <Button
            variant="outline"
            disabled={users.data?.nextCursor == null}
            onClick={() => {
              setCursors([...cursors, after]);
              setAfter(users.data!.nextCursor!);
            }}
          >
            下一页
          </Button>
        </div>
      </div>
    </>
  );
}
