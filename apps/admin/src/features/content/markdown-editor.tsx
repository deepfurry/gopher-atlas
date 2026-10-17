import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import MDEditor, {
  commands,
  type RefMDEditor,
} from '@uiw/react-md-editor/nohighlight';
import {
  TextHTwo,
  TextHThree,
  TextB,
  TextItalic,
  Code,
  CodeBlock,
  Quotes,
  ListBullets,
  ListNumbers,
  ListChecks,
  LinkSimple,
  Table,
  CodeSimple,
  Eye,
  Columns,
  ArrowsOut,
  ArrowsIn,
} from '@phosphor-icons/react';
import { MarkdownFeedback, MarkdownPreview } from '@/shared/markdown';
import { useDebounced } from '@/hooks/use-debounced';
import { useTheme } from '@/app/theme';
import { Tabs, TabPanel } from '@/components/ui/tabs';
import { IconButton } from '@/components/ui/button';
import type { SaveStatus } from './autosave';
import { useWritingFocus } from './use-writing-focus';
const saveLabels: Record<SaveStatus, string> = {
  saved: '已保存',
  pending: '等待保存',
  saving: '正在保存',
  error: '保存失败 · 请退出专注模式查看原因',
  conflict: '版本冲突 · 请退出专注模式处理',
};
const toolbar = [
  [commands.heading2, '二级标题', TextHTwo],
  [commands.heading3, '三级标题', TextHThree],
  [commands.bold, '加粗', TextB],
  [commands.italic, '斜体', TextItalic],
  [commands.code, '行内代码', Code],
  [commands.codeBlock, '代码块', CodeBlock],
  [commands.quote, '引用', Quotes],
  [commands.unorderedListCommand, '无序列表', ListBullets],
  [commands.orderedListCommand, '有序列表', ListNumbers],
  [commands.checkedListCommand, '任务列表', ListChecks],
  [commands.link, '插入链接', LinkSimple],
  [commands.table, '插入表格', Table],
].map(([command, label, Icon]) => ({
  ...(command as typeof commands.bold),
  name: (command as typeof commands.bold).name,
  icon: (() => {
    const Component = Icon as typeof TextB;
    return <Component />;
  })(),
  buttonProps: { 'aria-label': label as string, title: label as string },
}));
const extra: typeof toolbar = [];
export type MarkdownInsertion = {
  atEnd: boolean;
  insert: (markdown: string) => boolean;
};
export function MarkdownEditor({
  value,
  onChange,
  readOnly = false,
  tools,
  saveStatus,
}: {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  tools?: (capture: () => MarkdownInsertion) => ReactNode;
  saveStatus?: SaveStatus;
}) {
  const [mode, setMode] = useState('source'),
    stable = useDebounced(value),
    { resolved } = useTheme();
  const editor = useRef<RefMDEditor>(null);
  const focus = useWritingFocus(editor, readOnly);
  const visited = useRef<HTMLTextAreaElement | null>(null);
  const revision = useRef(0);
  useLayoutEffect(() => {
    revision.current++;
    return () => {
      revision.current++;
    };
  }, [value, mode, readOnly]);
  const capture = (): MarkdownInsertion => {
    const textarea = editor.current?.textarea;
    const api = editor.current?.commandOrchestrator?.textApi;
    const atEnd = !textarea || visited.current !== textarea;
    const start = atEnd ? value.length : textarea.selectionStart;
    const end = atEnd ? value.length : textarea.selectionEnd;
    const capturedRevision = revision.current;
    let consumed = false;
    return {
      atEnd,
      insert(markdown) {
        if (consumed || readOnly || capturedRevision !== revision.current)
          return false;
        consumed = true;
        if (
          textarea &&
          (!textarea.isConnected ||
            textarea !== editor.current?.textarea ||
            textarea.value !== value ||
            textarea.matches(':disabled'))
        )
          return false;
        const before = value.slice(0, start),
          after = value.slice(end);
        // Put the image on its own paragraph without changing either surrounding slice.
        const leading = before
          ? '\n'.repeat(
              Math.max(0, 2 - (before.match(/\n*$/)?.[0].length ?? 0)),
            )
          : '';
        const trailing = '\n'.repeat(
          Math.max(0, (after ? 2 : 1) - (after.match(/^\n*/)?.[0].length ?? 0)),
        );
        const text = `${leading}${markdown}${trailing}`;
        if (textarea && api) {
          // UIW 4.1.2 uses native insertText (undoable) with setRangeText fallback.
          // Run after the dialog closes so its focus trap cannot steal this focus.
          api.setSelectionRange({ start, end });
          api.replaceSelection(text);
        } else {
          onChange(`${before}${text}${after}`);
        }
        return true;
      },
    };
  };
  const source = (
    <MDEditor
      ref={editor}
      value={value}
      onChange={(text) => {
        if (!readOnly) onChange(text ?? '');
      }}
      preview="edit"
      commands={toolbar}
      extraCommands={extra}
      height="100%"
      minHeight={0}
      visibleDragbar={false}
      highlightEnable={false}
      hideToolbar={readOnly}
      textareaProps={{
        'aria-label': 'Markdown 源码',
        readOnly,
        spellCheck: false,
        placeholder: '从这里开始写作…',
        onFocus: (event) => {
          visited.current = event.currentTarget;
        },
      }}
    />
  );
  const preview = (
    <section aria-label="Markdown 预览">
      <MarkdownPreview source={stable} />
    </section>
  );
  return (
    <section
      ref={focus.root}
      className="markdown-editor"
      role={focus.focused ? 'dialog' : undefined}
      aria-modal={focus.focused || undefined}
      aria-label={focus.focused ? 'Markdown 专注模式' : 'Markdown 编辑器'}
      data-focus-mode={focus.focused || undefined}
      onKeyDown={focus.onKeyDown}
      data-color-mode={resolved}
    >
      <div className="markdown-tools">
        {tools?.(capture)}
        <div className="markdown-tool-status">
          <span className="caption">
            {new TextEncoder().encode(value).length.toLocaleString('zh-CN')}{' '}
            字节
          </span>
          {focus.focused && saveStatus && (
            <span
              role="status"
              className={`focus-save-status caption save-${saveStatus}`}
            >
              {saveLabels[saveStatus]}
            </span>
          )}
          {!readOnly && (
            <IconButton
              ref={focus.button}
              label={focus.focused ? '退出专注模式' : '进入专注模式'}
              title={focus.focused ? '退出专注模式（Esc）' : '进入专注模式'}
              aria-pressed={focus.focused}
              onPointerDown={(event) => {
                if (document.activeElement === editor.current?.textarea)
                  event.preventDefault();
              }}
              onClick={focus.toggle}
            >
              {focus.focused ? <ArrowsIn /> : <ArrowsOut />}
            </IconButton>
          )}
        </div>
      </div>
      <Tabs
        className="markdown-modes"
        label="编辑模式"
        value={mode}
        onValueChange={setMode}
        items={[
          { value: 'source', label: '源码', icon: <CodeSimple /> },
          { value: 'preview', label: '预览', icon: <Eye /> },
          { value: 'split', label: '分栏', icon: <Columns /> },
        ]}
      >
        <TabPanel value="source">
          <div className="editor-panes mode-source">{source}</div>
        </TabPanel>
        <TabPanel value="preview">
          <div className="editor-panes mode-preview">{preview}</div>
        </TabPanel>
        <TabPanel value="split">
          <div className="editor-panes mode-split">
            {source}
            {preview}
          </div>
        </TabPanel>
      </Tabs>
      <MarkdownFeedback source={value} />
    </section>
  );
}
