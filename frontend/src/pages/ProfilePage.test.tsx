import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderAuthenticatedApp } from '../test/renderWithProviders';

/** My Profile UI tests — display name, password change, logout (02_UI_FUNCTIONALITY). */
describe('My Profile', () => {
  it('shows the account information', async () => {
    renderAuthenticatedApp('/profile');

    expect(await screen.findByText('demo01')).toBeInTheDocument();
    expect(screen.getByText('demo@example.com')).toBeInTheDocument();
    expect(screen.getByLabelText('Display Name')).toHaveValue('Demo User');
  });

  it('updates the display name', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/profile');

    const input = await screen.findByLabelText('Display Name');
    await user.clear(input);
    await user.type(input, 'Ron The Manager');
    await user.click(screen.getByRole('button', { name: 'Save Profile' }));

    expect(await screen.findByText('Profile updated.')).toBeInTheDocument();
  });

  it('rejects a password change with the wrong old password', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/profile');

    await user.type(await screen.findByLabelText('Old Password'), 'Wrong123!');
    await user.type(screen.getByLabelText('New Password'), 'Newpass1!');
    await user.type(screen.getByLabelText('Confirm New Password'), 'Newpass1!');
    await user.click(screen.getByRole('button', { name: 'Change Password' }));

    expect(await screen.findByText('Old password is incorrect')).toBeInTheDocument();
  });

  it('validates password composition client-side', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/profile');

    await user.type(await screen.findByLabelText('Old Password'), 'Demo@123');
    await user.type(screen.getByLabelText('New Password'), 'weak');
    await user.type(screen.getByLabelText('Confirm New Password'), 'weak');
    await user.click(screen.getByRole('button', { name: 'Change Password' }));

    expect(await screen.findByText('Password must be more than 8 characters long')).toBeInTheDocument();
  });

  it('changes the password with the correct old password', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/profile');

    await user.type(await screen.findByLabelText('Old Password'), 'Demo@123');
    await user.type(screen.getByLabelText('New Password'), 'Newpass1!');
    await user.type(screen.getByLabelText('Confirm New Password'), 'Newpass1!');
    await user.click(screen.getByRole('button', { name: 'Change Password' }));

    expect(await screen.findByText('Password changed.')).toBeInTheDocument();
  });

  it('logs out and returns to the login screen', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/profile');

    await screen.findByText('demo01');
    await user.click(screen.getByRole('button', { name: 'Logout' }));

    expect(await screen.findByRole('heading', { name: 'Sign In' })).toBeInTheDocument();
  });
});
