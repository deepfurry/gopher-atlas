import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { client, unwrap, APIError, type Schema } from '@/shared/api';
import { Login, Logout } from '@/app/auth';
import { MeContext } from '@/app/context';
import { Shell } from '@/app/shell';
import { ThemeProvider } from '@/app/theme';
import { ConfirmProvider } from '@/shared/confirm';
import { Button } from '@/components/ui/button';
import { LeaveGuardProvider } from '@/shared/leave-guard';
export function App() {
  const cache = useQueryClient();
  const [expired, setExpired] = useState(false);
  const last = useRef<Schema<'Me'> | null>(null);
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async ({ signal }) =>
      unwrap(await client.GET('/api/admin/v1/me', { signal }), false),
    retry: false,
  });
  useEffect(() => {
    const expire = () => {
      setExpired(true);
      void cache.invalidateQueries({ queryKey: ['me'] });
    };
    window.addEventListener('cms-auth-expired', expire);
    return () => window.removeEventListener('cms-auth-expired', expire);
  }, [cache]);
  if (me.data) last.current = me.data;
  const identity = me.data ?? (expired ? last.current : null);
  let body;
  if (identity?.user.status === 'active')
    body = (
      <MeContext value={identity}>
        {expired && (
          <div className="session-warning" role="alert">
            登录已过期。未保存内容仍保留在当前页面，请先复制。
            <a href="/api/auth/github">重新登录</a>
          </div>
        )}
        <Shell />
      </MeContext>
    );
  else if (identity?.user.status === 'pending')
    body = (
      <main id="main" className="identity-entry">
        <h1>账户等待审批</h1>
        <p>GitHub：{identity.user.githubLogin}</p>
        <p>管理员批准后即可进入工作台。</p>
        <div className="toolbar">
          <Button variant="outline" onClick={() => void me.refetch()}>
            重新检查状态
          </Button>
          <Logout />
        </div>
      </main>
    );
  else if (me.isPending)
    body = (
      <main id="main" className="identity-entry">
        <p role="status">正在检查登录状态…</p>
      </main>
    );
  else
    body = (
      <Login
        error={
          me.error instanceof APIError &&
          me.error.code === 'authentication_required'
            ? undefined
            : (me.error ?? undefined)
        }
      />
    );
  return (
    <ThemeProvider>
      <ConfirmProvider>
        <LeaveGuardProvider>
          <a className="skip-link" href="#main">
            跳至主内容
          </a>
          {body}
          <Toaster position="bottom-right" richColors />
        </LeaveGuardProvider>
      </ConfirmProvider>
    </ThemeProvider>
  );
}
