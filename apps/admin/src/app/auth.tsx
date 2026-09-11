import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Github, LogOut } from 'lucide-react';
import { client, APIError, ErrorNotice } from '@/shared/api';
import { Button } from '@/components/ui/button';
import { useLeaveGuard } from '@/shared/leave-guard';
import { useConfirm } from '@/shared/confirm';
export function Logout() {
  const guard = useLeaveGuard();
  const confirm = useConfirm();
  const cache = useQueryClient();
  const logout = useMutation({
    mutationFn: async () => {
      if (
        guard.hasUnsaved() &&
        !(await confirm({
          title: 'Log out with unsaved changes?',
          description:
            'Your local Draft exists only in this tab. Cancel to save or copy it before logging out.',
          confirm: 'Log out and leave',
        }))
      )
        return false;
      const result = await client.POST('/api/auth/logout');
      if (result.error)
        throw new APIError(result.error.error.code, result.error.error.message);
      if (!result.response.ok) throw new Error('Logout failed');
      return true;
    },
    onSuccess: (completed) => {
      if (!completed) return;
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
export function Login({ error }: { error?: Error }) {
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
