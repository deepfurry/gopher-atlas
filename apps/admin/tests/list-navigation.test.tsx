// @vitest-environment jsdom
import { StrictMode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '@/app/routes';
import { backend } from './fixtures';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('keeps a populated table responsive while a lazy editor route is pending', async () => {
  backend();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const children = routes[0].children!.map((route) =>
    route.path === 'content/:id'
      ? {
          path: route.path,
          lazy: async () => {
            await gate;
            return { Component: () => <h1>编辑器已打开</h1> };
          },
        }
      : route,
  );
  const router = createMemoryRouter(
    [{ ...routes[0], index: false, children }],
    {
      initialEntries: ['/content'],
    },
  );
  render(
    <StrictMode>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <RouterProvider router={router} useTransitions={false} />
      </QueryClientProvider>
    </StrictMode>,
  );
  fireEvent.click(await screen.findByRole('link', { name: 'A useful post' }));
  expect(router.state.navigation.state).toBe('loading');
  // The previous table remains mounted during route loading. A changing data
  // identity must not cause an unbounded page-index reset/render loop here.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(screen.getByRole('heading', { name: '精选文章' })).toBeTruthy();
  await act(async () => {
    release();
    await gate;
  });
  expect(
    await screen.findByRole('heading', { name: '编辑器已打开' }),
  ).toBeTruthy();
  expect(
    screen.getByRole('link', { name: '精选文章' }).getAttribute('aria-current'),
  ).toBe('page');
});
