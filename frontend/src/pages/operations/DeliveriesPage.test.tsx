import { screen, waitFor } from '@testing-library/react';
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

const MAIN_STOCK = '20000000-0000-4000-8000-000000000001';
const CUSTOMER = '70000000-0000-4000-8000-000000000002';
const STEEL_ROD = '40000000-0000-4000-8000-000000000001';
const WOOD_SCREW = '40000000-0000-4000-8000-000000000006';

/** Delivery UI tests against the §7 contract mocks (R6.4-R6.12, reservations). */
describe('Deliveries', () => {
  it('lists deliveries and shows the Waiting column in Kanban (R6.6)', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/operations/deliveries');

    expect(await screen.findByText('WH/OUT/0003')).toBeInTheDocument();
    expect(screen.getAllByText('Waiting').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Kanban' }));
    expect((await screen.findAllByText('Draft')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Waiting').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /WH\/OUT\/0002/ })).toBeInTheDocument();
  });

  it('shows the waiting banner and disables validation for a WAITING delivery (R6.12)', async () => {
    renderAuthenticatedApp('/operations/deliveries/62000000-0000-4000-8000-000000000003');

    expect(await screen.findByText('WH/OUT/0003')).toBeInTheDocument();
    expect(screen.getByText(/Waiting for stock to become available/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Waiting for stock' })).toBeDisabled();
  });

  it('creates a delivery when stock is available and walks Draft → Ready → Done (R6.2, R6.3)', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/operations/deliveries/new');

    await selectWhenReady(user, 'From Location', MAIN_STOCK);
    await selectWhenReady(user, 'Customer', CUSTOMER);
    await selectWhenReady(user, 'Product for line 1', STEEL_ROD);
    await user.clear(screen.getByLabelText('Quantity for line 1'));
    await user.type(screen.getByLabelText('Quantity for line 1'), '2');
    await user.click(screen.getByRole('button', { name: 'Create Delivery' }));

    expect(await screen.findByRole('heading', { name: 'Delivery' })).toBeInTheDocument();
    expect(screen.getByText(/WH\/OUT\/\d{4}/)).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Pick & Pack' }));
    expect(await screen.findByText(/picked & packed — ready to deliver/)).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Validate' }));
    expect(await screen.findByText(/stock has decreased/)).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Print' })).toBeInTheDocument();
  });

  it('creates a WAITING delivery with a red out-of-stock row when stock is short (BR18, R6.11)', async () => {
    const user = userEvent.setup();
    const { container } = renderAuthenticatedApp('/operations/deliveries/new');

    await selectWhenReady(user, 'From Location', MAIN_STOCK);
    await selectWhenReady(user, 'Customer', CUSTOMER);
    await selectWhenReady(user, 'Product for line 1', WOOD_SCREW);
    await user.clear(screen.getByLabelText('Quantity for line 1'));
    await user.type(screen.getByLabelText('Quantity for line 1'), '100');
    await user.click(screen.getByRole('button', { name: 'Create Delivery' }));

    expect(await screen.findByText(/Waiting for stock to become available/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Waiting for stock' })).toBeDisabled();
    expect(container.querySelectorAll('tr.row-danger').length).toBe(1);
  });

  it('cancels a Draft delivery (BR25)', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/operations/deliveries/62000000-0000-4000-8000-000000000002');

    await screen.findByText('WH/OUT/0002');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('heading', { name: 'Cancel delivery' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel delivery' }));

    expect(await screen.findByText(/canceled\./)).toBeInTheDocument();
    expect(screen.getByText('Canceled')).toBeInTheDocument();
  });

  it('validates required fields client-side', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/operations/deliveries/new');

    await screen.findByLabelText('From Location');
    await selectWhenReady(user, 'Product for line 1', STEEL_ROD);
    await user.click(screen.getByRole('button', { name: 'Create Delivery' }));

    expect((await screen.findAllByText('Invalid id')).length).toBeGreaterThanOrEqual(1);
  });
});
