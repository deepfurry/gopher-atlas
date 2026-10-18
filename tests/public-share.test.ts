// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/dom';
import { mountChrome } from '../apps/web/src/lib/chrome';
import { words } from '../apps/web/src/lib/i18n';

it('reuses Clipboard and localized Toast for page sharing, including failures', async () => {
  document.documentElement.dataset.locale = 'en';
  document.body.innerHTML =
    '<button data-copy-link data-copy-text="https://gopheratlas.com/en/articles/review/"><span>Copy link</span></button><p role="status" data-toast></p>';
  const writeText = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(Error('denied'));
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  mountChrome();
  const button = document.querySelector('button')!;
  button.focus();
  button.querySelector('span')!.click();
  await waitFor(() =>
    expect(document.querySelector('[data-toast]')!.textContent).toBe(
      words.en.copied,
    ),
  );
  expect(writeText).toHaveBeenLastCalledWith(
    'https://gopheratlas.com/en/articles/review/',
  );
  expect(document.activeElement).toBe(button);
  button.click();
  await waitFor(() =>
    expect(document.querySelector('[data-toast]')!.textContent).toBe(
      words.en.copyFailed,
    ),
  );
  vi.unstubAllGlobals();
});
