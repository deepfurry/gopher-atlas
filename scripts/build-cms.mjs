import { mkdirSync } from 'node:fs';
import { go, pnpm } from './lib.mjs';

pnpm('--filter', '@gopheratlas/admin', 'build');
mkdirSync('.cache/bin', { recursive: true });
go(
  'build',
  '-tags=adminembed',
  '-o',
  `.cache/bin/gopheratlas-cms${process.platform === 'win32' ? '.exe' : ''}`,
  './cmd/gopheratlas-cms',
);
