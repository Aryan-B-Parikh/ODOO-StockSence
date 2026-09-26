import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderAuthenticatedApp } from '../../test/renderWithProviders';
import { selectWhenReady } from '../../test/selectWhenReady';

const MAIN_STOCK = '20000000-0000-4000-8000-000000000001';
const RACK_A = '20000000-0000-4000-8000-000000000002';
const RACK_B = '20000000-0000-4000-8000-000000000003';
const STEEL_PLATE = '40000000-0000-4000-8000-000000000002';
const WOOD_SCREW = '40000000-0000-4000-8000-000000000006';

/** Internal Transfers UI tests (R7, PHASE4_DECISIONS §1). */
describe('Internal Transfers', () => {
  it('lists transfers and shows Draft/Ready/Done/Canceled kanban columns', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/operations/transfers');

    expect(await screen.findByText('WH/INT/0001')).toBeInTheDocument();
    expect(screen.getByText('WH/INT/0002')).toBeInTheDocument();
    expect(screen.getAllByText('Rack A').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Kanban' }));
    expect((await screen.findAllByText('Ready')).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /WH\/INT\/0001/ })).toBeInTheDocument();
  });

  it('searches and filters by status', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/operations/transfers');

    await screen.findByText('WH/INT/0001');
    await user.type(screen.getByLabelText('Search transfers'), 'INT/0002');
    expect(await screen.findByText('WH/INT/0002')).toBeInTheDocument();
    expect(screen.queryByText('WH/INT/0001')).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText('Search transfers'));
    await user.selectOptions(screen.getByLabelText('Filter transfers by status'), 'DONE');
    expect(await screen.findByText('WH/INT/0001')).toBeInTheDocument();
    expect(screen.queryByText('WH/INT/0002')).not.toBeInTheDocument();
  });

  it('creates a transfer and walks Draft → Ready → Done (R7.2)', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/operations/transfers/new');

    await selectWhenReady(user, 'From Location', RACK_A);
    await selectWhenReady(user, 'To Location', RACK_B);
    await selectWhenReady(user, 'Product for line 1', STEEL_PLATE);
    await user.clear(screen.getByLabelText('Quantity for line 1'));
    await user.type(screen.getByLabelText('Quantity for line 1'), '2');
    await user.click(screen.getByRole('button', { name: 'Create Transfer' }));

    expect(await screen.findByRole('heading', { name: 'Internal Transfer' })).toBeInTheDocument();
    expect(screen.getByText(/WH\/INT\/\d{4}/)).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText(/stock is reserved/)).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Validate' }));
    expect(await screen.findByText(/stock moved between locations/)).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('blocks confirming when free-to-use stock is insufficient (07 transfer-1)', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/operations/transfers/new');

    await selectWhenReady(user, 'From Location', MAIN_STOCK);
    await selectWhenReady(user, 'To Location', RACK_B);
    await selectWhenReady(user, 'Product for line 1', WOOD_SCREW);
    await user.clear(screen.getByLabelText('Quantity for line 1'));
    await user.type(screen.getByLabelText('Quantity for line 1'), '100');
    await user.click(screen.getByRole('button', { name: 'Create Transfer' }));

    await screen.findByText('Draft');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText(/Insufficient free-to-use stock/)).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('validates source ≠ destination client-side', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/operations/transfers/new');

    await selectWhenReady(user, 'From Location', RACK_A);
    await selectWhenReady(user, 'To Location', RACK_A);
    await selectWhenReady(user, 'Product for line 1', STEEL_PLATE);
    await user.click(screen.getByRole('button', { name: 'Create Transfer' }));

    expect(await screen.findByText('Source and destination locations must differ')).toBeInTheDocument();
  });

  it('cancels a Draft transfer', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/operations/transfers/64000000-0000-4000-8000-000000000002');

    await screen.findByText('WH/INT/0002');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('heading', { name: 'Cancel transfer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel transfer' }));

    expect(await screen.findByText(/canceled\./)).toBeInTheDocument();
    expect(screen.getByText('Canceled')).toBeInTheDocument();
  });

  it('opens a Done transfer read-only', async () => {
    renderAuthenticatedApp('/operations/transfers/64000000-0000-4000-8000-000000000001');

    expect(await screen.findByText('WH/INT/0001')).toBeInTheDocument();
    expect(screen.getByText('Steel Plate')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
    const row = screen.getByText('Steel Plate').closest('tr')!;
    expect(within(row).getByText('10')).toBeInTheDocument();
  });
});
