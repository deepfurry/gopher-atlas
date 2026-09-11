import { useEffect, useState, useRef } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import {
  SidebarSimple,
  List,
  BookOpen,
  CaretRight,
  Moon,
  Sun,
  Desktop,
  SignOut,
  UserCircle,
} from '@phosphor-icons/react';
import { useMe } from './context';
import { useLogout } from './auth';
import { useTheme, type Theme } from './theme';
import { useSidebarPreference } from './sidebar-preference';
import { roles } from '@/shared/status';
import { ErrorNotice } from '@/shared/api';
import { Button, IconButton } from '@/components/ui/button';
import { Sheet } from '@/components/ui/dialog';
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip';
import { Avatar } from '@/components/ui/workspace';
import {
  DropdownMenu,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuSeparator,
} from '@/components/ui/menu';
import { visibleNavigation, isActive } from '@/components/admin/navigation';
import { CreateContent } from '@/components/admin/create-content';
import { GlobalSearch } from '@/components/admin/search';
export function Shell() {
  const me = useMe(),
    location = useLocation(),
    navigate = useNavigate(),
    theme = useTheme(),
    logout = useLogout();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useSidebarPreference();
  const main = useRef<HTMLElement>(null);
  const groups = visibleNavigation(me.permissions);
  useEffect(() => {
    setMobileOpen(false);
    main.current?.scrollTo?.(0, 0);
  }, [location.pathname, location.search]);
  const currentGroup = groups.find((group) =>
    group.items.some((item) =>
      isActive(item.to, location.pathname, location.search),
    ),
  );
  const current = currentGroup?.items.find((item) =>
    isActive(item.to, location.pathname, location.search),
  );
  const detail = location.pathname.startsWith('/content/')
    ? '编辑内容'
    : location.pathname.startsWith('/reviews/pending/')
      ? '审核详情'
      : location.pathname.startsWith('/reviews/history/')
        ? '历史审核'
        : location.pathname.startsWith('/authors/')
          ? '作者资料'
          : '';
  const navigation = (small: boolean) => (
    <nav aria-label="工作台导航">
      {groups.map((group, index) => (
        <div className="nav-section" key={group.label}>
          {index > 0 && (
            <p className="nav-group">
              {small ? <span aria-hidden="true" /> : group.label}
            </p>
          )}
          {group.items.map((item) => {
            const active = isActive(
              item.to,
              location.pathname,
              location.search,
            );
            const content = (
              <>
                <item.icon
                  weight={active ? 'fill' : 'regular'}
                  aria-hidden="true"
                />
                <span className="nav-label">{item.label}</span>
                {item.external && !small && (
                  <span className="external-mark" aria-hidden="true">
                    ↗
                  </span>
                )}
              </>
            );
            const link = item.external ? (
              <a
                className="nav-link"
                href={item.to}
                aria-label={small ? item.label : undefined}
              >
                {content}
              </a>
            ) : (
              <Link
                className="nav-link"
                to={item.to}
                aria-label={small ? item.label : undefined}
                aria-current={active ? 'page' : undefined}
              >
                {content}
              </Link>
            );
            return small ? (
              <Tooltip key={item.to} label={item.label}>
                {link}
              </Tooltip>
            ) : (
              <div key={item.to}>{link}</div>
            );
          })}
        </div>
      ))}
    </nav>
  );
  return (
    <TooltipProvider delay={250}>
      <div className={`admin-shell${collapsed ? ' is-collapsed' : ''}`}>
        <aside className="sidebar">
          <Link to="/" className="brand" aria-label="GopherAtlas 工作台">
            <span className="brand-symbol">
              <BookOpen weight="duotone" />
            </span>
            <span className="brand-wordmark">
              GopherAtlas<small>编辑工作台</small>
            </span>
          </Link>
          <div className="sidebar-scroll">{navigation(collapsed)}</div>
          <div className="sidebar-footer">
            <IconButton
              label={collapsed ? '展开导航' : '收起导航'}
              aria-expanded={!collapsed}
              onClick={() => setCollapsed(!collapsed)}
            >
              <SidebarSimple />
            </IconButton>
            {!collapsed && <span className="caption">专注内容，持续积累</span>}
          </div>
        </aside>
        <div className="shell-body">
          <header className="topbar">
            <IconButton
              label="打开导航"
              className="mobile-nav-trigger"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
            >
              <List />
            </IconButton>
            <nav className="breadcrumbs" aria-label="面包屑">
              <Link to="/">工作台</Link>
              {location.pathname !== '/' && (
                <>
                  <CaretRight />
                  <span>{currentGroup?.label || '内容'}</span>
                  <CaretRight />
                  <span aria-current="page">
                    {detail || current?.label || '页面'}
                  </span>
                </>
              )}
            </nav>
            <div className="topbar-actions">
              <GlobalSearch />
              <CreateContent compact />
              <span className="topbar-divider" />
              <IconButton
                label={
                  theme.resolved === 'dark' ? '切换浅色主题' : '切换深色主题'
                }
                onClick={() =>
                  theme.setTheme(theme.resolved === 'dark' ? 'light' : 'dark')
                }
              >
                {theme.resolved === 'dark' ? <Sun /> : <Moon />}
              </IconButton>
              <DropdownMenu
                label="账户菜单"
                trigger={
                  <Button
                    variant="ghost"
                    className="account-trigger"
                    aria-label={`账户菜单：${me.profile.displayName}`}
                  >
                    <Avatar
                      name={me.profile.displayName}
                      url={me.profile.avatarUrl}
                      size={28}
                    />
                    <span>{me.profile.displayName}</span>
                  </Button>
                }
              >
                <MenuLabel>
                  <strong>{me.profile.displayName}</strong>
                  <span>@{me.user.githubLogin}</span>
                  <span>{roles[me.user.role]}</span>
                </MenuLabel>
                <MenuSeparator />
                {me.permissions.editOwnProfile && (
                  <MenuItem onClick={() => navigate('/profile')}>
                    <UserCircle />
                    个人资料
                  </MenuItem>
                )}
                <MenuLabel>外观</MenuLabel>
                <MenuRadioGroup
                  value={theme.theme}
                  onValueChange={(value) => theme.setTheme(value as Theme)}
                  options={[
                    { value: 'system', label: '跟随系统', icon: <Desktop /> },
                    { value: 'light', label: '浅色', icon: <Sun /> },
                    { value: 'dark', label: '深色', icon: <Moon /> },
                  ]}
                />
                <MenuSeparator />
                <MenuItem
                  onClick={() => logout.mutate()}
                  disabled={logout.isPending}
                >
                  <SignOut />
                  退出登录
                </MenuItem>
              </DropdownMenu>
            </div>
          </header>
          <ErrorNotice error={logout.error} />
          <main id="main" className="workspace" tabIndex={-1} ref={main}>
            <div className="workspace-content">
              <Outlet />
            </div>
          </main>
        </div>
        <Sheet
          open={mobileOpen}
          onOpenChange={setMobileOpen}
          title="GopherAtlas"
          description="编辑工作台"
          side="left"
          className="mobile-navigation"
        >
          {navigation(false)}
        </Sheet>
      </div>
    </TooltipProvider>
  );
}
