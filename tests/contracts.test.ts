import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { expect, it } from 'vitest';

const read = (path: string) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const ajv = new Ajv2020({ strict: true });
addFormats(ajv);
const validate = ajv.compile(read('../contracts/content-snapshot.schema.json'));
const fixture = read('./fixtures/snapshots/bootstrap.json');

it('accepts only the empty bootstrap envelope', () => {
  expect(validate(fixture)).toBe(true);
});
it.each(['drafts', 'sessions', 'roles', 'audit', 'secrets'])(
  'rejects private field %s',
  (key) => {
    expect(validate({ ...fixture, [key]: [] })).toBe(false);
  },
);
it('rejects unmodelled entities and production versions', () => {
  expect(validate({ ...fixture, content: [{ draft: 'private' }] })).toBe(false);
  expect(validate({ ...fixture, schemaVersion: 1 })).toBe(false);
  expect(validate({ ...fixture, exportedAt: 'invalid' })).toBe(false);
});
