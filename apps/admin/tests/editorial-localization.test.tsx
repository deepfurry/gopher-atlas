// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { backend, content, me, mount } from './fixtures';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it.each(['curated_article', 'topic'] as const)(
  'preserves %s bilingual textareas, selection and one snapshot queue across language/focus switches',
  async (type) => {
    const state = backend(content(type, true), me('admin'));
    mount();
    await screen.findByLabelText('标题');
    const zh = screen.getByLabelText('Markdown 源码') as HTMLTextAreaElement;
    fireEvent.focus(zh);
    zh.setSelectionRange(2, 5);
    zh.scrollTop = 30;
    fireEvent.click(screen.getByRole('tab', { name: 'English' }));
    const en = screen.getByLabelText(
      'English Markdown 源码',
    ) as HTMLTextAreaElement;
    fireEvent.change(screen.getByLabelText('英文标题'), {
      target: { value: 'English title' },
    });
    fireEvent.change(screen.getByLabelText('英文摘要'), {
      target: { value: 'English summary' },
    });
    fireEvent.change(en, {
      target: { value: '## English\n\nEnglish rationale' },
    });
    expect(
      screen
        .getByRole('switch', { name: '发布英文版本' })
        .getAttribute('aria-checked'),
    ).toBe('false');
    fireEvent.focus(en);
    en.setSelectionRange(3, 8);
    en.scrollTop = 20;
    fireEvent.click(screen.getByRole('button', { name: '进入专注模式' }));
    fireEvent.click(screen.getByRole('button', { name: '中文' }));
    expect(screen.getByLabelText('Markdown 源码')).toBe(zh);
    expect([zh.selectionStart, zh.selectionEnd, zh.scrollTop]).toEqual([
      2, 5, 30,
    ]);
    expect(
      screen.getByRole('dialog', { name: 'Markdown 专注模式' }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByLabelText('English Markdown 源码')).toBe(en);
    expect(document.activeElement).toBe(en);
    expect([en.selectionStart, en.selectionEnd, en.scrollTop]).toEqual([
      3, 8, 20,
    ]);
    fireEvent.keyDown(en, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await waitFor(() => expect(state.content.draft!.version).toBe(6));
    const saved = await state.requests
      .filter((r) => r.method === 'PUT')
      .at(-1)!
      .clone()
      .json();
    expect(saved.editorialEn.title).toBe('English title');
    expect(saved.editorialEn.bodyMarkdown).toContain('English rationale');
    expect(saved.bodyMarkdown).toBe(zh.value);
    expect(saved.editorialEn.enabled).toBe(false);
    fireEvent.click(screen.getByRole('switch', { name: '发布英文版本' }));
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await waitFor(() => expect(state.content.draft!.version).toBe(7));
    expect(state.content.draft!.editorialEn?.enabled).toBe(true);
    expect(
      screen.getByRole('region', {
        name: type === 'topic' ? '阅读路径编排' : '来源与策展',
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('tab', {
        name: type === 'topic' ? '文章编排' : '原文与策展',
      }),
    ).toBeNull();
  },
  15000,
);
