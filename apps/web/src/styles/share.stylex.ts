import * as stylex from '@stylexjs/stylex';

export const share = stylex.create({
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    marginBottom: 4,
  },
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 38,
    height: 38,
    minHeight: 38,
    flexShrink: 0,
    padding: 0,
    borderRadius: '50%',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: {
      default: 'color-mix(in srgb, var(--text) 14%, transparent)',
      ':hover': 'var(--line-strong)',
    },
    color: { default: 'var(--text-soft)', ':hover': 'var(--text)' },
    backgroundColor: {
      default: 'color-mix(in srgb, var(--text) 6%, transparent)',
      ':hover': 'color-mix(in srgb, var(--text) 12%, transparent)',
    },
    textDecoration: 'none',
    cursor: 'pointer',
    transitionProperty: 'color, background-color, border-color',
    transitionDuration: {
      default: '420ms',
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
    transitionTimingFunction: 'ease',
  },
});
