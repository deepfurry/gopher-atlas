import { useState } from 'react';
import MDEditor, { commands } from '@uiw/react-md-editor/nohighlight';
import {
  MarkdownFeedback,
  MarkdownPreview,
  useDebounced,
} from '@/shared/markdown';
import { useTheme } from '@/app/theme';
import { Button } from '@/components/ui/button';
const toolbar = [
  commands.heading2,
  commands.heading3,
  commands.bold,
  commands.italic,
  commands.code,
  commands.codeBlock,
  commands.quote,
  commands.unorderedListCommand,
  commands.orderedListCommand,
  commands.checkedListCommand,
  commands.link,
  commands.table,
];
const extra: typeof toolbar = [];
export function MarkdownEditor({
  value,
  onChange,
  readOnly = false,
}: {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}) {
  const [mode, setMode] = useState<'Source' | 'Preview' | 'Split'>('Source');
  const stable = useDebounced(value);
  const { resolved } = useTheme();
  return (
    <section
      className="markdown-editor"
      aria-label="Markdown editor"
      data-color-mode={resolved}
    >
      <div className="toolbar" role="group" aria-label="Editor mode">
        {(['Source', 'Preview', 'Split'] as const).map((item) => (
          <Button
            key={item}
            variant="outline"
            aria-pressed={mode === item}
            onClick={() => setMode(item)}
          >
            {item}
          </Button>
        ))}
      </div>
      <div className={`editor-panes mode-${mode.toLowerCase()}`}>
        {mode !== 'Preview' && (
          <MDEditor
            value={value}
            onChange={(text) => {
              if (!readOnly) onChange(text ?? '');
            }}
            preview="edit"
            commands={toolbar}
            extraCommands={extra}
            height={520}
            minHeight={300}
            visibleDragbar={false}
            highlightEnable={false}
            hideToolbar={readOnly}
            textareaProps={{
              'aria-label': 'Markdown source',
              readOnly,
              spellCheck: false,
            }}
          />
        )}
        {mode !== 'Source' && (
          <section aria-label="Markdown preview">
            <MarkdownPreview source={stable} />
          </section>
        )}
      </div>
      <MarkdownFeedback source={value} />
    </section>
  );
}
