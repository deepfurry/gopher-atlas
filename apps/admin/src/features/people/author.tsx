import { useParams, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useMe } from '@/app/context';
import { client, unwrap, ErrorNotice } from '@/shared/api';
import { MarkdownPreview } from '@/shared/markdown';
import { isSafeLink } from '@gopheratlas/markdown';
import { PageHeader, Avatar, LoadingState } from '@/components/ui/workspace';
import { ProfileForm } from './profile';
export default function Author() {
  const id = Number(useParams().id),
    me = useMe();
  const query = useQuery({
    queryKey: ['authors', id],
    queryFn: async ({ signal }) =>
      unwrap(
        await client.GET('/api/admin/v1/authors/{id}', {
          signal,
          params: { path: { id } },
        }),
      ),
    retry: false,
  });
  const author = query.data;
  return (
    <>
      <ErrorNotice error={query.error} />
      {query.isPending && <LoadingState label="正在加载作者资料…" />}
      {author && (
        <>
          <PageHeader
            title="作者资料"
            actions={<Link to="/authors">返回作者列表</Link>}
          />
          <div className="profile-layout">
            <aside className="profile-identity">
              <Avatar
                name={author.displayName}
                url={author.avatarUrl}
                size={64}
              />
              <h2>{author.displayName}</h2>
              <p className="caption">{author.slug}</p>
              {author.websiteUrl && isSafeLink(author.websiteUrl) && (
                <a
                  href={author.websiteUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  访问个人网站 ↗
                </a>
              )}
            </aside>
            <div>
              {me.permissions.manageAuthorProfiles ? (
                <ProfileForm key={id} profile={author} authorId={id} />
              ) : (
                <>
                  <MarkdownPreview source={author.bioMarkdown} />
                  {!author.bioMarkdown && (
                    <p className="caption">作者尚未填写简介。</p>
                  )}
                  {me.user.id === id && <Link to="/profile">编辑个人资料</Link>}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
