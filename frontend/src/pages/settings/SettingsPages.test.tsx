import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderAuthenticatedApp } from '../../test/renderWithProviders';

/** Settings screens: Warehouse (IMG:11) and Location (IMG:8/10), R10, BR29. */
describe('Settings — Warehouse', () => {
  it('lists warehouses with short codes', async () => {
    renderAuthenticatedApp('/settings/warehouses');

    expect(await screen.findByText('Main Warehouse')).toBeInTheDocument();
    expect(screen.getByText('Secondary Warehouse')).toBeInTheDocument();
    expect(screen.getByText('WH')).toBeInTheDocument();
  });

  it('creates a warehouse and rejects duplicate short codes', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/settings/warehouses');

    await screen.findByText('Main Warehouse');
    await user.click(screen.getByRole('button', { name: 'New Warehouse' }));
    await user.type(screen.getByLabelText('Name'), 'Test Warehouse');
    await user.type(screen.getByLabelText('Short Code'), 'TWH');
    await user.click(screen.getByRole('button', { name: 'Create Warehouse' }));

    expect(await screen.findByText('Test Warehouse')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'New Warehouse' }));
    await user.type(screen.getByLabelText('Name'), 'Duplicate');
    await user.type(screen.getByLabelText('Short Code'), 'WH');
    await user.click(screen.getByRole('button', { name: 'Create Warehouse' }));

    expect(await screen.findByText('Short Code already in use')).toBeInTheDocument();
  });
});

describe('Settings — Location', () => {
  it('lists locations with their warehouse', async () => {
    renderAuthenticatedApp('/settings/locations');

    expect(await screen.findByText('Rack A')).toBeInTheDocument();
    expect(screen.getByText('RACKB')).toBeInTheDocument();
    expect(screen.getAllByText('Main Warehouse').length).toBeGreaterThan(0);
  });

  it('creates a location inside a warehouse (R10.2)', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/settings/locations');

    await screen.findByText('Rack A');
    await user.click(screen.getByRole('button', { name: 'New Location' }));
    await user.selectOptions(
      screen.getByLabelText('Warehouse'),
      '10000000-0000-4000-8000-000000000001',
    );
    await user.type(screen.getByLabelText('Name'), 'Zone X');
    await user.type(screen.getByLabelText('Short Code'), 'ZONEX');
    await user.click(screen.getByRole('button', { name: 'Create Location' }));

    expect(await screen.findByText('Zone X')).toBeInTheDocument();
  });

  it('makes the warehouse immutable when editing (BR29)', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/settings/locations');

    const row = (await screen.findByText('Rack A')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Edit' }));

    expect(await screen.findByText(/cannot be changed — BR29/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Warehouse')).not.toBeInTheDocument();

    const nameInput = screen.getByLabelText('Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Rack A1');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByText('Rack A1')).toBeInTheDocument();
  });
});
