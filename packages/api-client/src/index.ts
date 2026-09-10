import createClient from 'openapi-fetch';
import type { paths } from './generated/schema';

export type { paths, components } from './generated/schema';

/** Same-origin Admin transport. Authentication and CSRF arrive in P0-1. */
export function createCMSClient(
  options: { baseUrl?: string; fetch?: typeof fetch } = {},
) {
  return createClient<paths>({ ...options, credentials: 'same-origin' });
}
