import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../App';
import { TOKEN_STORAGE_KEY } from '../api/client';
import { MOCK_TOKEN } from '../mocks/fixtures/auth';
import { renderWithProviders } from '../test/renderWithProviders';

describe('Protected routing (R1.11)', () => {
  it('redirects unauthenticated visitors to the Login screen', async () => {
    renderWithProviders(<App />, '/dashboard');

    expect(await screen.findByRole('heading', { name: 'Sign In' })).toBeInTheDocument();
  });

  it('renders the app shell for a visitor with a valid stored token', async () => {
    const user = userEvent.setup();
    localStorage.setItem(TOKEN_STORAGE_KEY, MOCK_TOKEN);
    renderWithProviders(<App />, '/dashboard');

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Profile menu' }));
    expect(screen.getByText('Demo User')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Logout' })).toBeInTheDocument();
  });

  it('clears an invalid stored token and returns to Login', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'invalid-token');
    renderWithProviders(<App />, '/dashboard');

    expect(await screen.findByRole('heading', { name: 'Sign In' })).toBeInTheDocument();
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });
});
