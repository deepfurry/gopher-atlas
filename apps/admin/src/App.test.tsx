// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { components } from '@gopheratlas/api-client';
import { routes } from './app/routes';

type Me = components['schemas']['Me'];
function account(
  role: Me['user']['role'] = 'editor',
  status: Me['user']['status'] = 'active',
): Me {
  return {
    user: {
      id: 1,
      githubUserId: 1,
      githubLogin: 'example',
      role,
      status,
      createdAt: 0,
      updatedAt: 0,
      lastLoginAt: 0,
    },
    profile: {
      slug: 'github-1',
      displayName: 'Example',
      bioMarkdown: '',
      avatarUrl: '',
      websiteUrl: '',
    },
    permissions: {
      uploadAssets: status === 'active',
      manageAssets: false,
      manageUsers: false,
      manageAuthorProfiles: false,
      editOwnProfile: status === 'active',
      review: false,
      publish: false,
      manageTaxonomy: false,
      retryBuild: false,
      viewAudit: false,
      viewMonitor: false,
      createTopic: false,
    },
  };
}
function adminAccount() {
  const me = account('admin');
  me.permissions.manageUsers = true;
  me.permissions.viewMonitor = true;
  return me;
}
const apiError = (code: string, status: number) =>
  Response.json(
    { error: { code, message: 'Request failed.', requestId: 'test-request' } },
    { status },
  );
let current: Me | null;
let requests: Request[];
let failure: string | null;
beforeEach(() => {
  current = null;
  requests = [];
  failure = null;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const request = input as Request;
      requests.push(request);
      const path = new URL(request.url).pathname;
      if (path === '/api/admin/v1/me')
        return current
          ? Response.json(current)
          : apiError('authentication_required', 401);
      if (path === '/readyz') return Response.json({ status: 'ok' });
      if (path === '/api/admin/v1/users')
        return Response.json({
          users: [
            {
              ...account('editor', 'pending').user,
              id: 2,
              githubLogin: 'newcomer',
              githubUserId: 2,
            },
          ],
          nextCursor: null,
        });
      if (path === '/api/auth/logout') return apiError('csrf_invalid', 403);
      if (request.method === 'POST' || request.method === 'PUT') {
        if (failure) return apiError(failure, 409);
        return Response.json(
          path.includes('authors')
            ? current!.profile
            : { ...account().user, id: 2 },
        );
      }
      return apiError('not_found', 404);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.cookie = 'gopheratlas_dev_csrf=; Max-Age=0; Path=/';
});
function mount(path = '/profile') {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={cache}>
      <RouterProvider
        useTransitions={false}
        router={createMemoryRouter(routes, { initialEntries: [path] })}
      />
    </QueryClientProvider>,
  );
}

it('shows a real GitHub login entry for logged-out visitors', async () => {
  mount();
  expect(
    // Cold lazy-route imports contend with the full parallel workspace suite.
    // Wait for the actual login entry, not a fixed delay or a loading placeholder.
    await screen.findByRole(
      'link',
      { name: '使用 GitHub 登录' },
      { timeout: 4000 },
    ),
  ).toHaveProperty('pathname', '/api/auth/github');
  expect(screen.queryByLabelText('密码')).toBeNull();
});
it('shows pending identity without privileged navigation', async () => {
  current = account('editor', 'pending');
  mount();
  expect(
    await screen.findByRole('heading', { name: '账户等待审批' }),
  ).toBeTruthy();
  expect(screen.getByText('GitHub：example')).toBeTruthy();
  expect(screen.queryByRole('navigation')).toBeNull();
  expect(screen.getByRole('button', { name: '退出登录' })).toBeTruthy();
});
it.each(['editor', 'reviewer'] as const)(
  'shows active %s identity without Admin controls',
  async (role) => {
    current = account(role);
    mount();
    expect(
      await screen.findByRole('heading', { name: '个人资料', level: 1 }),
    ).toBeTruthy();
    expect(screen.getByText(new RegExp('@example'))).toBeTruthy();
    expect(screen.queryByRole('link', { name: /用户管理/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /运行监控/ })).toBeNull();
    expect(
      (screen.getByLabelText('作者标识') as HTMLInputElement).readOnly,
    ).toBe(true);
  },
);
it('drives navigation from server capabilities and approves pending users', async () => {
  current = adminAccount();
  mount('/users');
  expect(await screen.findByRole('heading', { name: /用户管理/ })).toBeTruthy();
  expect(screen.getByRole('link', { name: /运行监控/ })).toHaveProperty(
    'pathname',
    '/ops/monitor',
  );
  const row = (await screen.findByText('newcomer')).closest('tr')!;
  fireEvent.click(within(row).getByRole('button', { name: '审批账户' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('combobox'));
  const reviewer = await screen.findByRole('option', { name: '审核员' });
  fireEvent.pointerDown(reviewer, { pointerType: 'mouse' });
  fireEvent.click(reviewer);
  fireEvent.click(within(dialog).getByRole('button', { name: '批准账户' }));
  await waitFor(() =>
    expect(
      requests.some((r) => r.url.endsWith('/users/2/actions/approve')),
    ).toBe(true),
  );
  const request = requests.find((r) =>
    r.url.endsWith('/users/2/actions/approve'),
  )!;
  expect(await request.clone().json()).toEqual({ role: 'reviewer' });
});
it('renders last-Admin errors without hiding them', async () => {
  current = adminAccount();
  failure = 'last_admin_required';
  mount('/users');
  fireEvent.click(
    await screen.findByRole('button', { name: 'newcomer 的操作' }),
  );
  fireEvent.click(await screen.findByRole('menuitem', { name: '停用账户' }));
  fireEvent.click(await screen.findByRole('button', { name: '确认更改' }));
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    expect.stringContaining('必须保留至少一位'),
  );
});
it('attaches the current CSRF cookie on logout and renders API failures', async () => {
  current = account();
  const token = crypto.randomUUID();
  document.cookie = `gopheratlas_dev_csrf=${token}; Path=/`;
  mount();
  fireEvent.click(await screen.findByRole('button', { name: /账户菜单：/ }));
  fireEvent.click(await screen.findByRole('menuitem', { name: '退出登录' }));
  await screen.findByRole('alert');
  const request = requests.find((r) => r.url.endsWith('/api/auth/logout'))!;
  expect(request.credentials).toBe('same-origin');
  expect(request.headers.get('X-CSRF-Token') === token).toBe(true);
  expect(screen.getByRole('alert').textContent).toContain('会话验证失败');
});
it('saves only editable author profile fields', async () => {
  current = account();
  mount();
  fireEvent.change(await screen.findByLabelText('显示名称'), {
    target: { value: 'Updated' },
  });
  fireEvent.click(screen.getByRole('button', { name: '保存个人资料' }));
  await screen.findByText('个人资料已保存。');
  const request = requests.find((r) => r.method === 'PUT')!;
  expect(await request.clone().json()).toEqual({
    displayName: 'Updated',
    bioMarkdown: '',
    websiteUrl: '',
  });
});
it('renders a disabled identity error with a login entry', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => apiError('account_disabled', 403)),
  );
  mount();
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    expect.stringContaining('账户已停用'),
  );
  expect(screen.getByRole('link', { name: '使用 GitHub 登录' })).toBeTruthy();
});
