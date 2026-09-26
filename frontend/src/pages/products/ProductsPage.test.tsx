import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderAuthenticatedApp } from '../../test/renderWithProviders';

/** Products — Catalog tab tests against the §2 contract mocks (R4.1-R4.5, BR28). */
describe('Products — Catalog tab', () => {
  it('lists products with SKU, category, UOM and reorder rules', async () => {
    renderAuthenticatedApp('/products');

    expect(await screen.findByText('Steel Rod')).toBeInTheDocument();
    expect(screen.getByText('STL-ROD-001')).toBeInTheDocument();
    expect(screen.getByText('Claw Hammer')).toBeInTheDocument();
    expect(screen.getAllByText('kg').length).toBeGreaterThan(0);
    expect(screen.getByText('50 / 500')).toBeInTheDocument();
  });

  it('searches by name or SKU against the API', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/products');

    expect(await screen.findByText('Steel Rod')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Search products'), 'hammer');

    expect(await screen.findByText('Claw Hammer')).toBeInTheDocument();
    expect(screen.queryByText('Steel Rod')).not.toBeInTheDocument();
  });

  it('filters by category', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/products');

    expect(await screen.findByText('Steel Rod')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Filter by category'), 'Tools');

    expect(await screen.findByText('Claw Hammer')).toBeInTheDocument();
    expect(screen.queryByText('Steel Rod')).not.toBeInTheDocument();
    expect(screen.queryByText('Cardboard Box')).not.toBeInTheDocument();
  });

  it('creates a product with initial stock (R4.1, R4.7)', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/products');

    await screen.findByText('Steel Rod');
    await user.click(screen.getByRole('button', { name: 'New Product' }));

    await user.type(screen.getByLabelText('Name'), 'Test Widget');
    await user.type(screen.getByLabelText('SKU / Code'), 'TST-WDG-001');
    await user.type(screen.getByLabelText('Unit of Measure'), 'pcs');
    await user.selectOptions(screen.getByLabelText('Location'), '20000000-0000-4000-8000-000000000001');
    await user.type(screen.getByLabelText('Quantity'), '5');
    await user.click(screen.getByRole('button', { name: 'Create Product' }));

    expect(await screen.findByText('Test Widget')).toBeInTheDocument();
    expect(screen.getByText('TST-WDG-001')).toBeInTheDocument();
  });

  it('shows the server-side duplicate SKU error (BR28)', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/products');

    await screen.findByText('Steel Rod');
    await user.click(screen.getByRole('button', { name: 'New Product' }));

    await user.type(screen.getByLabelText('Name'), 'Copycat');
    await user.type(screen.getByLabelText('SKU / Code'), 'STL-ROD-001');
    await user.type(screen.getByLabelText('Unit of Measure'), 'pcs');
    await user.click(screen.getByRole('button', { name: 'Create Product' }));

    expect(await screen.findByText('SKU already in use')).toBeInTheDocument();
  });

  it('validates required fields client-side (R4.1)', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/products');

    await screen.findByText('Steel Rod');
    await user.click(screen.getByRole('button', { name: 'New Product' }));
    await user.click(screen.getByRole('button', { name: 'Create Product' }));

    expect(await screen.findByText('Name is required')).toBeInTheDocument();
    expect(screen.getByText('SKU is required')).toBeInTheDocument();
    expect(screen.getByText('Unit of Measure is required')).toBeInTheDocument();
  });

  it('edits an existing product (R4.2)', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/products');

    const row = (await screen.findByText('Wood Screw 4x40')).closest('tr');
    expect(row).not.toBeNull();
    await user.click(within(row!).getByRole('button', { name: 'Edit' }));

    const nameInput = screen.getByLabelText('Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Wood Screw 4x40 (Bulk)');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByText('Wood Screw 4x40 (Bulk)')).toBeInTheDocument();
  });
});
