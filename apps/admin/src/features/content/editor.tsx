import { useEffect, useState, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { validateMarkdown } from '@gopheratlas/markdown';
import { APIError, ErrorNotice } from '@/shared/api';
import { ContentStatus, date, types } from '@/shared/status';
import { MarkdownPreview } from '@/shared/markdown';
import { useConfirm } from '@/shared/confirm';
import { useEditorialRefresh } from '@/shared/query';
import { Button } from '@/components/ui/button';
import {
  action,
  contentKey,
  getContent,
  saveDraft,
  snapshot,
  type Action,
  type Content,
} from './api';
import { AutosaveQueue } from './autosave';
import { draftSchema, formValues, Metadata, type FormValues } from './form';
import { MarkdownEditor } from './markdown-editor';
import { RevisionView } from './revision-view';
import { RevisionHistory, RouteHistory } from './history';
import { UnsavedGuard } from './unsaved';
const confirmations: Partial<
  Record<Action, { title: string; description: string; confirm: string }>
> = {
  direct: {
    title: 'Direct publish in CMS?',
    description:
      'Bypasses review. Creates and publishes a new immutable Revision in CMS. This does not make the public site live.',
    confirm: 'Publish in CMS',
  },
  unpublish: {
    title: 'Unpublish in CMS?',
    description:
      'Clears the published pointer and pending review. Revision and route history are preserved.',
    confirm: 'Unpublish',
  },
  archive: {
    title: 'Archive content?',
    description:
      'Unpublishes in CMS, clears pending review, and preserves revisions and permanent routes.',
    confirm: 'Archive',
  },
  'restore-archive': {
    title: 'Restore archive?',
    description:
      'Returns the content to Draft. It does not republish any Revision.',
    confirm: 'Restore archive',
  },
};
export default function ContentEditor() {
  const id = Number(useParams().id);
  const query = useQuery({
    queryKey: contentKey(id),
    queryFn: ({ signal }) => getContent(id, signal),
    retry: false,
  });
  return query.data ? (
    <EditorSession key={id} content={query.data} />
  ) : (
    <>
      <ErrorNotice error={query.error} />
      {query.isPending && <p role="status">Loading Draft…</p>}
    </>
  );
}
export function EditorSession({ content }: { content: Content }) {
  const [epoch, setEpoch] = useState(0);
  const [current, setCurrent] = useState(content);
  useEffect(() => setCurrent(content), [content]);
  const restored = (result: Content) => {
    setCurrent(result);
    setEpoch((value) => value + 1);
  };
  return <DraftWorkspace key={epoch} content={current} reload={restored} />;
}
function DraftWorkspace({
  content,
  reload,
}: {
  content: Content;
  reload: (value: Content) => void;
}) {
  const cache = useQueryClient();
  const confirm = useConfirm();
  const refresh = useEditorialRefresh();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [inspecting, setInspecting] = useState(false);
  const initial = content.draft;
  const empty = {
    title: '',
    slug: '',
    summary: '',
    bodyMarkdown: '',
    bylineUserId: content.ownerUserId,
    language: '',
    featured: false,
    seoTitle: '',
    seoDescription: '',
    payload: {},
    tagIds: [],
    topicEntries: [],
  };
  const form = useForm<FormValues>({
    defaultValues: formValues(initial ? snapshot(initial) : empty),
    resolver: zodResolver(draftSchema),
  });
  const values = useWatch({ control: form.control }) as FormValues;
  const [queue] = useState(
    () =>
      new AutosaveQueue<FormValues>(
        form.getValues(),
        initial?.version ?? 0,
        async (value, version) => {
          if (!draftSchema.safeParse(value).success) {
            await form.trigger();
            throw new APIError('validation_failed', 'Invalid form');
          }
          if (validateMarkdown(value.bodyMarkdown).length)
            throw new APIError('invalid_markdown', 'Unsafe Markdown');
          const result = await saveDraft(content.id, value, version);
          void cache.invalidateQueries({ queryKey: contentKey(content.id) });
          void cache.invalidateQueries({ queryKey: ['content', 'list'] });
          return result;
        },
        initial?.updatedAt,
      ),
  );
  const save = useSyncExternalStore(queue.subscribe, queue.getSnapshot);
  useEffect(() => {
    queue.activate();
    return () => queue.dispose();
  }, [queue]);
  useEffect(
    () => queue.setEnabled(content.actions.editDraft),
    [content.actions.editDraft, queue],
  );
  useEffect(() => {
    queue.update(values);
  }, [values, queue]);
  const flush = async () => {
    queue.update(form.getValues());
    return queue.flush();
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (content.actions.editDraft && !busy) {
          queue.update(form.getValues());
          void queue.flush().catch(() => {});
        }
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [queue, form, content.actions.editDraft, busy]);
  useEffect(() => {
    const expired = () => queue.setEnabled(false);
    window.addEventListener('cms-auth-expired', expired);
    return () => window.removeEventListener('cms-auth-expired', expired);
  }, [queue]);
  const perform = async (kind: Action) => {
    setBusy(true);
    setError(null);
    try {
      let version = save.version;
      // Every transition of an editable Draft first drains the same save queue.
      if (content.actions.editDraft) version = await flush();
      const question = confirmations[kind];
      if (question && !(await confirm(question))) return;
      const result = await action(content.id, kind, version);
      cache.setQueryData(contentKey(content.id), result);
      reload(result);
      await refresh();
      toast.success(
        kind === 'direct' ? 'Published in CMS.' : 'Workflow updated.',
      );
    } catch (error) {
      if (
        error instanceof APIError &&
        error.code === 'content_version_conflict'
      )
        queue.conflict(error);
      setError(error);
    } finally {
      setBusy(false);
    }
  };
  const reloadServer = async () => {
    if (
      !(await confirm({
        title: 'Reload server version?',
        description:
          'Your local unsaved edits will be discarded. Copy them first if you need to keep them.',
        confirm: 'Reload server version',
      }))
    )
      return;
    try {
      const result = await getContent(content.id);
      cache.setQueryData(contentKey(content.id), result);
      reload(result);
    } catch (error) {
      setError(error);
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(form.getValues('bodyMarkdown'));
      toast.success('Local Markdown copied.');
    } catch {
      setError(new Error('Clipboard unavailable'));
      setInspecting(true);
    }
  };
  const locked = !content.actions.editDraft;
  return (
    <>
      <div className="editor-header">
        <div>
          <p className="caption">{types[content.type]} · CONTENT</p>
          <h1>{values.title || content.title || 'Untitled'}</h1>
          <ContentStatus content={content} />
        </div>
        <div className="workflow-actions toolbar">
          {content.actions.editDraft && (
            <Button
              variant="outline"
              disabled={busy || save.status === 'conflict'}
              onClick={() => void flush().catch(() => {})}
            >
              Save · ⌘/Ctrl S
            </Button>
          )}
          {content.actions.submitReview && (
            <Button
              disabled={busy || save.status === 'conflict'}
              onClick={() => void perform('submit-review')}
            >
              Submit for review
            </Button>
          )}
          {content.actions.withdrawReview && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void perform('withdraw-review')}
            >
              Withdraw review
            </Button>
          )}
          {content.actions.directPublish && (
            <Button
              variant="outline"
              disabled={busy || save.status === 'conflict'}
              onClick={() => void perform('direct')}
            >
              Direct publish in CMS
            </Button>
          )}
          {content.actions.unpublish && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void perform('unpublish')}
            >
              Unpublish
            </Button>
          )}
          {content.actions.archive && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void perform('archive')}
            >
              Archive
            </Button>
          )}
          {content.actions.restoreArchive && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void perform('restore-archive')}
            >
              Restore archive
            </Button>
          )}
        </div>
      </div>
      <p className="autosave-status caption" aria-live="polite">
        {locked
          ? 'Read-only'
          : save.status === 'saved'
            ? 'All changes saved'
            : save.status === 'pending'
              ? 'Unsaved changes · waiting to save'
              : save.status === 'saving'
                ? 'Saving…'
                : save.status === 'conflict'
                  ? 'Conflict · autosave paused'
                  : 'Save failed · autosave paused'}
        {save.lastSaved
          ? ` · Last saved ${date(save.lastSaved)} · version ${save.version}`
          : ''}
      </p>
      <ErrorNotice error={error} />
      <ErrorNotice error={save.error} />
      {save.status === 'conflict' && (
        <section className="conflict-panel" aria-label="Draft version conflict">
          <h2>Another session changed this Draft.</h2>
          <p>
            Your local text is preserved in memory. Automatic retries are
            paused.
          </p>
          <div className="toolbar">
            <Button variant="outline" onClick={() => void reloadServer()}>
              Reload server version
            </Button>
            <Button variant="outline" onClick={() => void copy()}>
              Copy my local Markdown
            </Button>
            <Button
              variant="outline"
              onClick={() => setInspecting(!inspecting)}
            >
              Cancel / inspect local content
            </Button>
          </div>
          {inspecting && (
            <textarea
              aria-label="Local Markdown to copy"
              readOnly
              value={form.getValues('bodyMarkdown')}
              rows={10}
            />
          )}
        </section>
      )}
      {content.editorialState === 'changes_requested' &&
        content.latestReview?.decision === 'changes_requested' && (
          <section className="review-feedback">
            <h2>
              Changes requested · Revision {content.latestReview.revisionNo}
            </h2>
            <MarkdownPreview source={content.latestReview.commentMarkdown} />
          </section>
        )}
      {locked && content.pendingRevision ? (
        <RevisionView revision={content.pendingRevision} type={content.type} />
      ) : (
        <FormProvider {...form}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void flush().catch(() => {});
            }}
          >
            <fieldset disabled={busy || locked} className="editor-fieldset">
              <div className="editor-layout">
                <MarkdownEditor
                  value={values.bodyMarkdown ?? ''}
                  onChange={(value) =>
                    form.setValue('bodyMarkdown', value, { shouldDirty: true })
                  }
                  readOnly={locked}
                />
                <Metadata content={content} />
              </div>
            </fieldset>
            {Object.keys(form.formState.errors).length > 0 && (
              <p className="error-message" role="alert">
                Check metadata fields before saving.
              </p>
            )}
          </form>
        </FormProvider>
      )}
      <UnsavedGuard
        dirty={save.dirty}
        saving={save.inFlight}
        save={flush}
        discard={() => queue.setEnabled(false)}
      />
      <RevisionHistory
        content={content}
        flush={flush}
        busy={busy || save.status === 'conflict'}
        onBusyChange={setBusy}
        onConflict={(error) => queue.conflict(error)}
        onRestored={reload}
      />
      <RouteHistory id={content.id} />
    </>
  );
}
