import * as stylex from '@stylexjs/stylex';

export const dock = stylex.create({
  root: {
    position: 'fixed',
    right: 'calc(20px + env(safe-area-inset-right, 0px))',
    bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
    zIndex: 20,
    width: 48,
    height: 48,
    display: 'grid',
    placeItems: 'center',
    padding: 0,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: 10,
    backgroundColor: 'var(--bg)',
    color: 'var(--text-soft)',
    ':hover': {
      backgroundColor: 'var(--surface-strong)',
      color: 'var(--text)',
    },
  },
  ring: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    fill: 'none',
    strokeWidth: 3.5,
    pointerEvents: 'none',
  },
  track: { stroke: 'var(--line)' },
  progress: { stroke: 'var(--accent-strong)', strokeLinecap: 'round' },
});
