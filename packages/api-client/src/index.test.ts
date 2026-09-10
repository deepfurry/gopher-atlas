import { expect, it } from 'vitest';
import { createCMSClient } from './index';

it('uses the generated route and keeps credentials same-origin', async () => {
  let request: Request | undefined;
  const client = createCMSClient({
    baseUrl: 'http://127.0.0.1:46217',
    fetch: async (input) => {
      request = input as Request;
      return Response.json({ status: 'ok' });
    },
  });
  const result = await client.GET('/healthz');
  expect(request?.url).toBe('http://127.0.0.1:46217/healthz');
  expect(request?.credentials).toBe('same-origin');
  expect(result.data).toEqual({ status: 'ok' });
});
