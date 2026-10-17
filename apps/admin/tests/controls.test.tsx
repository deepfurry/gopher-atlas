// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TagSelect } from '@/features/content/selectors';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { Select } from '@/components/ui/select';
import { Checkbox, Switch } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// 120 Base UI checkboxes plus debounced server pages exceed 5s under parallel CI.
it('keeps paged tags unique, searches server pages and enforces 100 without blocking deselection', async () => {
  const tags = Array.from({ length: 120 }, (_, i) => ({
    id: i + 1,
    name: `标签 ${i + 1}`,
    slug: `tag-${i + 1}`,
    description: '',
    nameEn: '',
    descriptionEn: '',
    createdBy: 1,
    createdAt: 1,
    updatedAt: 1,
  }));
  const requests: number[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (request: Request) => {
      const after = Number(new URL(request.url).searchParams.get('after') || 0);
      requests.push(after);
      const q = new URL(request.url).searchParams.get('q') || '';
      if (q)
        return Response.json({
          items: tags.filter((tag) => `${tag.name} ${tag.slug}`.includes(q)),
          nextCursor: null,
        });
      return Response.json({
        items: tags.slice(after, after + 60),
        nextCursor: after === 0 ? 60 : null,
      });
    }),
  );
  function Demo() {
    const [value, setValue] = useState([
      ...Array.from({ length: 99 }, (_, i) => i + 1),
      118,
    ]);
    return (
      <TagSelect value={value} onChange={setValue} selected={[tags[117]!]} />
    );
  }
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <Demo />
    </QueryClientProvider>,
  );
  await screen.findByRole('checkbox', { name: '标签 60' });
  expect(screen.getByText('已选择 100 / 100')).toBeTruthy();
  expect(screen.getAllByRole('checkbox')).toHaveLength(61);
  fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
  const next = await screen.findByRole('checkbox', {
    name: '标签 100',
  });
  expect(screen.getAllByRole('checkbox')).toHaveLength(120);
  expect(next.getAttribute('aria-disabled')).toBe('true');
  fireEvent.click(screen.getByRole('checkbox', { name: '标签 1' }));
  expect(screen.getByText('已选择 99 / 100')).toBeTruthy();
  fireEvent.click(next);
  expect(screen.getByText('已选择 100 / 100')).toBeTruthy();
  fireEvent.change(screen.getByRole('searchbox'), {
    target: { value: 'tag-118' },
  });
  await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(1));
  expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe(
    'true',
  );
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
  await waitFor(() =>
    expect(screen.getAllByRole('checkbox')).toHaveLength(120),
  );
  expect(requests.slice(0, 3)).toEqual([0, 60, 0]);
  expect(
    screen.queryByText('搜索范围为已加载标签，可继续加载更多。'),
  ).toBeNull();
}, 15000);

it('supports keyboard selection and accessible labels with Base UI', async () => {
  function Demo() {
    const [value, setValue] = useState('draft');
    return (
      <Select
        label="编辑状态"
        value={value}
        onValueChange={setValue}
        options={[
          { value: 'draft', label: '草稿' },
          { value: 'review', label: '审核中' },
        ]}
      />
    );
  }
  render(<Demo />);
  const trigger = screen.getByRole('combobox', { name: '编辑状态' });
  fireEvent.click(trigger);
  const list = await screen.findByRole('listbox');
  const option = within(list).getByRole('option', { name: '审核中' });
  fireEvent.pointerDown(option, { pointerType: 'mouse' });
  fireEvent.click(option);
  expect(trigger.textContent).toContain('审核中');
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  await screen.findByRole('listbox');
  fireEvent.keyDown(screen.getByRole('option', { name: '审核中' }), {
    key: 'Escape',
  });
  await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
});

it('uses Chinese checkbox and switch names without default browser controls', () => {
  function Demo() {
    const [checked, setChecked] = useState(false);
    return (
      <>
        <Checkbox
          label="包含归档"
          checked={checked}
          onCheckedChange={setChecked}
        />
        <Switch
          label="重点推荐"
          checked={checked}
          onCheckedChange={setChecked}
        />
      </>
    );
  }
  render(<Demo />);
  fireEvent.click(screen.getByRole('checkbox', { name: '包含归档' }));
  expect(
    screen
      .getByRole('switch', { name: '重点推荐' })
      .getAttribute('aria-checked'),
  ).toBe('true');
});

it('selects exact calendar dates and moves focus with arrow keys', async () => {
  function Demo() {
    const [value, setValue] = useState('2026-09-12');
    return (
      <DatePicker label="原文发布日期" value={value} onValueChange={setValue} />
    );
  }
  render(<Demo />);
  fireEvent.click(screen.getByRole('button', { name: '原文发布日期' }));
  const today = await screen.findByRole('button', {
    name: '2026年9月12日星期六',
  });
  today.focus();
  fireEvent.keyDown(today, { key: 'ArrowRight' });
  const next = screen.getByRole('button', { name: '2026年9月13日星期日' });
  await waitFor(() => expect(document.activeElement).toBe(next));
  fireEvent.click(next);
  expect(
    screen.getByRole('button', { name: '原文发布日期' }).textContent,
  ).toContain('2026-09-13');
  fireEvent.click(screen.getByRole('button', { name: '原文发布日期' }));
  fireEvent.click(await screen.findByRole('button', { name: '清除日期' }));
  expect(
    screen.getByRole('button', { name: '原文发布日期' }).textContent,
  ).toContain('选择日期');
});

it('gives dialogs an accessible title and explicit cancel path', async () => {
  function Demo() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>新建标签</Button>
        <Dialog
          open={open}
          onOpenChange={setOpen}
          title="新建标签"
          description="填写标签信息。"
          footer={<Button onClick={() => setOpen(false)}>取消</Button>}
        >
          <label>
            名称
            <input />
          </label>
        </Dialog>
      </>
    );
  }
  render(<Demo />);
  fireEvent.click(screen.getByRole('button', { name: '新建标签' }));
  const dialog = await screen.findByRole('dialog', { name: '新建标签' });
  expect(within(dialog).getByLabelText('名称')).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});
