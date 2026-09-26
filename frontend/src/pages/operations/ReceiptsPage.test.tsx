import { screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderAuthenticatedApp } from '../../test/renderWithProviders';

/** Selects an option once the asynchronously loaded options are present. */
async function selectWhenReady(user: UserEvent, label: string, value: string) {
  const select = await screen.findByLabelText(label);
  await waitFor(() => {
    const options = Array.from((select as HTMLSelectElement).options).map((option) => option.value);
    expect(options).toContain(value);
  });
  await user.selectOptions(select, value);
}

/** Receipts UI tests against the §6 contract mocks (R5.4-R5.12). */
describe('Receipts', () => {
  it('lists receipts with reference, parties, date and status', async () => {
    renderAuthenticatedApp('/operations/receipts');

    expect(await screen.findByText('WH/IN/0001')).toBeInTheDocument();
    expect(screen.getByText('WH/IN/0003')).toBeInTheDocument();
    expect(screen.getAllByText('Steel Supplier Co.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Done').length).toBeGreaterThanOrEqual(2); // filter option + badges
    expect(screen.getAllByText('Draft').length).toBeGreaterThanOrEqual(2);
  });

  it('searches by reference and filters by status', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/operations/receipts');

    await screen.findByText('WH/IN/0001');
    await user.type(screen.getByLabelText('Search receipts'), 'WH/IN/0003');
    expect(await screen.findByText('WH/IN/0003')).toBeInTheDocument();
    expect(screen.queryByText('WH/IN/0001')).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText('Search receipts'));
    await user.selectOptions(screen.getByLabelText('Filter receipts by status'), 'READY');
    expect(await screen.findByText('WH2/IN/0001')).toBeInTheDocument();
    expect(screen.queryByText('WH/IN/0003')).not.toBeInTheDocument();
  });

  it('switches to the Kanban view grouped by status (R5.6)', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/operations/receipts');

    await screen.findByText('WH/IN/0001');
    await user.click(screen.getByRole('button', { name: 'Kanban' }));

    expect((await screen.findAllByText('Ready')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Done').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Draft').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Canceled').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /WH\/IN\/0003/ })).toBeInTheDocument();
  });

  it('creates a receipt and walks Draft → Ready → Done (R5.3, R5.11)', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/operations/receipts/new');

    await selectWhenReady(user, 'Receive From', '70000000-0000-4000-8000-000000000001');
    await selectWhenReady(user, 'To Location', '20000000-0000-4000-8000-000000000001');
    await selectWhenReady(user, 'Product for line 1', '40000000-0000-4000-8000-000000000001');
    await user.clear(screen.getByLabelText('Quantity for line 1'));
    await user.type(screen.getByLabelText('Quantity for line 1'), '4');
    await user.click(screen.getByRole('button', { name: 'Create Receipt' }));

    expect(await screen.findByRole('heading', { name: 'Receipt' })).toBeInTheDocument();
    const reference = screen.getByText(/WH\/IN\/\d{4}/);
    expect(reference).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText(/ready to receive/)).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Validate' }));
    expect(await screen.findByText(/stock has increased/)).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Print' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('validates required fields client-side', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/operations/receipts/new');

    await screen.findByLabelText('Receive From');
    await selectWhenReady(user, 'Product for line 1', '40000000-0000-4000-8000-000000000001');
    await user.click(screen.getByRole('button', { name: 'Create Receipt' }));

    expect((await screen.findAllByText('Invalid id')).length).toBeGreaterThanOrEqual(1); // missing contact/location
  });

  it('cancels a Draft receipt after confirmation (BR25)', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/operations/receipts');

    await screen.findByText('WH/IN/0003');
    const row = screen.getByText('WH/IN/0003').closest('tr')!;
    await user.click(within(row).getByRole('link', { name: 'Open' }));

    const cancelButton = await screen.findByRole('button', { name: 'Cancel' });
    await user.click(cancelButton);
    expect(await screen.findByRole('heading', { name: 'Cancel receipt' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel receipt' }));

    expect(await screen.findByText(/canceled\./)).toBeInTheDocument();
    expect(screen.getByText('Canceled')).toBeInTheDocument();
  });

  it('opens an existing Done receipt read-only with print enabled (R5.12)', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/operations/receipts/60000000-0000-4000-8000-000000000001');

    expect(await screen.findByText('WH/IN/0001')).toBeInTheDocument();
    expect(screen.getByText('Steel Rod')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Print' }));
    expect(await screen.findByRole('heading', { name: /Print WH\/IN\/0001/ })).toBeInTheDocument();
  });
});
