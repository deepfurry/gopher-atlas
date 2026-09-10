import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createCMSClient, type components } from '@gopheratlas/api-client';
import { Activity, Github, LogOut, RefreshCw } from 'lucide-react';
import { Link, NavLink, Route, Routes } from 'react-router';
import { Button } from '@/components/ui/button';

const client = createCMSClient();
type User = components['schemas']['User'];
type Me = components['schemas']['Me'];
type Profile = components['schemas']['Profile'];
type ErrorBody = components['schemas']['ErrorResponse'];
const roles = { admin: '管理员', reviewer: '审核员', editor: '编者' };
const statuses = { pending: '待审批', active: '已启用', disabled: '已停用' };

class APIError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
function unwrap<T>(result: { data?: T; error?: ErrorBody }): T {
  if (result.error)
    throw new APIError(result.error.error.code, result.error.error.message);
  if (result.data === undefined) throw new Error('CMS 暂时不可用，请重试。');
  return result.data;
}
function message(error: Error) {
  if (error instanceof APIError) {
    const messages: Record<string, string> = {
      last_admin_required:
        '必须保留至少一位已启用的管理员。请先授权另一位管理员。',
      account_disabled: '账户已停用，请联系管理员。',
      account_pending: '账户正在等待管理员审批。',
      permission_denied: '当前账户没有执行此操作的权限。',
      authentication_required: '登录已过期，请重新登录。',
      csrf_invalid: '会话验证失败，请刷新页面或重新登录。',
      validation_failed: '请检查填写内容；个人简介须符合 Markdown 安全规则。',
      dependency_unavailable: 'CMS 持久层暂未就绪，请稍后重试。',
    };
    return messages[error.code] ?? '请求未完成，请稍后重试。';
  }
  return '无法连接 CMS，请稍后重试。';
}
function ErrorNotice({ error }: { error: Error | null }) {
  return error ? (
    <p className="error-message" role="alert">
      {message(error)}
    </p>
  ) : null;
}
function Logout() {
  const cache = useQueryClient();
  const logout = useMutation({
    mutationFn: async () => {
      const result = await client.POST('/api/auth/logout');
      if (result.error)
        throw new APIError(result.error.error.code, result.error.error.message);
      if (!result.response.ok) throw new Error('Logout failed');
    },
    onSuccess: () => {
      cache.clear();
      window.location.assign('/');
    },
  });
  return (
    <div>
      <Button
        variant="outline"
        disabled={logout.isPending}
        onClick={() => logout.mutate()}
      >
        <LogOut aria-hidden="true" />
        退出登录
      </Button>
      <ErrorNotice error={logout.error} />
    </div>
  );
}
function Login({ error }: { error?: Error }) {
  return (
    <main id="main" className="identity-entry">
      <p className="caption">PRIVATE CONTROL PLANE</p>
      <h1>GopherAtlas CMS</h1>
      <p>使用 GitHub 账户进入私有工作台。</p>
      {error && <ErrorNotice error={error} />}
      <a className="login-action" href="/api/auth/github">
        <Github size={16} aria-hidden="true" />
        使用 GitHub 登录
      </a>
      <p className="caption">首次登录后，需要管理员审批。</p>
    </main>
  );
}
function Readiness() {
  const health = useQuery({
    queryKey: ['readiness'],
    queryFn: async ({ signal }) =>
      unwrap(await client.GET('/readyz', { signal })),
    retry: false,
  });
  return (
    <section className="workspace-section" aria-labelledby="connection-heading">
      <div className="section-heading">
        <h2 id="connection-heading">
          <Activity size={16} aria-hidden="true" />
          CMS 运行状态
        </h2>
        <Button
          variant="outline"
          disabled={health.isFetching}
          onClick={() => void health.refetch()}
        >
          <RefreshCw aria-hidden="true" />
          重新检查
        </Button>
      </div>
      <p role="status">
        {health.isPending
          ? '正在检查…'
          : health.isError
            ? 'CMS 暂未就绪，请稍后重试。'
            : 'CMS 已就绪。'}
      </p>
    </section>
  );
}
function ProfileForm({ profile }: { profile: Profile }) {
  const cache = useQueryClient();
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [bioMarkdown, setBioMarkdown] = useState(profile.bioMarkdown);
  const [websiteUrl, setWebsiteUrl] = useState(profile.websiteUrl);
  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await client.PUT('/api/admin/v1/authors/me', {
          body: { displayName, bioMarkdown, websiteUrl },
        }),
      ),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['me'] });
    },
  });
  return (
    <form
      className="profile-form"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <div>
        <label htmlFor="author-slug">作者标识</label>
        <input id="author-slug" value={profile.slug} readOnly />
        <p className="caption">标识保持固定，供后续公开作者页面使用。</p>
      </div>
      <div>
        <label htmlFor="display-name">显示名称</label>
        <input
          id="display-name"
          required
          maxLength={100}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </div>
      <div>
        <label htmlFor="website-url">个人网站</label>
        <input
          id="website-url"
          type="url"
          maxLength={2048}
          placeholder="https://"
          value={websiteUrl}
          onChange={(event) => setWebsiteUrl(event.target.value)}
        />
      </div>
      <div>
        <label htmlFor="bio-markdown">个人简介（Markdown）</label>
        <textarea
          id="bio-markdown"
          rows={6}
          maxLength={10000}
          aria-describedby="bio-help"
          value={bioMarkdown}
          onChange={(event) => setBioMarkdown(event.target.value)}
        />
        <p id="bio-help" className="caption">
          最多 10,000 UTF-8 字节；不支持 H1、HTML、MDX 或外部图片。
        </p>
      </div>
      <ErrorNotice error={save.error} />
      {save.isSuccess && <p role="status">个人资料已保存。</p>}
      <Button type="submit" disabled={save.isPending}>
        保存个人资料
      </Button>
    </form>
  );
}
function UserRow({ user, refresh }: { user: User; refresh: () => void }) {
  const [role, setRole] = useState<User['role']>(
    user.status === 'pending' ? 'editor' : user.role,
  );
  const action = useMutation({
    mutationFn: async (kind: 'approve' | 'disable' | 'enable' | 'role') => {
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
    onSuccess: refresh,
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
function Users() {
  const cache = useQueryClient();
  const [after, setAfter] = useState(0);
  const users = useQuery({
    queryKey: ['users', after],
    queryFn: async ({ signal }) =>
      unwrap(
        await client.GET('/api/admin/v1/users', {
          signal,
          params: { query: { after } },
        }),
      ),
    retry: false,
  });
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
function Active({ me }: { me: Me }) {
  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <Link to="/" className="brand">
          GopherAtlas <span>CMS</span>
        </Link>
        <div className="identity-summary">
          {me.profile.avatarUrl && (
            <img
              src={me.profile.avatarUrl}
              width={32}
              height={32}
              alt=""
              referrerPolicy="no-referrer"
            />
          )}
          <div>
            <strong>{me.profile.displayName}</strong>
            <p className="caption">
              @{me.user.githubLogin} · {roles[me.user.role]}
            </p>
          </div>
        </div>
        <nav aria-label="工作台导航">
          <NavLink to="/" end>
            个人资料
          </NavLink>
          {me.permissions.manageUsers && (
            <NavLink to="/users">用户管理</NavLink>
          )}
          {me.permissions.viewMonitor && <a href="/ops/monitor">运行监控</a>}
        </nav>
        <div className="sidebar-note">
          <Logout />
        </div>
      </aside>
      <main id="main">
        <Routes>
          <Route
            path="/"
            element={
              <>
                <p className="caption">身份与访问</p>
                <h1>个人资料</h1>
                <Readiness />
                {me.permissions.editOwnProfile && (
                  <section className="workspace-section">
                    <h2>作者资料</h2>
                    <ProfileForm profile={me.profile} />
                  </section>
                )}
              </>
            }
          />
          {me.permissions.manageUsers && (
            <Route path="/users" element={<Users />} />
          )}
          <Route
            path="*"
            element={
              <>
                <h1>页面不可用</h1>
                <Link to="/">返回个人资料</Link>
              </>
            }
          />
        </Routes>
      </main>
    </div>
  );
}
export function App() {
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async ({ signal }) =>
      unwrap(await client.GET('/api/admin/v1/me', { signal })),
    retry: false,
  });
  let body;
  if (me.isPending)
    body = (
      <main id="main" className="identity-entry">
        <p role="status">正在检查登录状态…</p>
      </main>
    );
  else if (me.isError)
    body = (
      <Login
        error={
          me.error instanceof APIError &&
          me.error.code === 'authentication_required'
            ? undefined
            : me.error
        }
      />
    );
  else if (me.data.user.status === 'pending')
    body = (
      <main id="main" className="identity-entry">
        <p className="caption">GOPHERATLAS CMS</p>
        <h1>账户等待审批</h1>
        <p>GitHub：{me.data.user.githubLogin}</p>
        <p>管理员批准后即可进入工作台。</p>
        <div className="user-actions">
          <Button variant="outline" onClick={() => void me.refetch()}>
            重新检查状态
          </Button>
          <Logout />
        </div>
      </main>
    );
  else body = <Active me={me.data} />;
  return (
    <>
      <a className="skip-link" href="#main">
        跳至主内容
      </a>
      {body}
    </>
  );
}
