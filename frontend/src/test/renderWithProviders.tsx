import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { AuthProvider } from '../auth/AuthContext';
import { TOKEN_STORAGE_KEY } from '../api/client';
import { MOCK_TOKEN } from '../mocks/fixtures/auth';

export function renderWithProviders(ui: ReactElement, route = '/'): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>{ui}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Renders the real app with a stored mock token so protected inventory pages load. */
export function renderAuthenticatedApp(route = '/dashboard'): RenderResult {
  localStorage.setItem(TOKEN_STORAGE_KEY, MOCK_TOKEN);
  return renderWithProviders(<App />, route);
}
