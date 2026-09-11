import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useMe } from '@/app/context';
import {
  client,
  unwrap,
  ErrorNotice,
  NoAccess,
  type Schema,
} from '@/shared/api';
import { usePages } from '@/shared/query';
import { LoadMore } from '@/shared/pagination';
import { Button } from '@/components/ui/button';
const schema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z
    .string()
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().max(1000),
});
function TagForm({ tag, done }: { tag?: Schema<'Tag'>; done: () => void }) {
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: tag
      ? { name: tag.name, slug: tag.slug, description: tag.description }
      : { name: '', slug: '', description: '' },
  });
  const save = useMutation({
    mutationFn: async (body: z.infer<typeof schema>) =>
      tag
        ? unwrap(
            await client.PUT('/api/admin/v1/tags/{id}', {
              params: { path: { id: tag.id } },
              body,
            }),
          )
        : unwrap(await client.POST('/api/admin/v1/tags', { body })),
    onSuccess: () => {
      toast.success('Tag saved.');
      done();
    },
  });
  return (
    <form
      className="compact-form"
      onSubmit={form.handleSubmit((value) => save.mutate(value))}
    >
      <h2>{tag ? 'Update tag' : 'Create tag'}</h2>
      <label>
        Name
        <input {...form.register('name')} />
      </label>
      <label>
        Slug
        <input {...form.register('slug')} />
        <span className="caption">
          Name changes never change this persisted slug automatically.
        </span>
      </label>
      <label>
        Description
        <textarea rows={3} {...form.register('description')} />
      </label>
      {Object.values(form.formState.errors).map((error, i) => (
        <p className="error-message" key={i}>
          {error.message}
        </p>
      ))}
      <ErrorNotice error={save.error} />
      <div className="toolbar">
        <Button type="submit" disabled={save.isPending}>
          Save tag
        </Button>
        <Button variant="outline" onClick={done}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
export default function Tags() {
  const me = useMe();
  const cache = useQueryClient();
  const [edit, setEdit] = useState<Schema<'Tag'> | 'new' | null>(null);
  const list = usePages(
    ['tags'],
    async (after, signal) =>
      unwrap(
        await client.GET('/api/admin/v1/tags', {
          signal,
          params: { query: { after } },
        }),
      ),
    me.permissions.manageTaxonomy,
  );
  if (!me.permissions.manageTaxonomy) return <NoAccess />;
  const done = () => {
    setEdit(null);
    void cache.invalidateQueries({ queryKey: ['tags'] });
  };
  return (
    <>
      <div className="page-heading">
        <h1>Tags</h1>
        <Button onClick={() => setEdit('new')}>Create tag</Button>
      </div>
      {edit && (
        <TagForm
          key={edit === 'new' ? 'new' : edit.id}
          tag={edit === 'new' ? undefined : edit}
          done={done}
        />
      )}
      <ErrorNotice error={list.error} />
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Tags"
      >
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Slug</th>
              <th>Description</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((tag) => (
              <tr key={tag.id}>
                <td>{tag.name}</td>
                <td>{tag.slug}</td>
                <td>{tag.description}</td>
                <td>
                  <Button variant="outline" onClick={() => setEdit(tag)}>
                    Edit {tag.name}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!list.items.length && !list.isPending && <p>No tags yet.</p>}
      <LoadMore {...list} />
    </>
  );
}
