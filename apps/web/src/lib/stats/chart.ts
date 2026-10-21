/** Small SVG interaction layer; geometry/data stay with each chart. */
// Shared label headroom and zero baseline; only presentation, never data filling.
export function chartScale(total: number) {
  const step = Math.max(1, Math.ceil(total / 4));
  const maximum = Math.max(step, Math.ceil(total / step) * step);
  const y = (value: number) => 12 + (1 - value / maximum) * 80;
  const ticks = Array.from({ length: maximum / step + 1 }, (_, i) => {
    const value = maximum - i * step;
    return { value, y: y(value) };
  });
  return { maximum, ticks, y };
}

export interface ChartSample {
  date: string;
  x: number;
  y: number | null;
  rows: { label: string; value: string }[];
}
export interface ChartSeries {
  count: number;
  sample(index: number): ChartSample;
}

/** Binary search also supports lazy calendar series without allocating every day. */
export function nearestSampleIndex(series: ChartSeries, x: number) {
  if (!series.count) return -1;
  let low = 0,
    high = series.count - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (series.sample(middle).x < x) low = middle + 1;
    else high = middle;
  }
  return low > 0 && x - series.sample(low - 1).x <= series.sample(low).x - x
    ? low - 1
    : low;
}

export function tooltipPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  viewport: { left: number; top: number; width: number; height: number },
  touch = false,
) {
  const margin = 12,
    offset = 16;
  const right = viewport.left + viewport.width - margin;
  const bottom = viewport.top + viewport.height - margin;
  let left = x + offset,
    top = touch ? y - height - offset : y + offset;
  if (left + width > right) left = x - width - offset;
  if (touch && top < viewport.top + margin) top = y + offset;
  else if (!touch && top + height > bottom) top = y - height - offset;
  return {
    left: Math.max(viewport.left + margin, Math.min(left, right - width)),
    top: Math.max(viewport.top + margin, Math.min(top, bottom - height)),
  };
}

const mounted = new WeakMap<
  HTMLElement,
  ReturnType<typeof createInteraction>
>();
export function mountChart(root: HTMLElement, series: ChartSeries) {
  mounted.get(root)?.destroy();
  const interaction = createInteraction(root, series);
  mounted.set(root, interaction);
  return interaction;
}

function createInteraction(root: HTMLElement, series: ChartSeries) {
  const tooltip = root.querySelector<HTMLElement>('[data-chart-tooltip]')!;
  const guide = root.querySelector<HTMLElement>('[data-chart-guide]')!;
  const dot = root.querySelector<HTMLElement>('[data-chart-dot]')!;
  const status = root.querySelector<HTMLElement>('[data-chart-status]')!;
  const instructions = root.querySelector<HTMLElement>(
    '[data-chart-instructions]',
  )!;
  const win = root.ownerDocument.defaultView!;
  const listeners: (() => void)[] = [];
  let frame: number | null = null,
    index = -1,
    rendered = -1,
    destroyed = false;
  let pointer: { x: number; y: number; touch: boolean } | null = null;
  let drag: { id: number; x: number; y: number } | null = null;
  let width = 0,
    height = 0;
  const originalTabIndex = root.getAttribute('tabindex');
  const originalDescription = root.getAttribute('aria-describedby');
  function on(
    target: EventTarget,
    type: string,
    fn: (event: Event) => void,
    options?: AddEventListenerOptions,
  ) {
    target.addEventListener(type, fn, options);
    listeners.push(() => target.removeEventListener(type, fn, options));
  }
  function reset() {
    if (frame !== null) win.cancelAnimationFrame(frame);
    frame = null;
    pointer = null;
    if (drag && root.hasPointerCapture?.(drag.id))
      root.releasePointerCapture(drag.id);
    drag = null;
    index = rendered = -1;
    tooltip.hidden = guide.hidden = dot.hidden = true;
    status.textContent = '';
  }
  function show(next: number, speak = false) {
    if (destroyed || next < 0 || !series.count) return;
    index = next;
    const point = series.sample(index);
    guide.hidden = false;
    guide.style.left = `${point.x}%`;
    dot.hidden = point.y === null;
    dot.style.left = `${point.x}%`;
    if (point.y !== null) dot.style.top = `${point.y}%`;
    tooltip.hidden = false;
    if (rendered !== index) {
      const date = document.createElement('strong');
      date.textContent = `${point.date} · UTC`;
      tooltip.replaceChildren(date);
      for (const row of point.rows) {
        const line = document.createElement('div');
        line.textContent = `${row.label}: ${row.value}`;
        tooltip.append(line);
      }
      rendered = index;
      width = tooltip.offsetWidth;
      height = tooltip.offsetHeight;
    }
    if (speak)
      status.textContent = [
        `${point.date} UTC`,
        ...point.rows.map((r) => `${r.label}: ${r.value}`),
      ].join(' · ');
    const rect = root.getBoundingClientRect();
    const anchor = pointer ?? {
      x: rect.left + (rect.width * point.x) / 100,
      y: rect.top + (rect.height * (point.y ?? 50)) / 100,
      touch: false,
    };
    const viewport = win.visualViewport;
    const position = tooltipPosition(
      anchor.x,
      anchor.y,
      width,
      height,
      {
        left: viewport?.offsetLeft ?? 0,
        top: viewport?.offsetTop ?? 0,
        width: viewport?.width ?? win.innerWidth,
        height: viewport?.height ?? win.innerHeight,
      },
      anchor.touch,
    );
    tooltip.style.left = `${position.left}px`;
    tooltip.style.top = `${position.top}px`;
  }
  function paint() {
    frame = null;
    if (!pointer || destroyed) return;
    const rect = root.getBoundingClientRect();
    if (
      !rect.width ||
      !rect.height ||
      pointer.y < rect.top ||
      pointer.y > rect.bottom ||
      pointer.x < rect.left ||
      pointer.x > rect.right
    ) {
      reset();
      return;
    }
    show(
      nearestSampleIndex(series, ((pointer.x - rect.left) / rect.width) * 100),
    );
  }
  function track(event: PointerEvent) {
    pointer = {
      x: event.clientX,
      y: event.clientY,
      touch: event.pointerType === 'touch',
    };
    if (frame === null) frame = win.requestAnimationFrame(paint);
  }
  if (series.count) {
    root.tabIndex = 0;
    instructions.hidden = false;
    root.setAttribute(
      'aria-describedby',
      [originalDescription, instructions.id].filter(Boolean).join(' '),
    );
    on(
      root,
      'pointerdown',
      (e) => {
        const event = e as PointerEvent;
        if (event.button !== 0 && event.button !== undefined) return;
        if (event.pointerType !== 'mouse')
          drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
        track(event);
      },
      { passive: true },
    );
    on(
      root,
      'pointermove',
      (e) => {
        const event = e as PointerEvent;
        if (event.pointerType !== 'mouse') {
          if (!drag || drag.id !== event.pointerId) return;
          const dx = Math.abs(event.clientX - drag.x),
            dy = Math.abs(event.clientY - drag.y);
          if (dy > 8 && dy > dx) {
            reset();
            return;
          }
          if (dx > 6 && dx > dy && !root.hasPointerCapture?.(event.pointerId))
            root.setPointerCapture?.(event.pointerId);
        }
        track(event);
      },
      { passive: true },
    );
    on(
      root,
      'pointerup',
      () => {
        if (drag && root.hasPointerCapture?.(drag.id))
          root.releasePointerCapture(drag.id);
        drag = null;
      },
      { passive: true },
    );
    on(root, 'pointerleave', (e) => {
      if ((e as PointerEvent).pointerType !== 'touch') reset();
    });
    on(root, 'pointercancel', reset);
    on(root, 'focus', () => {
      // A pointerdown focuses the plot before the queued frame; keep its X hit.
      if (pointer) return;
      show(0, true);
    });
    on(root, 'blur', reset);
    on(root, 'keydown', (e) => {
      const event = e as KeyboardEvent;
      if (event.key === 'Escape') {
        event.preventDefault();
        reset();
        return;
      }
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? series.count - 1
            : event.key === 'ArrowRight'
              ? Math.min(series.count - 1, index + 1)
              : event.key === 'ArrowLeft'
                ? Math.max(0, index - 1)
                : null;
      if (next === null) return;
      event.preventDefault();
      if (frame !== null) win.cancelAnimationFrame(frame);
      frame = null;
      pointer = null;
      show(next, true);
    });
    on(
      root.ownerDocument,
      'pointerdown',
      (e) => {
        if (!root.contains(e.target as Node)) reset();
      },
      { passive: true },
    );
    on(win, 'scroll', reset, { passive: true, capture: true });
    on(win, 'resize', reset, { passive: true });
    if (win.visualViewport) {
      on(win.visualViewport, 'resize', reset);
      on(win.visualViewport, 'scroll', reset);
    }
  }
  // Native static navigation needs no router. Also release detached component roots.
  const observer = new MutationObserver(() => {
    if (!root.isConnected) destroy();
  });
  observer.observe(root.ownerDocument.documentElement, {
    childList: true,
    subtree: true,
  });
  function destroy() {
    if (destroyed) return;
    reset();
    destroyed = true;
    listeners.forEach((remove) => remove());
    observer.disconnect();
    if (originalTabIndex === null) root.removeAttribute('tabindex');
    else root.setAttribute('tabindex', originalTabIndex);
    if (originalDescription === null) root.removeAttribute('aria-describedby');
    else root.setAttribute('aria-describedby', originalDescription);
    instructions.hidden = true;
    mounted.delete(root);
  }
  on(win, 'pagehide', (e) => {
    if ((e as PageTransitionEvent).persisted) reset();
    else destroy();
  });
  return { reset, destroy };
}
