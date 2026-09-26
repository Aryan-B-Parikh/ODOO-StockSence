import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderAuthenticatedApp } from '../test/renderWithProviders';

/** Reads the numeric value rendered next to a KPI/summary label. */
function statValue(label: string): string {
  const labelElement = screen.getByText(label);
  return labelElement.parentElement?.querySelector('.kpi-value')?.textContent ?? '';
}

/**
 * Dashboard tests against the §5 mocks — KPIs (R2.2-R2.15) and dynamic filters
 * (R2.7-R2.10) must reflect real data.
 */
describe('Dashboard', () => {
  it('renders KPI cards and Receipt/Delivery summary cards from real data', async () => {
    renderAuthenticatedApp('/dashboard');

    await screen.findByText('Total Products in Stock');

    expect(statValue('Total Products in Stock')).toBe('5'); // rod, plate, hammer, drill, box
    expect(statValue('Low Stock / Out of Stock')).toBe('2'); // box ≤ 50, screw ≤ 500
    expect(statValue('Pending Receipts')).toBe('2');
    expect(statValue('Pending Deliveries')).toBe('2');
    expect(statValue('Internal Transfers Scheduled')).toBe('1');

    expect(statValue('to receive')).toBe('1');
    expect(statValue('to Deliver')).toBe('1');
    expect(statValue('waiting')).toBe('1');
    expect(screen.getAllByText('Late').length).toBe(2);
  });

  it('filters KPIs by warehouse (R2.9)', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/dashboard');
    await screen.findByText('Total Products in Stock');

    await user.selectOptions(screen.getByLabelText('Warehouse'), '10000000-0000-4000-8000-000000000002');

    // Secondary Warehouse only holds Cardboard Box (20 pcs ≤ reorder min 50).
    await waitFor(() => expect(statValue('Total Products in Stock')).toBe('1'));
    expect(statValue('Low Stock / Out of Stock')).toBe('1');
    expect(statValue('Pending Deliveries')).toBe('0');
    expect(statValue('Pending Receipts')).toBe('1');
  });

  it('filters by status so only Waiting documents count (R2.8)', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/dashboard');
    await screen.findByText('Total Products in Stock');

    await user.selectOptions(screen.getByLabelText('Status'), 'WAITING');

    await waitFor(() => expect(statValue('waiting')).toBe('1'));
    expect(statValue('Pending Deliveries')).toBe('1');
    expect(statValue('Pending Receipts')).toBe('0');
  });

  it('filters by document type (R2.7)', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/dashboard');
    await screen.findByText('Total Products in Stock');

    await user.selectOptions(screen.getByLabelText('Document type'), 'RECEIPT');

    await waitFor(() => expect(statValue('Pending Deliveries')).toBe('0'));
    expect(statValue('Pending Receipts')).toBe('2');
    expect(statValue('Internal Transfers Scheduled')).toBe('0');
  });

  it('filters by category (R2.10)', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/dashboard');
    await screen.findByText('Total Products in Stock');

    await user.selectOptions(screen.getByLabelText('Category'), '30000000-0000-4000-8000-000000000003');

    await waitFor(() => expect(statValue('Total Products in Stock')).toBe('1')); // Cardboard Box
    expect(statValue('Low Stock / Out of Stock')).toBe('2'); // box ≤ 50 and screw ≤ 500
  });

  it('shows zeros for a warehouse without data (empty state)', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/dashboard');
    await screen.findByText('Total Products in Stock');

    await user.selectOptions(screen.getByLabelText('Warehouse'), '10000000-0000-4000-8000-000000000003');

    await waitFor(() => expect(statValue('Total Products in Stock')).toBe('0'));
    expect(statValue('Pending Receipts')).toBe('0');
    expect(statValue('Pending Deliveries')).toBe('0');
  });

  it('exposes the documented dashboard links (R2.16, R2.17)', async () => {
    renderAuthenticatedApp('/dashboard');

    expect(await screen.findByRole('link', { name: 'List the available stock' })).toHaveAttribute(
      'href',
      '/products/stock',
    );
    expect(screen.getByRole('link', { name: 'Display history of In/Out stocks' })).toHaveAttribute(
      'href',
      '/move-history',
    );
    expect(screen.getByRole('link', { name: 'Receipt' })).toHaveAttribute('href', '/operations/receipts');
    expect(screen.getByRole('link', { name: 'Delivery' })).toHaveAttribute('href', '/operations/deliveries');
    expect(screen.getByRole('link', { name: 'Adjustment' })).toHaveAttribute(
      'href',
      '/operations/adjustments',
    );
  });
});
