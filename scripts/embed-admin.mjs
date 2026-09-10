import { cpSync, existsSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
process.chdir(root);
const target = resolve('internal/adminui/dist');
if (realpathSync(dirname(target)) !== resolve(root, 'internal/adminui'))
  throw new Error('Embed destination must stay in internal/adminui');
if (!existsSync('apps/admin/dist/index.html'))
  throw new Error('Build Admin before copying embed assets');
if (existsSync(target) && realpathSync(target) !== target)
  throw new Error('Refusing to replace a redirected embed directory');
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync('apps/admin/dist', target, { recursive: true });
