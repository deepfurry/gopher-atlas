import { animate } from 'motion/mini';

export const reducedMotion = () =>
  typeof matchMedia !== 'function' ||
  matchMedia('(prefers-reduced-motion: reduce)').matches;

// Each independently operated region owns a scope. State/DOM updates never wait
// for an animation. Cancellation restores CSS instead of leaving inline opacity.
export function createMotionScope() {
  const preference =
    typeof matchMedia === 'function'
      ? matchMedia('(prefers-reduced-motion: reduce)')
      : undefined;
  const jobs = new Set<(finish: boolean) => void>();
  const cancel = () => [...jobs].forEach((settle) => settle(false));
  const finish = () => [...jobs].forEach((settle) => settle(true));
  const changed = () => {
    if (preference?.matches) finish();
  };
  preference?.addEventListener('change', changed);
  window.addEventListener('pagehide', finish);

  function play(
    element: HTMLElement,
    opacity: number[],
    translate: number[],
    duration: number,
    done?: () => void,
    delay = 0,
    ease: 'easeOut' | [number, number, number, number] = 'easeOut',
  ) {
    if (
      !preference ||
      preference.matches ||
      typeof element.animate !== 'function'
    ) {
      done?.();
      return;
    }
    const original = [element.style.opacity, element.style.transform];
    let controls: ReturnType<typeof animate> | undefined;
    const settle = (complete: boolean) => {
      if (!jobs.delete(settle)) return;
      controls?.cancel();
      element.style.opacity = original[0];
      element.style.transform = original[1];
      if (complete) done?.();
    };
    jobs.add(settle);
    try {
      controls = animate(
        element,
        {
          opacity,
          transform: translate.map((y) => `translateY(${y}px)`),
        },
        { duration, delay, ease },
      );
      void controls.then(() => settle(true));
    } catch {
      // Unsupported animation APIs must not leave menus or content inaccessible.
      settle(true);
    }
  }
  return {
    cancel,
    finish,
    sequence(
      steps: {
        element: HTMLElement;
        delay: number;
        duration: number;
        distance: number;
        opacity?: number;
        complete?: () => void;
      }[],
    ) {
      cancel();
      for (const step of steps)
        play(
          step.element,
          [step.opacity ?? 0, 1],
          [step.distance, 0],
          step.duration,
          step.complete,
          step.delay,
          [0.4, 0, 0.2, 1],
        );
    },
    enter(
      elements: HTMLElement[],
      options: { duration?: number; distance?: number; opacity?: number } = {},
    ) {
      cancel();
      for (const element of elements)
        play(
          element,
          [options.opacity ?? 0.65, 1],
          [options.distance ?? 4, 0],
          options.duration ?? 0.2,
        );
    },
    exit(element: HTMLElement, done: () => void) {
      cancel();
      play(element, [1, 0], [0, 4], 0.16, done);
    },
    dispose() {
      finish();
      preference?.removeEventListener('change', changed);
      window.removeEventListener('pagehide', finish);
    },
  };
}

export function mountMotion() {
  const motion = createMotionScope();
  const hero = document.querySelector<HTMLElement>('.home-hero');
  const header = document.querySelector<HTMLElement>('.header-inner');
  if (!hero) {
    if (header)
      motion.enter([header], {
        opacity: 0.8,
        distance: 0,
        duration: 0.32,
      });
    return () => motion.dispose();
  }

  const preference =
    typeof matchMedia === 'function'
      ? matchMedia('(prefers-reduced-motion: reduce)')
      : undefined;
  let entered = false,
    visible = false,
    suspended = document.hidden;
  const update = () => {
    hero.dataset.scrollActive = String(
      entered && visible && !suspended && preference?.matches === false,
    );
  };
  const ready = () => {
    entered = true;
    hero.dataset.scrollReady = 'true';
    update();
  };
  const observer =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(([entry]) => {
          visible = entry.isIntersecting;
          update();
        })
      : undefined;
  observer?.observe(hero);
  const hide = () => {
    suspended = true;
    update();
  };
  const resume = () => {
    suspended = document.hidden;
    update();
  };
  preference?.addEventListener('change', update);
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('pagehide', hide);
  window.addEventListener('pageshow', resume);
  // Keyboard focus and an intentional click/selection take priority over reveal.
  const interact = (event: Event) => {
    if (
      event.target instanceof Node &&
      (hero.contains(event.target) || header?.contains(event.target))
    )
      motion.finish();
  };
  document.addEventListener('focusin', interact);
  document.addEventListener('pointerdown', interact);

  // Siblings only: neither header-inner nor hero-copy also receives an entrance.
  // Mini's native delay shares cancellation/cleanup with immediate transitions.
  const stages: [string, number, number, number, number][] = [
    ['.brand', 0, 0.38, 6, 0.6],
    ['#primary-navigation', 0.09, 0.38, 6, 0.6],
    ['[data-header-mobile]', 0.09, 0.38, 6, 0.6],
    ['[data-hero-eyebrow]', 0.16, 0.45, 6, 0],
    ['[data-hero-title]', 0.3, 0.55, 11, 0],
    ['[data-hero-subtitle]', 0.46, 0.47, 7, 0],
    ['[data-hero-actions]', 0.62, 0.45, 6, 0],
    ['[data-hero-scroll]', 0.78, 0.42, 5, 0],
  ];
  motion.sequence(
    stages.flatMap(([selector, delay, duration, distance, opacity]) => {
      const element = document.querySelector<HTMLElement>(selector);
      return element
        ? [
            {
              element,
              delay,
              duration,
              distance,
              opacity,
              complete: selector === '[data-hero-scroll]' ? ready : undefined,
            },
          ]
        : [];
    }),
  );
  return () => {
    motion.dispose();
    observer?.disconnect();
    preference?.removeEventListener('change', update);
    document.removeEventListener('visibilitychange', resume);
    window.removeEventListener('pagehide', hide);
    window.removeEventListener('pageshow', resume);
    document.removeEventListener('focusin', interact);
    document.removeEventListener('pointerdown', interact);
    delete hero.dataset.scrollReady;
    delete hero.dataset.scrollActive;
  };
}
