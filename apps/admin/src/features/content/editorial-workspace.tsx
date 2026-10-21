import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Tabs, TabPanel } from '@/components/ui/tabs';
import { Input, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { InsertImage } from '@/features/assets/editor-assets';
import { MarkdownEditor } from './markdown-editor';
import { EditorTitle, type FormValues } from './form';
import type { SaveStatus } from './autosave';

export const emptyEnglish = () => ({
  enabled: false,
  title: '',
  summary: '',
  bodyMarkdown: '',
  seoTitle: '',
  seoDescription: '',
  labels: {
    sourceAuthor: '',
    sourceName: '',
    relatedLinks: [] as { url: string; label: string }[],
  },
});

// Both textarea instances stay mounted. A language switch never rewrites another
// textarea's value or crosses native Undo histories; only the visible one owns focus.
export function EditorialWorkspace({
  type,
  saveStatus,
  readOnly,
  onLocaleChange,
}: {
  type: 'curated_article' | 'topic';
  saveStatus: SaveStatus;
  readOnly: boolean;
  onLocaleChange?: (locale: 'zh' | 'en') => void;
}) {
  const { control, register, setValue } = useFormContext<FormValues>();
  const values = useWatch({ control });
  const [locale, setLanguage] = useState('zh');
  const setLocale = (value: string) => {
    setLanguage(value);
    onLocaleChange?.(value === 'en' ? 'en' : 'zh');
  };
  const [focused, setFocused] = useState(false);
  const buttons = (
    <div className="toolbar" aria-label="正文语言">
      <Button
        variant="ghost"
        aria-pressed={locale === 'zh'}
        onClick={() => setLocale('zh')}
      >
        中文
      </Button>
      <Button
        variant="ghost"
        aria-pressed={locale === 'en'}
        onClick={() => setLocale('en')}
      >
        English
      </Button>
    </div>
  );
  return (
    <section className="editorial-workspace">
      <Tabs
        className="editorial-language-tabs"
        value={locale}
        onValueChange={setLocale}
        label="编辑文字语言"
        items={[
          { value: 'zh', label: '中文' },
          { value: 'en', label: 'English' },
        ]}
      >
        <TabPanel value="zh" keepMounted>
          <EditorTitle type={type} />
        </TabPanel>
        <TabPanel value="en" className="editorial-english-fields" keepMounted>
          <label>
            英文标题
            <Input {...register('editorialEn.title')} maxLength={200} />
          </label>
          <label>
            英文摘要
            <Textarea {...register('editorialEn.summary')} maxLength={4000} />
          </label>
          <Switch
            label="发布英文版本"
            checked={values.editorialEn?.enabled ?? false}
            onCheckedChange={(enabled) =>
              setValue('editorialEn.enabled', enabled, { shouldDirty: true })
            }
          />
          <p className="caption">
            同一版本发布；英文标题、摘要和正文完整并通过校验后才能公开。填写完整不会自动开启。
          </p>
          <label>
            英文搜索标题
            <Input
              {...register('editorialEn.seoTitle')}
              maxLength={120}
              placeholder="留空使用英文标题"
            />
          </label>
          <label>
            英文搜索描述
            <Textarea
              {...register('editorialEn.seoDescription')}
              maxLength={320}
              placeholder="留空使用英文摘要"
            />
          </label>
        </TabPanel>
      </Tabs>
      {(['zh', 'en'] as const).map((language) => (
        <div key={language} hidden={locale !== language}>
          <h2 className="editor-body-label">
            {language === 'en' ? 'English · ' : ''}
            {type === 'topic' ? '专区导读' : '收录理由 / 编辑点评'}
          </h2>
          <MarkdownEditor
            value={
              language === 'zh'
                ? (values.bodyMarkdown ?? '')
                : (values.editorialEn?.bodyMarkdown ?? '')
            }
            onChange={(value) =>
              setValue(
                language === 'zh' ? 'bodyMarkdown' : 'editorialEn.bodyMarkdown',
                value,
                { shouldDirty: true },
              )
            }
            readOnly={readOnly}
            saveStatus={saveStatus}
            active={locale === language}
            sourceLabel={
              language === 'en' ? 'English Markdown 源码' : 'Markdown 源码'
            }
            focusSession={{ active: focused, onChange: setFocused }}
            tools={(capture) => (
              <>
                {buttons}
                {!readOnly && <InsertImage capture={capture} />}
              </>
            )}
          />
        </div>
      ))}
    </section>
  );
}
