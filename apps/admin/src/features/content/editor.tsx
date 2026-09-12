import { useEffect, useState, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useSearchParams, Link } from 'react-router';
import {
  FloppyDisk,
  PaperPlaneTilt,
  ArrowUUpLeft,
  DotsThree,
  Archive,
  UploadSimple,
  Prohibit,
  ClockCounterClockwise,
  Article,
  ArrowSquareOut,
} from '@phosphor-icons/react';
import { DropdownMenu, MenuItem, MenuSeparator } from '@/components/ui/menu';
import { Tabs, TabPanel } from '@/components/ui/tabs';
import { LoadingState } from '@/components/ui/workspace';
import { Textarea } from '@/components/ui/input';
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
import {
  draftSchema,
  formValues,
  Metadata,
  EditorTitle,
  type FormValues,
} from './form';
import { InsertImage } from '@/features/assets/editor-assets';
import { MarkdownEditor } from './markdown-editor';
import { isSafeLink } from '@gopheratlas/markdown';
import { RevisionView } from './revision-view';
import { RevisionHistory, RouteHistory } from './history';
import { UnsavedGuard } from './unsaved';
const confirmations: Partial<
  Record<
    Action,
    { title: string; description: string; confirm: string; danger?: boolean }
  >
> = {
  direct: {
    title: '直接发布到 CMS？',
    description:
      '此操作跳过审核，创建并发布一个新的固定版本，同时将公开站点构建加入队列。实际同步结果请查看发布状态。',
    confirm: '确认直接发布',
  },
  unpublish: {
    danger: true,
    title: '取消 CMS 发布？',
    description: '清除当前发布版本和待审核记录，保留历史版本与永久路径。',
    confirm: '取消发布',
  },
  archive: {
    danger: true,
    title: '归档此内容？',
    description: '取消 CMS 发布、清除待审核记录，并保留全部版本与永久路径。',
    confirm: '确认归档',
  },
  'restore-archive': {
    title: '恢复已归档内容？',
    description: '内容将恢复为草稿，不会自动重新发布历史版本。',
    confirm: '恢复归档',
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
      {query.isPending && <LoadingState label="正在加载草稿…" />}
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
  const [params] = useSearchParams();
  const [view, setView] = useState(
    params.get('view') === 'history' ? 'history' : 'draft',
  );
  const [error, setError] = useState<unknown>(null);
  const [inspecting, setInspecting] = useState(false);
  const initial = content.draft;
  const empty = {
    coverAssetId: null,
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
      toast.success(kind === 'direct' ? '已在 CMS 发布。' : '编辑流程已更新。');
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
        title: '重新加载服务器版本？',
        description:
          '此操作会替换当前页面未保存的修改。如需保留，请先复制本地内容。',
        confirm: '重新加载服务器版本',
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
      toast.success('本地 Markdown 已复制。');
    } catch {
      setError(new Error('Clipboard unavailable'));
      setInspecting(true);
    }
  };
  const locked = !content.actions.editDraft;
  const blogPreview = async () => {
    if (!import.meta.env.DEV) return;
    const preview = window.open('about:blank', '_blank');
    if (!preview) {
      toast.error('请允许此后台打开新窗口，再点击博客预览。');
      return;
    }
    preview.opener = null;
    preview.document.title = '正在准备博客预览';
    preview.document.body.textContent = '正在保存草稿并准备博客预览…';
    setBusy(true);
    setError(null);
    try {
      await flush();
      const { showSavedBlogPreview } = await import('./blog-preview');
      await showSavedBlogPreview(content.id, preview);
    } catch (error) {
      preview.close();
      setError(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <header className="editor-header">
        <div className="editor-context">
          <Link to={`/content?type=${content.type}`} className="caption">
            {types[content.type]}
          </Link>
          <span className="caption">/ {types[content.type]}</span>
          <h1>{values.title || content.title || '未命名内容'}</h1>
          <ContentStatus content={content} />
        </div>
        <div className="workflow-actions">
          {import.meta.env.DEV && content.actions.editDraft && (
            <Button
              variant="outline"
              disabled={busy || save.status === 'conflict'}
              onClick={() => void blogPreview()}
            >
              <ArrowSquareOut />
              {content.type === 'curated_article'
                ? '预览收录页'
                : content.type === 'topic'
                  ? '预览专区'
                  : '博客预览'}
            </Button>
          )}
          {content.actions.editDraft && (
            <Button
              variant="outline"
              disabled={busy || save.status === 'conflict'}
              onClick={() => void flush().catch(() => {})}
              title="Ctrl / ⌘ + S"
            >
              <FloppyDisk />
              保存
            </Button>
          )}
          {content.actions.submitReview && (
            <Button
              disabled={busy || save.status === 'conflict'}
              onClick={() => void perform('submit-review')}
            >
              <PaperPlaneTilt />
              提交审核
            </Button>
          )}
          {content.actions.withdrawReview && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void perform('withdraw-review')}
            >
              <ArrowUUpLeft />
              撤回审核
            </Button>
          )}
          {(content.actions.directPublish ||
            content.actions.unpublish ||
            content.actions.archive ||
            content.actions.restoreArchive) && (
            <DropdownMenu
              label="内容更多操作"
              trigger={
                <Button variant="outline" aria-label="内容更多操作">
                  <DotsThree />
                </Button>
              }
            >
              {content.actions.directPublish && (
                <MenuItem
                  disabled={busy || save.status === 'conflict'}
                  onClick={() => void perform('direct')}
                >
                  <UploadSimple />
                  直接发布到 CMS
                </MenuItem>
              )}
              {content.actions.unpublish && (
                <MenuItem
                  danger
                  disabled={busy}
                  onClick={() => void perform('unpublish')}
                >
                  <Prohibit />
                  取消发布
                </MenuItem>
              )}
              {(content.actions.archive || content.actions.restoreArchive) && (
                <MenuSeparator />
              )}
              {content.actions.archive && (
                <MenuItem
                  danger
                  disabled={busy}
                  onClick={() => void perform('archive')}
                >
                  <Archive />
                  归档内容
                </MenuItem>
              )}
              {content.actions.restoreArchive && (
                <MenuItem
                  disabled={busy}
                  onClick={() => void perform('restore-archive')}
                >
                  <ArrowUUpLeft />
                  恢复归档
                </MenuItem>
              )}
            </DropdownMenu>
          )}
        </div>
        <p
          className={`autosave-status caption save-${save.status}`}
          aria-live="polite"
        >
          <span className="save-indicator" />
          {locked
            ? '只读模式'
            : save.status === 'saved'
              ? '所有修改已保存'
              : save.status === 'pending'
                ? '有未保存修改，等待自动保存'
                : save.status === 'saving'
                  ? '正在保存…'
                  : save.status === 'conflict'
                    ? '版本冲突，自动保存已暂停'
                    : '保存失败，自动保存已暂停'}
          {save.lastSaved
            ? ` · ${date(save.lastSaved)} · 草稿 v${save.version}`
            : ''}
        </p>
      </header>
      <ErrorNotice error={error} />
      <ErrorNotice error={save.error} />
      {save.status === 'conflict' && (
        <section className="conflict-panel" aria-label="草稿版本冲突">
          <h2>另一会话已修改此草稿。</h2>
          <p>
            本地内容仍保留在当前页面，自动重试已暂停。请先复制需要保留的修改，再重新加载。
          </p>
          <div className="toolbar">
            <Button variant="outline" onClick={() => void reloadServer()}>
              重新加载服务器版本
            </Button>
            <Button variant="outline" onClick={() => void copy()}>
              复制本地 Markdown
            </Button>
            <Button variant="ghost" onClick={() => setInspecting(!inspecting)}>
              查看本地内容
            </Button>
          </div>
          {inspecting && (
            <Textarea
              aria-label="可复制的本地 Markdown"
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
            <h2>需要修改 · 版本 {content.latestReview.revisionNo}</h2>
            <MarkdownPreview source={content.latestReview.commentMarkdown} />
          </section>
        )}
      <Tabs
        value={view}
        onValueChange={setView}
        label="内容工作区"
        className="editor-workspace-tabs"
        items={[
          {
            value: 'draft',
            label: locked ? '查看内容' : '编辑草稿',
            icon: <Article />,
          },
          {
            value: 'history',
            label: '版本与路径',
            icon: <ClockCounterClockwise />,
          },
        ]}
      >
        <TabPanel value="draft" keepMounted>
          {locked && content.pendingRevision ? (
            <RevisionView
              revision={content.pendingRevision}
              type={content.type}
            />
          ) : (
            <FormProvider {...form}>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void flush().catch(() => {});
                }}
              >
                <fieldset disabled={busy || locked} className="editor-fieldset">
                  <div className={`editor-layout editor-${content.type}`}>
                    <div className="editor-source-column">
                      <EditorTitle type={content.type} />
                      <h2 className="editor-body-label">
                        {content.type === 'curated_article'
                          ? '收录理由 / 编辑点评'
                          : content.type === 'topic'
                            ? '专区导读'
                            : 'Markdown 正文'}
                      </h2>
                      {content.type === 'curated_article' &&
                        values.payload?.sourceUrl &&
                        /^https?:\/\//.test(values.payload.sourceUrl) &&
                        isSafeLink(values.payload.sourceUrl) && (
                          <a
                            className="text-action"
                            href={values.payload.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            打开原文 ↗
                          </a>
                        )}
                      <MarkdownEditor
                        value={values.bodyMarkdown ?? ''}
                        onChange={(value) =>
                          form.setValue('bodyMarkdown', value, {
                            shouldDirty: true,
                          })
                        }
                        readOnly={locked}
                        tools={!locked && <InsertImage />}
                      />
                    </div>
                    <Metadata content={content} />
                  </div>
                </fieldset>
                {Object.keys(form.formState.errors).length > 0 && (
                  <p className="error-message" role="alert">
                    请检查属性字段后再保存。
                  </p>
                )}
              </form>
            </FormProvider>
          )}
        </TabPanel>
        <TabPanel value="history" className="content-history-panel">
          <RevisionHistory
            content={content}
            flush={flush}
            busy={busy || save.status === 'conflict'}
            onBusyChange={setBusy}
            onConflict={(error) => queue.conflict(error)}
            onRestored={reload}
          />
          <RouteHistory id={content.id} />
        </TabPanel>
      </Tabs>
      <UnsavedGuard
        dirty={save.dirty}
        saving={save.inFlight}
        save={flush}
        discard={() => queue.setEnabled(false)}
      />
    </>
  );
}
