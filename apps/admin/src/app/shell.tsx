import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { Menu, PanelLeftClose } from 'lucide-react';
import { useMe } from './context';
import { Logout } from './auth';
import { ThemeSelect } from './theme';
import { roles } from '@/shared/status';
import { Button } from '@/components/ui/button';
export function Shell() {
  const me = useMe();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);
  const link = (to: string, label: string) => {
    const target = new URL(to, 'https://cms.invalid');
    const active =
      location.pathname === target.pathname &&
      (target.pathname !== '/content' ||
        new URLSearchParams(location.search).get('type') ===
          target.searchParams.get('type'));
    return (
      <Link to={to} aria-current={active ? 'page' : undefined}>
        {label}
      </Link>
    );
  };
  return (
    <div className="admin-shell">
      <header className="mobile-header">
        <Link className="brand" to="/">
          GopherAtlas <span>CMS</span>
        </Link>
        <Button
          variant="outline"
          aria-label="Toggle navigation"
          aria-expanded={open}
          aria-controls="workspace-sidebar"
          onClick={() => setOpen(!open)}
        >
          {open ? <PanelLeftClose /> : <Menu />}
        </Button>
      </header>
      <aside
        id="workspace-sidebar"
        className={`sidebar ${open ? 'sidebar-open' : ''}`}
      >
        <Link to="/" className="brand">
          GopherAtlas <span>CMS</span>
        </Link>
        <div className="identity-summary">
          <div>
            <strong>{me.profile.displayName}</strong>
            <p className="caption">
              @{me.user.githubLogin} · {roles[me.user.role]}
            </p>
          </div>
        </div>
        <nav aria-label="工作台导航">
          {link('/', 'Overview')}
          <p className="nav-group">Content</p>
          {link('/content', 'All Content')}
          {link('/content?type=post', 'Posts')}
          {link('/content?type=note', 'Notes')}
          {link('/content?type=curated_article', 'Curated')}
          {me.permissions.createTopic && link('/content?type=topic', 'Topics')}
          {me.permissions.review && (
            <>
              <p className="nav-group">Reviews</p>
              {link('/reviews', 'Pending')}
              {link('/reviews/history', 'History')}
            </>
          )}
          {me.permissions.manageTaxonomy && (
            <>
              <p className="nav-group">Taxonomy</p>
              {link('/tags', 'Tags')}
            </>
          )}
          <p className="nav-group">People</p>
          {me.permissions.manageUsers && link('/users', 'Users · 用户管理')}
          {link('/authors', 'Authors')}
          {me.permissions.editOwnProfile &&
            link('/profile', 'My Profile · 个人资料')}
          {(me.permissions.viewAudit || me.permissions.viewMonitor) && (
            <p className="nav-group">Operations</p>
          )}
          {me.permissions.viewAudit && link('/audit', 'Audit')}
          {me.permissions.viewMonitor && (
            <a href="/ops/monitor">Monitor · 运行监控</a>
          )}
        </nav>
        <div className="sidebar-note">
          <ThemeSelect />
          <Logout />
        </div>
      </aside>
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
