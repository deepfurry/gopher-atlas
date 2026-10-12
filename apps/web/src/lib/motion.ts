import { animate } from 'motion/mini';

export function mountMotion() {
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  if (preference.matches) return;
  // No initial hidden state, delayed reveals, image animation or React hydration.
  const header = document.querySelector<HTMLElement>('.header-inner');
  const copy = document.querySelector<HTMLElement>('[data-hero-copy]');
  const animations: ReturnType<typeof animate>[] = [];
  if (header)
    animations.push(animate(header, { opacity: [0.8, 1] }, { duration: 0.32 }));
  if (copy)
    animations.push(
      animate(
        copy,
        {
          opacity: [0.75, 1],
          transform: ['translateY(10px)', 'translateY(0)'],
        },
        { duration: 0.55, ease: 'easeOut' },
      ),
    );
  preference.addEventListener(
    'change',
    () => {
      if (preference.matches)
        animations.forEach((animation) => animation.complete());
    },
    { once: true },
  );
}
