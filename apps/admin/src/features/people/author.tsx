import { useState } from 'react';
import { useParams, Link } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useMe } from '@/app/context';
import { client, unwrap, ErrorNotice, type Schema } from '@/shared/api';
import { MarkdownPreview, MarkdownFeedback } from '@/shared/markdown';
import { isSafeLink } from '@gopheratlas/markdown';
import { Button } from '@/components/ui/button';
function AuthorEdit({ author }: { author: Schema<'AuthorDetail'> }) {
  const cache = useQueryClient();
  const [displayName, setName] = useState(author.displayName);
  const [bioMarkdown, setBio] = useState(author.bioMarkdown);
  const [websiteUrl, setWebsite] = useState(author.websiteUrl);
  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await client.PUT('/api/admin/v1/authors/{id}/profile', {
          params: { path: { id: author.userId } },
          body: { displayName, bioMarkdown, websiteUrl },
        }),
      ),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['authors'] });
      void cache.invalidateQueries({ queryKey: ['me'] });
      toast.success('Author profile saved.');
    },
  });
  return (
    <form
      className="compact-form"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <h2>Edit author profile</h2>
      <label>
        Display name
        <input
          required
          maxLength={100}
          value={displayName}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        Website
        <input
          type="url"
          maxLength={2048}
          value={websiteUrl}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </label>
      <label>
        Bio Markdown
        <textarea
          rows={6}
          maxLength={10000}
          value={bioMarkdown}
          onChange={(e) => setBio(e.target.value)}
        />
      </label>
      <MarkdownFeedback source={bioMarkdown} />
      <ErrorNotice error={save.error} />
      <Button type="submit" disabled={save.isPending}>
        Save author profile
      </Button>
    </form>
  );
}
export default function Author() {
  const id = Number(useParams().id);
  const me = useMe();
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
  return (
    <>
      <ErrorNotice error={query.error} />
      {query.data && (
        <>
          <p className="caption">AUTHOR PROFILE · {query.data.slug}</p>
          <h1>{query.data.displayName}</h1>
          <MarkdownPreview source={query.data.bioMarkdown} />
          {query.data.websiteUrl && isSafeLink(query.data.websiteUrl) && (
            <a
              href={query.data.websiteUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              Author website
            </a>
          )}
          {me.permissions.manageAuthorProfiles ? (
            <AuthorEdit key={id} author={query.data} />
          ) : me.user.id === id ? (
            <p>
              <Link to="/profile">Edit My Profile</Link>
            </p>
          ) : null}
        </>
      )}
    </>
  );
}
