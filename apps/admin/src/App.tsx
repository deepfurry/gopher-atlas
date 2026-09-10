import { useQuery } from '@tanstack/react-query';
import { createCMSClient } from '@gopheratlas/api-client';
import { Activity, ArrowLeft, RefreshCw } from 'lucide-react';
import { Link, NavLink, Route, Routes } from 'react-router';
import { Button } from '@/components/ui/button';

const client = createCMSClient();

function Dashboard() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: async ({ signal }) => {
      const result = await client.GET('/healthz', { signal });
      if (!result.data) throw new Error('CMS unavailable');
      return result.data;
    },
    retry: false,
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="caption">工作台 / 概览</p>
          <h1>编辑工作台</h1>
        </div>
        <span className="badge">本地预览</span>
      </div>
      <section
        className="workspace-section"
        aria-labelledby="connection-heading"
      >
        <div className="section-heading">
          <h2 id="connection-heading">
            <Activity size={16} aria-hidden="true" /> CMS 连接
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
            ? '正在连接…'
            : health.isError
              ? '尚未连接。请启动本地 CMS 后重试。'
              : 'CMS 已连接。'}
        </p>
      </section>
      <section className="workspace-section">
        <h2>工作区尚未开放</h2>
        <p>内容管理、审阅与发布将在后续版本开放。</p>
        <p className="caption">当前页面只用于验证工作台的基础界面与连接。</p>
      </section>
    </>
  );
}

export function App() {
  return (
    <div className="admin-shell">
      <a className="skip-link" href="#main">
        跳至主内容
      </a>
      <aside className="sidebar">
        <Link to="/" className="brand">
          GopherAtlas <span>CMS</span>
        </Link>
        <nav aria-label="工作台导航">
          <NavLink to="/" end>
            概览
          </NavLink>
        </nav>
        <p className="sidebar-note">
          编辑、审阅、发布。
          <br />
          让知识持续生长。
        </p>
      </aside>
      <main id="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route
            path="*"
            element={
              <>
                <h1>页面不存在</h1>
                <Link to="/">
                  <ArrowLeft size={16} aria-hidden="true" />
                  返回概览
                </Link>
              </>
            }
          />
        </Routes>
      </main>
    </div>
  );
}
