import {
  House,
  Files,
  Article,
  Notebook,
  BookmarkSimple,
  Stack,
  Images,
  Tag,
  Tray,
  ClockCounterClockwise,
  Users,
  IdentificationCard,
  UserCircle,
  CloudArrowUp,
  ListChecks,
  Pulse,
  type Icon,
} from '@phosphor-icons/react';
import type { Schema } from '@/shared/api';
type Permission = keyof Schema<'Me'>['permissions'];
export type NavItem = {
  to: string;
  label: string;
  icon: Icon;
  permission?: Permission;
  external?: boolean;
};
export const navigation: { label: string; items: NavItem[] }[] = [
  { label: '工作台', items: [{ to: '/', label: '工作台', icon: House }] },
  {
    label: '内容',
    items: [
      { to: '/content', label: '全部内容', icon: Files },
      { to: '/content?type=post', label: '文章', icon: Article },
      { to: '/content?type=note', label: '笔记', icon: Notebook },
      {
        to: '/content?type=curated_article',
        label: '精选',
        icon: BookmarkSimple,
      },
      {
        to: '/content?type=topic',
        label: '专题',
        icon: Stack,
        permission: 'createTopic',
      },
    ],
  },
  {
    label: '内容资源',
    items: [
      {
        to: '/assets',
        label: '素材库',
        icon: Images,
        permission: 'uploadAssets',
      },
      { to: '/tags', label: '标签', icon: Tag, permission: 'manageTaxonomy' },
    ],
  },
  {
    label: '编辑流程',
    items: [
      { to: '/reviews', label: '待审核', icon: Tray, permission: 'review' },
      {
        to: '/reviews/history',
        label: '审核历史',
        icon: ClockCounterClockwise,
        permission: 'review',
      },
    ],
  },
  {
    label: '成员',
    items: [
      {
        to: '/users',
        label: '用户管理',
        icon: Users,
        permission: 'manageUsers',
      },
      { to: '/authors', label: '作者管理', icon: IdentificationCard },
      {
        to: '/profile',
        label: '个人资料',
        icon: UserCircle,
        permission: 'editOwnProfile',
      },
    ],
  },
  {
    label: '发布与运维',
    items: [
      {
        to: '/publication',
        label: '发布状态',
        icon: CloudArrowUp,
        permission: 'retryBuild',
      },
      {
        to: '/audit',
        label: '操作审计',
        icon: ListChecks,
        permission: 'viewAudit',
      },
      {
        to: '/ops/monitor',
        label: '运行监控',
        icon: Pulse,
        permission: 'viewMonitor',
        external: true,
      },
    ],
  },
];
export function visibleNavigation(permissions: Schema<'Me'>['permissions']) {
  return navigation
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !item.permission || permissions[item.permission],
      ),
    }))
    .filter((group) => group.items.length);
}
export function isActive(to: string, pathname: string, search: string) {
  const target = new URL(to, 'https://cms.invalid');
  if (target.pathname === '/content')
    return (
      (pathname.startsWith('/content/') && !target.searchParams.has('type')) ||
      (pathname === '/content' &&
        new URLSearchParams(search).get('type') ===
          target.searchParams.get('type'))
    );
  return (
    pathname === target.pathname ||
    (target.pathname === '/authors' && pathname.startsWith('/authors/')) ||
    (target.pathname === '/reviews' &&
      pathname.startsWith('/reviews/pending/')) ||
    (target.pathname === '/reviews/history' &&
      pathname.startsWith('/reviews/history/'))
  );
}
