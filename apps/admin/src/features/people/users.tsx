import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { client, unwrap, ErrorNotice, type Schema } from '@/shared/api';
import { Button } from '@/components/ui/button';
import { useMe } from '@/app/context';
import { roles, statuses } from '@/shared/status';
import { useConfirm } from '@/shared/confirm';
import { toast } from 'sonner';
type User = Schema<'User'>;
function UserRow({ user, refresh }: { user: User; refresh: () => void }) {
  const confirm = useConfirm();
  const [role, setRole] = useState<User['role']>(
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
              ? '将撤销该账户的全部会话。服务器会保护最后一位 active Admin。'
              : `将 ${user.githubLogin} 的角色更新为 ${roles[role]}。服务器会重新验证权限。`,
          confirm: '确认更改',
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
        if (role === 'admin')
          throw new Error('Approval requires editor or reviewer');
        return unwrap(
          await client.POST('/api/admin/v1/users/{id}/actions/approve', {
            params,
            body: { role },
          }),
        );
      }
      if (kind === 'disable')
        return unwrap(
          await client.POST('/api/admin/v1/users/{id}/actions/disable', {
            params,
          }),
        );
      return unwrap(
        await client.POST('/api/admin/v1/users/{id}/actions/enable', {
          params,
        }),
      );
    },
    onSuccess: (result) => {
      if (result) {
        refresh();
        toast.success('用户访问权限已更新。');
      }
    },
  });
  return (
    <tr>
      <th scope="row">
        <span>{user.githubLogin}</span>
        <span className="caption user-id">GitHub ID {user.githubUserId}</span>
      </th>
      <td>{statuses[user.status]}</td>
      <td>{roles[user.role]}</td>
      <td>
        <div className="user-actions">
          <select
            aria-label={`${user.githubLogin} 的角色`}
            value={role}
            onChange={(event) => setRole(event.target.value as User['role'])}
            disabled={action.isPending}
          >
            <option value="editor">编者</option>
            <option value="reviewer">审核员</option>
            {user.status !== 'pending' && <option value="admin">管理员</option>}
          </select>
          <Button
            variant="outline"
            disabled={action.isPending}
            onClick={() =>
              action.mutate(user.status === 'pending' ? 'approve' : 'role')
            }
          >
            {user.status === 'pending' ? '批准账户' : '更新角色'}
          </Button>
          <Button
            variant="outline"
            disabled={action.isPending}
            onClick={() =>
              action.mutate(user.status === 'disabled' ? 'enable' : 'disable')
            }
          >
            {user.status === 'disabled' ? '启用' : '停用'}
          </Button>
        </div>
        <ErrorNotice error={action.error} />
      </td>
    </tr>
  );
}
export default function Users() {
  const me = useMe();
  const cache = useQueryClient();
  const [after, setAfter] = useState(0);
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
  if (!me.permissions.manageUsers)
    return <p role="alert">当前账户没有执行此操作的权限。</p>;
  const refresh = () => {
    void cache.invalidateQueries({ queryKey: ['users'] });
    void cache.invalidateQueries({ queryKey: ['me'] });
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="caption">身份与访问</p>
          <h1>用户管理</h1>
        </div>
        <Button variant="outline" onClick={refresh}>
          刷新用户
        </Button>
      </div>
      <p>
        新账户须经审批。停用会撤销该用户的全部会话；必须保留一位已启用的管理员。
      </p>
      <ErrorNotice error={users.error} />
      {users.isPending && <p role="status">正在读取用户…</p>}
      {users.data && (
        <>
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="用户列表"
          >
            <table>
              <caption className="sr-only">用户身份、角色与账户状态</caption>
              <thead>
                <tr>
                  <th scope="col">GitHub 用户</th>
                  <th scope="col">状态</th>
                  <th scope="col">当前角色</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.data.users.map((user) => (
                  <UserRow
                    key={`${user.id}-${user.role}-${user.status}`}
                    user={user}
                    refresh={refresh}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            {after !== 0 && (
              <Button variant="outline" onClick={() => setAfter(0)}>
                返回第一页
              </Button>
            )}
            {users.data.nextCursor !== null && (
              <Button
                variant="outline"
                onClick={() => setAfter(users.data!.nextCursor!)}
              >
                下一页
              </Button>
            )}
          </div>
        </>
      )}
    </>
  );
}
