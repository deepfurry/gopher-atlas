// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  act,
} from '@testing-library/react';
import {
  MarkdownEditor,
  type MarkdownInsertion,
} from '@/features/content/markdown-editor';

afterEach(cleanup);
const image = '![图](https://assets.gopheratlas.com/example.png)';
function setup(initial: string) {
  let pending: MarkdownInsertion;
  let replace: (text: string) => void;
  let setReadOnly: (value: boolean) => void;
  function Demo() {
    const [value, setValue] = useState(initial);
    const [readOnly, updateReadOnly] = useState(false);
    setReadOnly = updateReadOnly;
    replace = setValue;
    return (
      <MarkdownEditor
        readOnly={readOnly}
        value={value}
        onChange={setValue}
        tools={(capture) => (
          <button
            onClick={() => {
              pending = capture();
            }}
          >
            选择图片
          </button>
        )}
      />
    );
  }
  const view = render(<Demo />);
  return {
    ...view,
    capture: () =>
      fireEvent.click(screen.getByRole('button', { name: '选择图片' })),
    insert: () => {
      let result = false;
      act(() => {
        result = pending.insert(image);
      });
      return result;
    },
    replace: (text: string) => act(() => replace(text)),
    readOnly: () => act(() => setReadOnly(true)),
  };
}
const source = () =>
  screen.getByLabelText('Markdown 源码') as HTMLTextAreaElement;
it.each([
  ['source', 'alpha\n\nbeta', 0, 0, `${image}\n\nalpha\n\nbeta`],
  ['source', 'alpha\n\nbeta', 2, 2, `al\n\n${image}\n\npha\n\nbeta`],
  ['source', 'alpha\n\nbeta', 11, 11, `alpha\n\nbeta\n\n${image}\n`],
  ['source', 'alpha\n\nbeta\n\ngamma', 2, 9, `al\n\n${image}\n\nta\n\ngamma`],
  ['source', '', 0, 0, `${image}\n`],
  ['split', 'alpha\n\nbeta', 7, 11, `alpha\n\n${image}\n`],
] as const)(
  'inserts at the captured %s selection in %j (%i–%i)',
  (mode, initial, start, end, expected) => {
    const editor = setup(initial);
    if (mode === 'split')
      fireEvent.click(screen.getByRole('tab', { name: '分栏' }));
    const textarea = source();
    fireEvent.focus(textarea);
    textarea.setSelectionRange(start, end);
    editor.capture();
    // Moving focus/selection after opening the picker cannot replace the capture.
    textarea.setSelectionRange(initial.length, initial.length);
    expect(editor.insert()).toBe(true);
    expect(source().value).toBe(expected);
    expect(source().selectionStart).toBe(source().selectionEnd);
    expect(source().value.slice(0, source().selectionStart)).toContain(image);
    expect(editor.insert()).toBe(false);
  },
);
it.each(['source', 'split'])(
  'keeps the %s textarea, selection, scroll and capture across focus toggles',
  (mode) => {
    const editor = setup('alpha beta gamma');
    if (mode === 'split')
      fireEvent.click(screen.getByRole('tab', { name: '分栏' }));
    const textarea = source();
    fireEvent.focus(textarea);
    textarea.setSelectionRange(6, 10);
    textarea.scrollTop = 40;
    editor.capture();
    fireEvent.click(screen.getByRole('button', { name: '进入专注模式' }));
    expect(source()).toBe(textarea);
    expect([
      textarea.selectionStart,
      textarea.selectionEnd,
      textarea.scrollTop,
    ]).toEqual([6, 10, 40]);
    expect(
      screen
        .getByRole('button', { name: '退出专注模式' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    fireEvent.keyDown(textarea, { key: 'Escape' });
    expect(source()).toBe(textarea);
    expect([
      textarea.selectionStart,
      textarea.selectionEnd,
      textarea.scrollTop,
    ]).toEqual([6, 10, 40]);
    expect(document.activeElement).toBe(textarea);
    expect(editor.insert()).toBe(true);
    expect(textarea.value).toBe(`alpha \n\n${image}\n\n gamma`);
  },
);
it('retains Preview mode and rejects a changed body capture while focused', () => {
  const editor = setup('original');
  editor.capture();
  fireEvent.click(screen.getByRole('button', { name: '进入专注模式' }));
  editor.replace('new body');
  expect(editor.insert()).toBe(false);
  fireEvent.click(screen.getByRole('tab', { name: '预览' }));
  const preview = screen.getByRole('region', { name: 'Markdown 预览' });
  fireEvent.click(screen.getByRole('button', { name: '退出专注模式' }));
  expect(screen.getByRole('region', { name: 'Markdown 预览' })).toBe(preview);
  expect(screen.queryByLabelText('Markdown 源码')).toBeNull();
});
it.each(['exit', 'unmount', 'readOnly'])(
  'contains keyboard focus and restores background isolation on %s',
  (action) => {
    const editor = setup('original');
    const background = document.createElement('button');
    background.textContent = 'Background';
    document.body.append(background);
    const overflow = document.body.style.overflow;
    fireEvent.click(screen.getByRole('button', { name: '进入专注模式' }));
    expect(background.hasAttribute('inert')).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(source(), { key: 'Tab' });
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: '选择图片' }),
    );
    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(source());
    if (action === 'unmount') editor.unmount();
    else if (action === 'readOnly') editor.readOnly();
    else fireEvent.click(screen.getByRole('button', { name: '退出专注模式' }));
    expect(background.hasAttribute('inert')).toBe(false);
    expect(document.body.style.overflow).toBe(overflow);
    if (action === 'readOnly')
      expect(screen.queryByRole('button', { name: '进入专注模式' })).toBeNull();
    background.remove();
  },
);
it.each(['source', 'preview'])(
  'predictably appends without a source selection in %s',
  (mode) => {
    const editor = setup('original');
    if (mode === 'preview')
      fireEvent.click(screen.getByRole('tab', { name: '预览' }));
    editor.capture();
    expect(editor.insert()).toBe(true);
    if (mode === 'preview')
      fireEvent.click(screen.getByRole('tab', { name: '源码' }));
    expect(source().value).toBe(`original\n\n${image}\n`);
  },
);
it.each(['body', 'preview', 'split', 'unmount'])(
  'rejects a stale capture after %s changes',
  (change) => {
    const editor = setup('original');
    fireEvent.focus(source());
    source().setSelectionRange(0, 3);
    editor.capture();
    if (change === 'body') editor.replace('new document');
    else if (change === 'unmount') editor.unmount();
    else
      fireEvent.click(
        screen.getByRole('tab', { name: change === 'split' ? '分栏' : '预览' }),
      );
    expect(editor.insert()).toBe(false);
    if (change !== 'unmount') {
      fireEvent.click(screen.getByRole('tab', { name: '源码' }));
      expect(source().value).toBe(
        change === 'body' ? 'new document' : 'original',
      );
    }
  },
);
