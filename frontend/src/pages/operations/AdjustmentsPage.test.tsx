import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderAuthenticatedApp } from '../../test/renderWithProviders';
import { selectWhenReady } from '../../test/selectWhenReady';

const MAIN_STOCK = '20000000-0000-4000-8000-000000000001';
const RACK_B = '20000000-0000-4000-8000-000000000003';
const CLAW_HAMMER = '40000000-0000-4000-8000-000000000003';
const CORDLESS_DRILL = '40000000-0000-4000-8000-000000000004';

/** Inventory Adjustment UI tests (R8, adjust-1, PHASE4_DECISIONS §2). */
describe('Inventory Adjustment', () => {
  it('lists adjustments with recorded, counted and difference', async () => {
    renderAuthenticatedApp('/operations/adjustments');

    expect(await screen.findByText('WH/ADJ/0005')).toBeInTheDocument();
    expect(screen.getByText('2 units damaged in handling')).toBeInTheDocument();
    expect(screen.getByText('-2')).toBeInTheDocument();
  });

  it('filters adjustments by search', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/operations/adjustments');

    await screen.findByText('WH/ADJ/0005');
    await user.type(screen.getByLabelText('Search adjustments'), 'WH/ADJ/0005');
    expect(await screen.findByText('WH/ADJ/0005')).toBeInTheDocument();
    expect(screen.queryByText('WH/ADJ/0001')).not.toBeInTheDocument();
  });

  it('creates an adjustment with a live delta preview and applies it (R8.2/R8.3)', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/operations/adjustments');

    await screen.findByText('WH/ADJ/0005');
    await user.click(screen.getByRole('button', { name: 'New Adjustment' }));

    await selectWhenReady(user, 'Product', CLAW_HAMMER);
    await selectWhenReady(user, 'Location', MAIN_STOCK);

    // recorded 23 (10 initial + 20 receipt − 5 delivery − 2 adjustment)
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Recorded')).toBeInTheDocument();
    expect(await within(dialog).findByText('23')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Counted Quantity'), '20');
    expect(await within(dialog).findByText('-3')).toBeInTheDocument(); // delta preview

    await user.type(screen.getByLabelText('Reason / Note (optional)'), '3 missing');
    await user.click(screen.getByRole('button', { name: 'Apply Adjustment' }));

    expect(await screen.findByText(/applied \(-3\)/)).toBeInTheDocument();
    expect(await screen.findByText('3 missing')).toBeInTheDocument();
  });

  it('rejects a count below the open reservation (PHASE3_DECISIONS §7)', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/operations/adjustments');

    await screen.findByText('WH/ADJ/0005');
    await user.click(screen.getByRole('button', { name: 'New Adjustment' }));

    await selectWhenReady(user, 'Product', CORDLESS_DRILL);
    await selectWhenReady(user, 'Location', RACK_B);

    // drill has 8 on hand with 3 reserved by a Draft delivery
    await user.type(screen.getByLabelText('Counted Quantity'), '1');
    await user.click(screen.getByRole('button', { name: 'Apply Adjustment' }));

    expect(await screen.findByText(/Cannot set on-hand below the reserved quantity/)).toBeInTheDocument();
  });

  it('validates the form client-side', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/operations/adjustments');

    await screen.findByText('WH/ADJ/0005');
    await user.click(screen.getByRole('button', { name: 'New Adjustment' }));
    await user.click(screen.getByRole('button', { name: 'Apply Adjustment' }));

    expect(await screen.findByText('Counted quantity is required')).toBeInTheDocument();
  });
});
