import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FloppyDisk } from '@phosphor-icons/react';
import { client, unwrap, ErrorNotice, type Schema } from '@/shared/api';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { PageHeader, Avatar, Badge } from '@/components/ui/workspace';
import { useMe } from '@/app/context';
import { roles, statuses } from '@/shared/status';
import { MarkdownFeedback, MarkdownPreview } from '@/shared/markdown';
type Profile = Schema<'Profile'>;
export function ProfileForm({
  profile,
  authorId,
}: {
  profile: Profile;
  authorId?: number;
}) {
  const cache = useQueryClient();
  const [displayName, setDisplayName] = useState(profile.displayName),
    [bioMarkdown, setBioMarkdown] = useState(profile.bioMarkdown),
    [websiteUrl, setWebsiteUrl] = useState(profile.websiteUrl);
  const save = useMutation({
    mutationFn: async () => {
      const body = { displayName, bioMarkdown, websiteUrl };
      return authorId
        ? unwrap(
            await client.PUT('/api/admin/v1/authors/{id}/profile', {
              params: { path: { id: authorId } },
              body,
            }),
          )
        : unwrap(await client.PUT('/api/admin/v1/authors/me', { body }));
    },
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['me'] });
      void cache.invalidateQueries({ queryKey: ['authors'] });
      toast.success(authorId ? '作者资料已保存。' : '个人资料已保存。');
    },
  });
  return (
    <form
      className="profile-form"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div>
        <label htmlFor="author-slug">作者标识</label>
        <Input id="author-slug" value={profile.slug} readOnly />
        <p className="caption">用于公开作者页面，创建后保持固定。</p>
      </div>
      <div>
        <label htmlFor="display-name">显示名称</label>
        <Input
          id="display-name"
          required
          maxLength={100}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="website-url">个人网站</label>
        <Input
          id="website-url"
          type="url"
          maxLength={2048}
          placeholder="https://"
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="bio-markdown">个人简介（Markdown）</label>
        <Textarea
          id="bio-markdown"
          rows={7}
          maxLength={10000}
          aria-describedby="bio-help"
          value={bioMarkdown}
          onChange={(e) => setBioMarkdown(e.target.value)}
        />
        <p id="bio-help" className="caption">
          最多 10,000 字节；不支持一级标题、原始 HTML、MDX 或外部图片。
        </p>
        <MarkdownFeedback source={bioMarkdown} />
      </div>
      <details className="profile-preview">
        <summary>预览简介</summary>
        <MarkdownPreview source={bioMarkdown} />
      </details>
      <ErrorNotice error={save.error} />
      {save.isSuccess && (
        <p role="status" className="caption">
          {authorId ? '作者资料已保存。' : '个人资料已保存。'}
        </p>
      )}
      <div className="toolbar">
        <Button type="submit" disabled={save.isPending}>
          <FloppyDisk />
          {save.isPending
            ? '正在保存…'
            : authorId
              ? '保存作者资料'
              : '保存个人资料'}
        </Button>
      </div>
    </form>
  );
}
export default function MyProfile() {
  const me = useMe();
  return (
    <>
      <PageHeader
        title="个人资料"
        description="维护内容署名、作者简介与个人网站。"
      />
      <div className="profile-layout">
        <aside className="profile-identity">
          <Avatar
            name={me.profile.displayName}
            url={me.profile.avatarUrl}
            size={64}
          />
          <h2>{me.profile.displayName}</h2>
          <p className="caption">@{me.user.githubLogin}</p>
          <div className="status-group">
            <Badge>{roles[me.user.role]}</Badge>
            <Badge tone="success">{statuses[me.user.status]}</Badge>
          </div>
          <p className="caption">
            这些资料用于内容署名，账号权限由管理员管理。
          </p>
        </aside>
        <ProfileForm profile={me.profile} />
      </div>
    </>
  );
}
