import { words, localized, type Locale } from './i18n';
interface SearchData {
  url: string;
  meta: { title?: string };
  plain_excerpt: string;
}
interface SearchHit {
  data(): Promise<SearchData>;
}
export interface SearchAPI {
  search(query: string): Promise<{ results: SearchHit[] }>;
}
const bundle = '/pagefind/pagefind.js';
const loadPagefind = () =>
  import(/* @vite-ignore */ bundle) as Promise<SearchAPI>;
// plain_excerpt encodes HTML entities. Decode only entities, then assign textContent.
export function excerptText(value: string) {
  return value.replace(
    /&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi,
    (raw, entity: string) => {
      const named: Record<string, string> = {
        amp: '&',
        lt: '<',
        gt: '>',
        quot: '"',
        apos: "'",
      };
      if (entity[0] !== '#') return named[entity.toLowerCase()] ?? raw;
      const code =
        entity[1].toLowerCase() === 'x'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : raw;
    },
  );
}
export function safeResultURL(path: string) {
  return /^\/(?:en\/)?(?:articles|notes|topics|about|contribute)\/(?:[a-z0-9-]+\/)*$/.test(
    path,
  );
}
function bounded<T>(work: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('search_timeout')), 15000);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
export function mountSearch(
  root: HTMLElement,
  load: () => Promise<SearchAPI> = loadPagefind,
) {
  const locale = (document.documentElement.dataset.locale as Locale) || 'zh',
    t = words[locale];
  const form = root.querySelector<HTMLFormElement>('form')!;
  const input = root.querySelector<HTMLInputElement>('input')!;
  const status = root.querySelector<HTMLElement>('[role=status]')!;
  const list = root.querySelector<HTMLOListElement>('[data-results]')!;
  const more = root.querySelector<HTMLButtonElement>('[data-more]')!;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let epoch = 0,
    shown = 0;
  let hits: SearchHit[] = [];
  let api: Promise<SearchAPI> | undefined;
  async function showPage(ticket: number) {
    more.disabled = true;
    try {
      const page = await bounded(
        Promise.all(hits.slice(shown, shown + 10).map((hit) => hit.data())),
      );
      if (ticket !== epoch) return;
      const fragment = document.createDocumentFragment();
      for (const data of page) {
        if (!safeResultURL(data.url)) throw new Error('search_result_invalid');
        const li = document.createElement('li'),
          h2 = document.createElement('h2'),
          link = document.createElement('a'),
          excerpt = document.createElement('p');
        link.href = localized(data.url, locale);
        link.textContent = data.meta.title || t.readContent;
        excerpt.textContent = excerptText(data.plain_excerpt);
        h2.append(link);
        li.append(h2, excerpt);
        fragment.append(li);
      }
      list.append(fragment);
      shown += page.length;
      status.textContent = hits.length
        ? document.documentElement.dataset.locale === 'en'
          ? `${hits.length} results, ${shown} shown.`
          : `找到 ${hits.length} 条结果，已显示 ${shown} 条。`
        : t.searchEmpty;
      more.hidden = shown >= hits.length;
    } catch {
      if (ticket === epoch) {
        status.textContent = t.searchError;
        more.hidden = true;
        api = undefined;
      }
    } finally {
      if (ticket === epoch) more.disabled = false;
    }
  }
  async function search() {
    clearTimeout(timer);
    const ticket = ++epoch,
      query = input.value.trim();
    list.replaceChildren();
    more.hidden = true;
    shown = 0;
    hits = [];
    if (!query) {
      status.textContent = t.searchHint;
      return;
    }
    status.textContent = t.searching;
    try {
      api ??= load();
      const found = await bounded((await bounded(api)).search(query));
      if (ticket !== epoch) return;
      hits = found.results;
      await showPage(ticket);
    } catch {
      if (ticket === epoch) {
        api = undefined;
        status.textContent = t.searchError;
      }
    }
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void search();
  });
  input.addEventListener('input', () => {
    ++epoch;
    clearTimeout(timer);
    more.hidden = true;
    timer = setTimeout(() => void search(), 300);
  });
  more.addEventListener('click', () => void showPage(epoch));
}
