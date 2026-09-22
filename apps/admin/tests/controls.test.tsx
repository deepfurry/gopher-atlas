// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, expect, it } from 'vitest';
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
afterEach(cleanup);

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
