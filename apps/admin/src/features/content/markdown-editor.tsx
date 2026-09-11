import { useState, type ReactNode } from 'react';
import MDEditor, { commands } from '@uiw/react-md-editor/nohighlight';
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
} from '@phosphor-icons/react';
import { MarkdownFeedback, MarkdownPreview } from '@/shared/markdown';
import { useDebounced } from '@/hooks/use-debounced';
import { useTheme } from '@/app/theme';
import { Tabs, TabPanel } from '@/components/ui/tabs';
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
export function MarkdownEditor({
  value,
  onChange,
  readOnly = false,
  tools,
}: {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  tools?: ReactNode;
}) {
  const [mode, setMode] = useState('source'),
    stable = useDebounced(value),
    { resolved } = useTheme();
  const source = (
    <MDEditor
      value={value}
      onChange={(text) => {
        if (!readOnly) onChange(text ?? '');
      }}
      preview="edit"
      commands={toolbar}
      extraCommands={extra}
      height={560}
      minHeight={300}
      visibleDragbar={false}
      highlightEnable={false}
      hideToolbar={readOnly}
      textareaProps={{
        'aria-label': 'Markdown 源码',
        readOnly,
        spellCheck: false,
        placeholder: '从这里开始写作…',
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
      className="markdown-editor"
      aria-label="Markdown 编辑器"
      data-color-mode={resolved}
    >
      <div className="markdown-tools">
        {tools}
        <span className="caption">
          {new TextEncoder().encode(value).length.toLocaleString('zh-CN')} 字节
        </span>
      </div>
      <Tabs
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
