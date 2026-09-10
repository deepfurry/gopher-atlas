import createClient from 'openapi-fetch';
import type { paths } from './generated/schema';

export type { paths, components } from './generated/schema';

/** Same-origin browser transport. Tokens stay in cookies, never browser storage. */
export function createCMSClient(
  options: { baseUrl?: string; fetch?: typeof fetch } = {},
) {
  const client = createClient<paths>({
    baseUrl: typeof window === 'undefined' ? undefined : window.location.origin,
    fetch: (...args) => globalThis.fetch(...args),
    ...options,
    credentials: 'same-origin',
  });
  client.use({
    onRequest({ request }) {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
        const token = csrfCookie();
        if (token) request.headers.set('X-CSRF-Token', token);
      }
      return request;
    },
  });
  return client;
}

function csrfCookie(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const name =
    window.location.protocol === 'https:'
      ? '__Host-gopheratlas_csrf'
      : 'gopheratlas_dev_csrf';
  const cookie = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!cookie) return undefined;
  try {
    return decodeURIComponent(cookie.slice(name.length + 1));
  } catch {
    return undefined;
  }
}
