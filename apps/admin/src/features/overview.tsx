import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { client, unwrap, ErrorNotice } from '@/shared/api';
import { useMe } from '@/app/context';
import { Button } from '@/components/ui/button';
export default function Overview() {
  const me = useMe();
  const ready = useQuery({
    queryKey: ['readiness'],
    queryFn: async ({ signal }) =>
      unwrap(await client.GET('/readyz', { signal })),
    retry: false,
  });
  return (
    <>
      <p className="caption">EDITORIAL WORKSPACE</p>
      <h1>Overview</h1>
      <p>
        欢迎，{me.profile.displayName}。在这里编写、审核并选择 CMS 发布版本。
      </p>
      <section className="workspace-section">
        <h2>Continue your work</h2>
        <div className="toolbar">
          <Link className="login-action" to="/content">
            Open content
          </Link>
          {me.permissions.review && <Link to="/reviews">Pending reviews</Link>}
        </div>
        <p className="caption">
          Published in CMS 表示已选择 SQLite 中的 Revision
          并排队构建。Publication 页面显示独立的公开构建状态。
        </p>
      </section>
      <section className="workspace-section">
        <h2>CMS 运行状态</h2>
        <p role="status">
          {ready.isPending
            ? '正在检查…'
            : ready.isError
              ? 'CMS 暂未就绪，请稍后重试。'
              : 'CMS 已就绪。'}
        </p>
        <ErrorNotice error={ready.error} />
        <Button variant="outline" onClick={() => void ready.refetch()}>
          重新检查
        </Button>
      </section>
    </>
  );
}
