import { words, type Locale } from './i18n';
export const ratings = ['S+', 'S', 'A+', 'A', 'B+', 'B', 'C+', 'C'];
export interface ArticleIndex {
  id: number;
  title: string;
  text: string;
  topics: string[];
  tags: string[];
  language: string;
  rating: string;
  difficulty: string;
  recommended: boolean;
  featured: boolean;
  added: number;
  sourceDate: string;
}
export interface Filters {
  q: string;
  topic: string;
  tags: string[];
  ratings: string[];
  language: string;
  difficulty: string;
  sort: string;
  page: number;
}
export function parseFilters(
  params: URLSearchParams,
  labels: { topics: Map<string, string>; tags: Map<string, string> } = {
    topics: new Map(),
    tags: new Map(),
  },
): Filters {
  // Old shared links used category titles, tag names and comma-separated values.
  // Resolve these against the actual static projection, never a new Category model.
  const topic = params.get('topic') || params.get('category') || '';
  const many = (key: string) => [
    ...new Set(
      params
        .getAll(key)
        .flatMap((value) => value.split(','))
        .filter(Boolean),
    ),
  ];
  const sort = params.get('sort') || 'source-date';
  return {
    q: (params.get('q') || '').slice(0, 200),
    topic: labels.topics.get(topic) ?? topic,
    tags: many('tags').map((tag) => labels.tags.get(tag) ?? tag),
    ratings: many('rating'),
    language: params.get('lang') || '',
    difficulty: params.get('difficulty') || '',
    sort:
      (
        {
          'published-date': 'source-date',
          'recently-added': 'added',
          'title-asc': 'title',
        } as Record<string, string>
      )[sort] ?? sort,
    page: Math.max(
      1,
      Math.min(10000, Number.parseInt(params.get('page') || '1', 10) || 1),
    ),
  };
}
export function filterArticles(rows: ArticleIndex[], filters: Filters) {
  const q = filters.q.trim().toLowerCase(),
    weight = (r: ArticleIndex) => ratings.indexOf(r.rating);
  return rows
    .filter(
      (r) =>
        (!q || r.text.includes(q)) &&
        (!filters.topic || r.topics.includes(filters.topic)) &&
        filters.tags.every((tag) => r.tags.includes(tag)) &&
        (!filters.ratings.length || filters.ratings.includes(r.rating)) &&
        (!filters.language || r.language === filters.language) &&
        (!filters.difficulty || r.difficulty === filters.difficulty),
    )
    .sort((a, b) => {
      const fallback = b.added - a.added || a.id - b.id;
      switch (filters.sort) {
        case 'recommended':
          return (
            Number(b.featured) - Number(a.featured) ||
            Number(b.recommended) - Number(a.recommended) ||
            weight(a) - weight(b) ||
            fallback
          );
        case 'rating':
          return (
            weight(a) - weight(b) || b.title.localeCompare(a.title) || fallback
          );
        case 'title':
          return a.title.localeCompare(b.title) || fallback;
        case 'added':
          return fallback;
        default:
          return b.sourceDate.localeCompare(a.sourceDate) || fallback;
      }
    });
}
export function mountSelect(root: HTMLElement) {
  const input = root.querySelector<HTMLInputElement>('input')!,
    trigger = root.querySelector<HTMLButtonElement>(':scope > button')!,
    list = root.querySelector<HTMLElement>('[role=listbox]')!,
    options = [...list.querySelectorAll<HTMLButtonElement>('[role=option]')];
  const sync = () => {
    const selected =
      options.find((option) => option.dataset.value === input.value) ??
      options[0];
    root.querySelector('[data-value]')!.textContent =
      selected.querySelector('[data-option-label]')?.textContent ??
      selected.textContent;
    options.forEach((o) =>
      o.setAttribute('aria-selected', String(o === selected)),
    );
  };
  const close = () => {
    root.dataset.open = 'false';
    list.inert = true;
    list.setAttribute('aria-hidden', 'true');
    trigger.setAttribute('aria-expanded', 'false');
  };
  const open = () => {
    root.dataset.open = 'true';
    list.inert = false;
    list.removeAttribute('aria-hidden');
    trigger.setAttribute('aria-expanded', 'true');
    (
      options.find((o) => o.dataset.value === input.value) || options[0]
    ).focus();
  };
  trigger.addEventListener('click', () =>
    root.dataset.open !== 'true' ? open() : close(),
  );
  options.forEach((option) =>
    option.addEventListener('click', () => {
      input.value = option.dataset.value || '';
      sync();
      close();
      trigger.focus();
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }),
  );
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      close();
      trigger.focus();
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      if (root.dataset.open !== 'true') {
        open();
        return;
      }
      const index = options.indexOf(
        document.activeElement as HTMLButtonElement,
      );
      options[
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? options.length - 1
            : (index + (e.key === 'ArrowDown' ? 1 : -1) + options.length) %
              options.length
      ].focus();
    }
  });
  document.addEventListener('click', (e) => {
    if (e.target instanceof Node && !root.contains(e.target)) close();
  });
  root.addEventListener('focusout', (e) => {
    if (!(e.relatedTarget instanceof Node) || !root.contains(e.relatedTarget))
      close();
  });
  close();
  return sync;
}
export function mountExplorer(root: HTMLElement) {
  const t = words[(document.documentElement.dataset.locale as Locale) || 'zh'];
  const form = root.querySelector<HTMLFormElement>('form')!,
    results = root.querySelector<HTMLElement>('[data-results]')!,
    count = root.querySelector('[data-result-count]')!,
    pages = root.querySelector<HTMLElement>('[data-pagination]')!,
    empty = root.querySelector<HTMLElement>('[data-empty]')!;
  const nodes = [...results.querySelectorAll<HTMLElement>('[data-article]')],
    byId = new Map(nodes.map((n) => [Number(n.dataset.id), n]));
  const rows: ArticleIndex[] = nodes.map((n) => ({
    id: Number(n.dataset.id),
    title: n.dataset.title!,
    text: (n.textContent || '').toLowerCase(),
    topics: JSON.parse(n.dataset.topics!),
    tags: JSON.parse(n.dataset.tags!),
    language: n.dataset.language!,
    rating: n.dataset.rating!,
    difficulty: n.dataset.difficulty!,
    recommended: n.dataset.recommended === '1',
    featured: n.dataset.featured === '1',
    added: Number(n.dataset.added),
    sourceDate: n.dataset.sourceDate!,
  }));
  const syncs = [...form.querySelectorAll<HTMLElement>('[data-select]')].map(
    mountSelect,
  );
  const labels = {
    topics: new Map(
      [...form.querySelectorAll<HTMLElement>('[data-topic-slug]')].map((n) => [
        n.dataset.topicTitle!,
        n.dataset.topicSlug!,
      ]),
    ),
    tags: new Map(
      [...form.querySelectorAll<HTMLElement>('[data-tag-name]')].map((n) => [
        n.dataset.tagName!,
        n.querySelector<HTMLInputElement>('input')!.value,
      ]),
    ),
  };
  let state = parseFilters(new URLSearchParams(location.search), labels),
    visibleTags = 30;
  const tags = [...form.querySelectorAll<HTMLElement>('[data-tag-option]')],
    more = root.querySelector<HTMLButtonElement>('[data-more-tags]');
  const showTags = () => {
    tags.forEach(
      (n, i) =>
        (n.hidden =
          i >= visibleTags &&
          !n.querySelector<HTMLInputElement>('input')!.checked),
    );
    if (more) more.hidden = visibleTags >= tags.length;
  };
  const sync = () => {
    for (const element of form.elements) {
      if (!(element instanceof HTMLInputElement)) continue;
      if (element.type === 'checkbox')
        element.checked = (
          element.name === 'tags' ? state.tags : state.ratings
        ).includes(element.value);
      else
        element.value =
          (
            {
              q: state.q,
              topic: state.topic,
              lang: state.language,
              difficulty: state.difficulty,
              sort: state.sort,
            } as Record<string, string>
          )[element.name] || '';
    }
    syncs.forEach((fn) => fn());
    showTags();
  };
  const render = (historyMode: 'push' | 'replace' | 'none' = 'replace') => {
    const filtered = filterArticles(rows, state),
      total = Math.max(1, Math.ceil(filtered.length / 12));
    state.page = Math.min(total, state.page);
    const shown = new Set(
      filtered.slice((state.page - 1) * 12, state.page * 12).map((r) => r.id),
    );
    nodes.forEach((n) => (n.hidden = !shown.has(Number(n.dataset.id))));
    filtered.forEach((row, index) => {
      const node = byId.get(row.id)!;
      node.style.setProperty('--card-order', String(index % 12));
      results.append(node);
    });
    count.textContent = `${filtered.length} ${t.found}`;
    empty.hidden = filtered.length > 0;
    pages.replaceChildren();
    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.topic) params.set('topic', state.topic);
    state.tags.forEach((tag) => params.append('tags', tag));
    state.ratings.forEach((rating) => params.append('rating', rating));
    if (state.language) params.set('lang', state.language);
    if (state.difficulty) params.set('difficulty', state.difficulty);
    if (state.sort !== 'source-date') params.set('sort', state.sort);
    if (state.page > 1) params.set('page', String(state.page));
    // Render a bounded window even for very large collections.
    const numbers = new Set([
      1,
      total,
      ...Array.from({ length: 5 }, (_, i) => state.page + i - 2).filter(
        (n) => n > 0 && n <= total,
      ),
    ]);
    if (total > 1)
      for (const page of [...numbers].sort((a, b) => a - b)) {
        const link = document.createElement('a'),
          query = new URLSearchParams(params);
        query.set('page', String(page));
        link.href = `${location.pathname}?${query}`;
        link.textContent = String(page);
        if (page === state.page) link.setAttribute('aria-current', 'page');
        link.addEventListener('click', (e) => {
          e.preventDefault();
          state.page = page;
          render('push');
          root
            .querySelector('[data-results-heading]')
            ?.scrollIntoView({ block: 'start' });
        });
        pages.append(link);
      }
    if (historyMode !== 'none')
      history[historyMode === 'push' ? 'pushState' : 'replaceState'](
        {},
        '',
        `${location.pathname}${params.size ? '?' + params : ''}`,
      );
  };
  const read = () => {
    state = parseFilters(
      new URLSearchParams(
        [...new FormData(form)].map(([k, v]) => [k, String(v)]),
      ),
    );
    render();
    showTags();
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    read();
  });
  form.addEventListener('change', read);
  form.addEventListener('input', (e) => {
    if (e.target instanceof HTMLInputElement && e.target.name === 'q') read();
  });
  root.querySelector('[data-reset]')?.addEventListener('click', () => {
    state = parseFilters(new URLSearchParams());
    visibleTags = 30;
    sync();
    render();
  });
  more?.addEventListener('click', () => {
    visibleTags += 10;
    showTags();
  });
  window.addEventListener('popstate', () => {
    state = parseFilters(new URLSearchParams(location.search), labels);
    sync();
    render('none');
  });
  sync();
  render('none');
}
