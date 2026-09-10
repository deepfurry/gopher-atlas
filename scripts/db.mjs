import { tool } from './lib.mjs';

const action = process.argv[2];
if (!['status', 'up'].includes(action))
  throw new Error('Expected status or up');
if (!process.env.DATABASE_PATH)
  throw new Error('Set DATABASE_PATH explicitly; no implicit database target');
tool(
  'goose',
  '-dir',
  'db/migrations',
  'sqlite3',
  process.env.DATABASE_PATH,
  action,
);
