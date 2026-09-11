import type { RouteObject } from 'react-router';
import { App } from '@/App';
export const routes: RouteObject[] = [
  {
    element: <App />,
    hydrateFallbackElement: <p role="status">Loading workspace…</p>,
    children: [
      {
        index: true,
        lazy: async () => ({
          Component: (await import('@/features/overview')).default,
        }),
      },
      {
        path: 'content',
        lazy: async () => ({
          Component: (await import('@/features/content/list')).default,
        }),
      },
      {
        path: 'content/:id',
        lazy: async () => ({
          Component: (await import('@/features/content/editor')).default,
        }),
      },
      {
        path: 'reviews',
        lazy: async () => ({
          Component: (await import('@/features/reviews/list')).default,
        }),
      },
      {
        path: 'reviews/history',
        lazy: async () => ({
          Component: (await import('@/features/reviews/history')).default,
        }),
      },
      {
        path: 'reviews/pending/:id',
        lazy: async () => ({
          Component: (await import('@/features/reviews/workspace')).default,
        }),
      },
      {
        path: 'reviews/history/:reviewId',
        lazy: async () => ({
          Component: (await import('@/features/reviews/workspace')).default,
        }),
      },
      {
        path: 'tags',
        lazy: async () => ({
          Component: (await import('@/features/tags/page')).default,
        }),
      },
      {
        path: 'users',
        lazy: async () => ({
          Component: (await import('@/features/people/users')).default,
        }),
      },
      {
        path: 'profile',
        lazy: async () => ({
          Component: (await import('@/features/people/profile')).default,
        }),
      },
      {
        path: 'authors',
        lazy: async () => ({
          Component: (await import('@/features/people/authors')).default,
        }),
      },
      {
        path: 'authors/:id',
        lazy: async () => ({
          Component: (await import('@/features/people/author')).default,
        }),
      },
      {
        path: 'audit',
        lazy: async () => ({
          Component: (await import('@/features/audit/page')).default,
        }),
      },
      { path: '*', element: <h1>页面不可用</h1> },
    ],
  },
];
