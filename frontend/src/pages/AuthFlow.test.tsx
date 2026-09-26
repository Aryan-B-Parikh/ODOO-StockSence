import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../App';
import { renderWithProviders } from '../test/renderWithProviders';

/**
 * MSW-backed auth flow tests (Phase 1 integration checkpoint):
 * signup → login → dashboard redirect, plus login failure copy (BR5).
 */
describe('Auth screens', () => {
  it('shows client-side validation errors on empty signup (BR1-BR4)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />, '/signup');

    await user.click(screen.getByRole('button', { name: 'Sign Up' }));

    expect(await screen.findByText('Login Id is required')).toBeInTheDocument();
    expect(screen.getByText('Email Id is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(screen.getByText('Re-enter Password is required')).toBeInTheDocument();
  });

  it('mirrors the password composition rule client-side (BR3)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />, '/signup');

    await user.type(screen.getByLabelText('Login Id'), 'newuser01');
    await user.type(screen.getByLabelText('Email Id'), 'new@example.com');
    await user.type(screen.getByLabelText('Password'), 'weakpass1!');
    await user.type(screen.getByLabelText('Re-Enter Password'), 'weakpass1!');
    await user.click(screen.getByRole('button', { name: 'Sign Up' }));

    expect(await screen.findByText('Password must contain an uppercase letter')).toBeInTheDocument();
  });

  it('surfaces the duplicate loginId error from the server (BR1)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />, '/signup');

    await user.type(screen.getByLabelText('Login Id'), 'demo01');
    await user.type(screen.getByLabelText('Email Id'), 'other@example.com');
    await user.type(screen.getByLabelText('Password'), 'Abcdefg1!');
    await user.type(screen.getByLabelText('Re-Enter Password'), 'Abcdefg1!');
    await user.click(screen.getByRole('button', { name: 'Sign Up' }));

    expect(await screen.findByText('Login Id already in use')).toBeInTheDocument();
  });

  it('completes signup → login → dashboard against the contract mocks (R1.11)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />, '/signup');

    await user.type(screen.getByLabelText('Login Id'), 'newuser01');
    await user.type(screen.getByLabelText('Email Id'), 'new@example.com');
    await user.type(screen.getByLabelText('Password'), 'Abcdefg1!');
    await user.type(screen.getByLabelText('Re-Enter Password'), 'Abcdefg1!');
    await user.click(screen.getByRole('button', { name: 'Sign Up' }));

    expect(await screen.findByText('Account created successfully. Please sign in.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Login Id'), 'newuser01');
    await user.type(screen.getByLabelText('Password'), 'Abcdefg1!');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText(/Welcome, newuser01/)).toBeInTheDocument();
  });

  it('shows the exact generic error on bad credentials (BR5)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />, '/login');

    await user.type(screen.getByLabelText('Login Id'), 'demo01');
    await user.type(screen.getByLabelText('Password'), 'Wrong123!');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(await screen.findByText('Invalid Login Id or Password')).toBeInTheDocument();
  });

  it('runs the OTP reset flow and returns to login (R1.9, R1.10)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />, '/forgot-password');

    await user.type(screen.getByLabelText('Login Id or Email Id'), 'demo01');
    await user.click(screen.getByRole('button', { name: 'Send OTP' }));

    expect(await screen.findByText(/your OTP is/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('OTP'), '123456');
    await user.type(screen.getByLabelText('New Password'), 'Newpass1!');
    await user.type(screen.getByLabelText('Confirm New Password'), 'Newpass1!');
    await user.click(screen.getByRole('button', { name: 'Reset Password' }));

    expect(await screen.findByText('Password reset successful. Please sign in.')).toBeInTheDocument();
  });
});
