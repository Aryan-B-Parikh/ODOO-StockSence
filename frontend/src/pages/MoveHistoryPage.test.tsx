import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderAuthenticatedApp } from '../test/renderWithProviders';

/** Move History UI tests (IMG:7/9, R9, PHASE4_DECISIONS §3). */
describe('Move History', () => {
  it('renders ledger rows coloured by direction (R9.3-R9.5)', async () => {
    const { container } = renderAuthenticatedApp('/move-history');

    expect(await screen.findByText('WH/IN/0001')).toBeInTheDocument();
    expect(screen.getByText('WH/OUT/0001')).toBeInTheDocument();
    expect(screen.getAllByText('WH/INT/0001').length).toBe(2); // transfer has two legs
    expect(screen.getByText('WH/ADJ/0005')).toBeInTheDocument();

    expect(container.querySelectorAll('tr.row-move-in').length).toBeGreaterThanOrEqual(4);
    expect(container.querySelectorAll('tr.row-move-out').length).toBeGreaterThanOrEqual(2);
  });

  it('searches by reference and filters by type and direction (R9.6)', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/move-history');

    await screen.findByText('WH/IN/0001');
    await user.type(screen.getByLabelText('Search move history'), 'WH/INT/0001');
    expect(await screen.findAllByText('WH/INT/0001')).toHaveLength(2);
    expect(screen.queryByText('WH/IN/0001')).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText('Search move history'));
    await user.selectOptions(screen.getByLabelText('Filter by document type'), 'ADJUSTMENT');
    expect(await screen.findByText('WH/ADJ/0005')).toBeInTheDocument();
    expect(screen.queryByText('WH/IN/0001')).not.toBeInTheDocument();
    expect(screen.queryByText('WH/INT/0001')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Filter by document type'), '');
    await user.selectOptions(screen.getByLabelText('Filter by direction'), 'OUT');
    expect(await screen.findByText('WH/OUT/0001')).toBeInTheDocument();
    expect(screen.queryByText('WH/IN/0001')).not.toBeInTheDocument();
  });

  it('filters by warehouse and location', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/move-history');

    await screen.findByText('WH/IN/0001');
    await user.selectOptions(
      screen.getByLabelText('Filter by warehouse'),
      '10000000-0000-4000-8000-000000000002',
    );
    expect(await screen.findByText('WH2/ADJ/0001')).toBeInTheDocument();
    expect(screen.queryByText('WH/IN/0001')).not.toBeInTheDocument();

    await user.selectOptions(
      screen.getByLabelText('Filter by warehouse'),
      '10000000-0000-4000-8000-000000000001',
    );
    await user.selectOptions(
      screen.getByLabelText('Filter by location'),
      '20000000-0000-4000-8000-000000000003',
    );
    expect(await screen.findAllByText('WH/INT/0001')).toHaveLength(2);
    expect(screen.queryByText('WH/IN/0001')).not.toBeInTheDocument();
  });

  it('groups by direction in Kanban view', async () => {
    const user = userEvent.setup();
    renderAuthenticatedApp('/move-history');

    await screen.findByText('WH/IN/0001');
    await user.click(screen.getByRole('button', { name: 'Kanban' }));

    expect((await screen.findAllByText('In')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Out').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/WH\/IN\/0001/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/WH\/OUT\/0001/).length).toBeGreaterThan(0);
  });
});
