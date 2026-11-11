import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useEffect } from 'react';
import { ToastProvider } from '../components/ui';
import { ApiError, startOutboxSync } from '../lib/api';
import { useAuthStore } from '../lib/auth-store';
import { router } from './router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status < 500) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: true,
    },
  },
});

function applyTheme(theme: string, density: string, reducedMotion: boolean) {
  const resolved =
    theme === 'light' || theme === 'dark'
      ? theme
      : window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.density = density;
  document.documentElement.dataset.reducedMotion = reducedMotion ? 'true' : 'false';
}

export function Providers() {
  useEffect(() => {
    const stop = startOutboxSync();
    return stop;
  }, []);

  useEffect(() => {
    const apply = () => {
      const settings = useAuthStore.getState().settings;
      applyTheme(
        settings?.theme ?? 'system',
        settings?.density ?? 'comfortable',
        Boolean(settings?.reduced_motion),
      );
    };
    apply();
    const unsubscribe = useAuthStore.subscribe(apply);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', apply);
    return () => {
      unsubscribe();
      media.removeEventListener('change', apply);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  );
}
