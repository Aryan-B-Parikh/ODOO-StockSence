import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderAuthenticatedApp } from '../../test/renderWithProviders';

/** Products — Stock tab tests (IMG:13, R4.6, R4.7, R11.1). */
describe('Products — Stock tab', () => {
  it('lists stock with cost, on hand, free to use and low/out-of-stock badges (BR22)', async () => {
    renderAuthenticatedApp('/products/stock');

    const rodRow = (await screen.findByText(/Steel Rod/)).closest('tr')!;
    expect(within(rodRow).getAllByText('100').length).toBeGreaterThanOrEqual(2); // On Hand + Free to Use
    expect(within(rodRow).getByText('In stock')).toBeInTheDocument();

    const boxRow = screen.getByText(/Cardboard Box/).closest('tr')!;
    expect(within(boxRow).getByText('Low')).toBeInTheDocument();

    const screwRow = screen.getByText(/Wood Screw 4x40/).closest('tr')!;
    expect(within(screwRow).getByText('Out of stock')).toBeInTheDocument();
  });

  it('filters stock by warehouse', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/products/stock');

    await screen.findByText(/Steel Rod/);
    await user.selectOptions(screen.getByLabelText('Filter by warehouse'), '10000000-0000-4000-8000-000000000002');

    expect(await screen.findByText(/Cardboard Box/)).toBeInTheDocument();
    expect(screen.queryByText(/Steel Rod/)).not.toBeInTheDocument();
  });

  it('searches stock by product or SKU', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/products/stock');

    await screen.findByText(/Steel Rod/);
    await user.type(screen.getByLabelText('Search stock'), 'PKG-BOX');

    expect(await screen.findByText(/Cardboard Box/)).toBeInTheDocument();
    expect(screen.queryByText(/Steel Rod/)).not.toBeInTheDocument();
  });

  it('updates on-hand quantity inline (R4.7)', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/products/stock');

    const rodRow = (await screen.findByText(/Steel Rod/)).closest('tr')!;
    await user.click(within(rodRow).getByRole('button', { name: 'Edit' }));

    const input = screen.getByLabelText('On hand for Steel Rod');
    await user.clear(input);
    await user.type(input, '80');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const updatedRow = (await screen.findByText(/Steel Rod/)).closest('tr')!;
    expect(within(updatedRow).getAllByText('80').length).toBeGreaterThanOrEqual(2); // On Hand + Free to Use
  });

  it('rejects a negative on-hand value client-side (BR27 / BR13)', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/products/stock');

    const rodRow = (await screen.findByText(/Steel Rod/)).closest('tr')!;
    await user.click(within(rodRow).getByRole('button', { name: 'Edit' }));

    const input = screen.getByLabelText('On hand for Steel Rod');
    await user.clear(input);
    await user.type(input, '-5');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('On hand quantity must be 0 or more')).toBeInTheDocument();
  });
});
