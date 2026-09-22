import { useMutation, useQueryClient } from '@tanstack/react-query';
import { GithubLogo, SignOut, BookOpen } from '@phosphor-icons/react';
import { ThemeSelect } from './theme';
import { client, APIError, ErrorNotice } from '@/shared/api';
import { Button } from '@/components/ui/button';
import { useLeaveGuard } from '@/shared/leave-guard';
import { useConfirm } from '@/shared/confirm';
export function useLogout() {
  const guard = useLeaveGuard();
  const confirm = useConfirm();
  const cache = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (
        guard.hasUnsaved() &&
        !(await confirm({
          title: '仍有未保存内容，确定退出？',
          description:
            '未保存的草稿仅保留在当前页面。请先保存或复制，再退出登录。',
          confirm: '放弃未保存内容并退出',
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
}
export function Logout() {
  const logout = useLogout();
  return (
    <div>
      <Button
        variant="outline"
        disabled={logout.isPending}
        onClick={() => logout.mutate()}
      >
        <SignOut aria-hidden="true" />
        退出登录
      </Button>
      <ErrorNotice error={logout.error} />
    </div>
  );
}
export function Login({ error }: { error?: Error }) {
  return (
    <main id="main" className="identity-entry">
      <div className="login-brand">
        <BookOpen weight="duotone" />
        <span>GopherAtlas</span>
      </div>
      <p className="caption">技术出版 · 内容管理</p>
      <h1>进入编辑工作台</h1>
      <p>使用 GitHub 账户进入私有工作台。</p>
      {error && <ErrorNotice error={error} />}
      <a className="login-action" href="/api/auth/github">
        <GithubLogo size={18} aria-hidden="true" />
        使用 GitHub 登录
      </a>
      <p className="caption">首次登录后，需要管理员审批。</p>
      <div className="login-theme">
        <ThemeSelect />
      </div>
    </main>
  );
}
