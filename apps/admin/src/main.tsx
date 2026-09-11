import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { routes } from '@/app/routes';
import './styles.css';
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});
// Commit lazy route changes synchronously; the pinned React/Router transition
// combination can otherwise retain the previous screen on first editor navigation.
const router = createBrowserRouter(routes);
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider useTransitions={false} router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
