// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { backend, content, me, mount } from './fixtures';

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

it.each(['editor', 'reviewer', 'admin'] as const)(
  'shows Chinese navigation from %s permissions',
  async (role) => {
    backend(content('post', role === 'admin'), me(role));
    mount('/content');
    const nav = await screen.findByRole('navigation', { name: '工作台导航' });
    expect(
      within(nav)
        .getByRole('link', { name: '全部内容' })
        .getAttribute('aria-current'),
    ).toBe('page');
    for (const label of [
      '文章',
      '笔记',
      '精选',
      '素材库',
      '作者管理',
      '个人资料',
    ])
      expect(within(nav).getByRole('link', { name: label })).toBeTruthy();
    for (const label of ['待审核', '审核历史', '发布状态', '操作审计'])
      expect(within(nav).queryByRole('link', { name: label }) !== null).toBe(
        role !== 'editor',
      );
    for (const label of ['用户管理', '运行监控', '标签', '专题'])
      expect(within(nav).queryByRole('link', { name: label }) !== null).toBe(
        role === 'admin',
      );
    expect(
      within(nav).queryByText(/Overview|Users|Publication|Assets/),
    ).toBeNull();
  },
);

it('persists sidebar collapse, keeps accessible links and restores on remount', async () => {
  backend();
  const view = mount('/content');
  fireEvent.click(await screen.findByRole('button', { name: '收起导航' }));
  expect(localStorage.getItem('gopheratlas-sidebar')).toBe('collapsed');
  expect(
    document.querySelector('.admin-shell')?.classList.contains('is-collapsed'),
  ).toBe(true);
  expect(screen.getByRole('link', { name: '笔记' })).toBeTruthy();
  view.unmount();
  mount('/content');
  expect(await screen.findByRole('button', { name: '展开导航' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '展开导航' }));
  expect(localStorage.getItem('gopheratlas-sidebar')).toBe('expanded');
});

it('opens modal mobile navigation and closes it after a route change', async () => {
  backend();
  mount('/content');
  fireEvent.click(await screen.findByRole('button', { name: '打开导航' }));
  const drawer = await screen.findByRole('dialog', { name: 'GopherAtlas' });
  fireEvent.click(within(drawer).getByRole('link', { name: '笔记' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(
    await screen.findByRole('heading', { name: '笔记', level: 1 }),
  ).toBeTruthy();
});

it('exposes account identity and all theme preferences in Chinese', async () => {
  backend(content('post', true), me('admin'));
  mount('/content');
  fireEvent.click(await screen.findByRole('button', { name: /账户菜单：/ }));
  const menu = await screen.findByRole('menu', { name: /账户菜单/ });
  expect(within(menu).getByText('@test-author')).toBeTruthy();
  expect(within(menu).getByText('管理员')).toBeTruthy();
  expect(within(menu).getByRole('menuitem', { name: '个人资料' })).toBeTruthy();
  expect(within(menu).getByRole('menuitem', { name: '退出登录' })).toBeTruthy();
  fireEvent.click(within(menu).getByRole('menuitemradio', { name: '深色' }));
  await waitFor(() =>
    expect(document.documentElement.dataset.theme).toBe('dark'),
  );
  expect(localStorage.getItem('gopheratlas-theme')).toBe('dark');
  fireEvent.click(screen.getByRole('button', { name: '切换浅色主题' }));
  expect(document.documentElement.dataset.theme).toBe('light');
  fireEvent.click(screen.getByRole('button', { name: /账户菜单：/ }));
  fireEvent.click(
    await screen.findByRole('menuitemradio', { name: '跟随系统' }),
  );
  expect(localStorage.getItem('gopheratlas-theme')).toBe('system');
  expect(Object.keys(localStorage).sort()).toEqual([
    'gopheratlas-sidebar',
    'gopheratlas-theme',
  ]);
});

it('opens scoped search with Ctrl+K and uses the existing content query', async () => {
  const state = backend();
  mount('/content');
  await screen.findByRole('heading', { name: '全部内容' });
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
  const dialog = await screen.findByRole('dialog', { name: '搜索' });
  fireEvent.change(within(dialog).getByRole('searchbox'), {
    target: { value: 'useful' },
  });
  await waitFor(() =>
    expect(
      state.requests.some(
        (r) => new URL(r.url).searchParams.get('q') === 'useful',
      ),
    ).toBe(true),
  );
  fireEvent.click(
    await within(dialog).findByRole('link', { name: 'A useful post' }),
  );
  await screen.findByLabelText('标题');
  expect(screen.queryByRole('dialog')).toBeNull();
});
