import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { client, unwrap, ErrorNotice, type Schema } from '@/shared/api';
import { Button } from '@/components/ui/button';
import { useMe } from '@/app/context';
type Profile = Schema<'Profile'>;
export function ProfileForm({ profile }: { profile: Profile }) {
  const cache = useQueryClient();
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [bioMarkdown, setBioMarkdown] = useState(profile.bioMarkdown);
  const [websiteUrl, setWebsiteUrl] = useState(profile.websiteUrl);
  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await client.PUT('/api/admin/v1/authors/me', {
          body: { displayName, bioMarkdown, websiteUrl },
        }),
      ),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['me'] });
    },
  });
  return (
    <form
      className="profile-form"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <div>
        <label htmlFor="author-slug">作者标识</label>
        <input id="author-slug" value={profile.slug} readOnly />
        <p className="caption">标识保持固定，供后续公开作者页面使用。</p>
      </div>
      <div>
        <label htmlFor="display-name">显示名称</label>
        <input
          id="display-name"
          required
          maxLength={100}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </div>
      <div>
        <label htmlFor="website-url">个人网站</label>
        <input
          id="website-url"
          type="url"
          maxLength={2048}
          placeholder="https://"
          value={websiteUrl}
          onChange={(event) => setWebsiteUrl(event.target.value)}
        />
      </div>
      <div>
        <label htmlFor="bio-markdown">个人简介（Markdown）</label>
        <textarea
          id="bio-markdown"
          rows={6}
          maxLength={10000}
          aria-describedby="bio-help"
          value={bioMarkdown}
          onChange={(event) => setBioMarkdown(event.target.value)}
        />
        <p id="bio-help" className="caption">
          最多 10,000 UTF-8 字节；不支持 H1、HTML、MDX 或外部图片。
        </p>
      </div>
      <ErrorNotice error={save.error} />
      {save.isSuccess && <p role="status">个人资料已保存。</p>}
      <Button type="submit" disabled={save.isPending}>
        保存个人资料
      </Button>
    </form>
  );
}

export default function MyProfile() {
  const me = useMe();
  return (
    <>
      <h1>个人资料</h1>
      <ProfileForm profile={me.profile} />
    </>
  );
}
