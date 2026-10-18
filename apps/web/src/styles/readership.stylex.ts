import * as stylex from '@stylexjs/stylex';
export const readershipStyles = stylex.create({
  control: {
    backgroundColor: {
      default: 'transparent',
      ':is([aria-pressed="true"])': 'var(--surface-strong)',
    },
    textDecorationLine: {
      default: 'none',
      ':is([aria-pressed="true"])': 'underline',
    },
  },
  totals: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2,minmax(0,1fr))',
    gap: 20,
    margin: 0,
  },
  number: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'clamp(28px,4vw,40px)',
    margin: '12px 0 0',
    overflowWrap: 'anywhere',
  },
  rankings: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2,minmax(0,1fr))',
    gap: 40,
    '@media (max-width: 767px)': {
      gridTemplateColumns: 'minmax(0,1fr)',
      gap: 0,
    },
  },
  list: {
    listStyle: 'none',
    padding: 0,
    marginTop: 24,
  },
  row: {
    paddingBlock: 16,
    borderBottom: '1px solid var(--line)',
    display: 'grid',
    gridTemplateColumns: 'minmax(0,1fr) auto',
    gap: '8px 16px',
  },
  link: { overflowWrap: 'anywhere', minWidth: 0 },
  value: {
    fontFamily: 'var(--font-mono)',
    fontSize: 13,
    color: 'var(--text-soft)',
  },
  meter: {
    gridColumn: '1 / -1',
    width: '100%',
    height: 4,
    accentColor: 'var(--accent)',
    '::-webkit-meter-bar': {
      backgroundColor: 'var(--line)',
      borderWidth: 0,
      borderRadius: 0,
    },
    '::-webkit-meter-optimum-value': { backgroundColor: 'var(--accent)' },
    '::-moz-meter-bar': { backgroundColor: 'var(--accent)' },
  },
  cell: {
    padding: '10px 8px',
    textAlign: 'start',
    borderBottom: '1px solid var(--line)',
    fontWeight: 400,
  },
  retry: {
    padding: '4px 8px',
    textDecoration: 'underline',
    textUnderlineOffset: 4,
  },
});
