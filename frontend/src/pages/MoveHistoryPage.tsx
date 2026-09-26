import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { MoveHistoryRow } from '@stocksense/shared';
import { listLocations, listWarehouses } from '../api/inventory';
import { getMoveHistory } from '../api/operations';
import { useAuth } from '../auth/AuthContext';
import { KanbanBoard } from '../components/KanbanBoard';
import { ListKanbanToggle, type ListViewMode } from '../components/ListKanbanToggle';
import { Pagination } from '../components/Pagination';
import { EmptyState, ErrorState, LoadingState } from '../components/StateMessages';
import { statusLabel } from '../components/status';

const PAGE_SIZE = 20;

const TYPE_LABELS: Record<string, string> = {
  RECEIPT: 'Receipt',
  DELIVERY: 'Delivery',
  TRANSFER: 'Internal Transfer',
  ADJUSTMENT: 'Adjustment',
};

/**
 * Move History — IMG:7/9, R9: one row per ledger entry, IN green / OUT red, searchable and
 * filterable, Kanban grouped by direction (PHASE4_DECISIONS §3).
 */
export function MoveHistoryPage() {
  const { token } = useAuth();

  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [direction, setDirection] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [view, setView] = useState<ListViewMode>('list');
  const [page, setPage] = useState(1);

  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => listWarehouses(token!),
    enabled: Boolean(token),
  });

  const locationsQuery = useQuery({
    queryKey: ['locations', { warehouseId }],
    queryFn: () => listLocations(token!, warehouseId || undefined),
    enabled: Boolean(token),
  });

  const historyQuery = useQuery({
    queryKey: ['move-history', { search, type, direction, warehouseId, locationId, dateFrom, dateTo, page, view }],
    queryFn: () =>
      getMoveHistory(token!, {
        search: search || undefined,
        type: type || undefined,
        direction: direction || undefined,
        warehouseId: warehouseId || undefined,
        locationId: locationId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page,
        pageSize: view === 'kanban' ? 100 : PAGE_SIZE,
      }),
    enabled: Boolean(token),
  });

  const rows = historyQuery.data?.data ?? [];
  const resetToFirstPage = () => setPage(1);

  const rowClass = (row: MoveHistoryRow) => (row.direction === 'IN' ? 'row-move-in' : 'row-move-out');

  return (
    <section className="page">
      <header className="page-header">
        <h1>Move History</h1>
        <Link className="btn btn-primary" to="/operations/receipts/new">
          New
        </Link>
      </header>

      <div className="card filter-bar">
        <input
          type="search"
          className="input"
          placeholder="Search reference, product or contact…"
          aria-label="Search move history"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            resetToFirstPage();
          }}
        />
        <select
          className="input"
          aria-label="Filter by document type"
          value={type}
          onChange={(event) => {
            setType(event.target.value);
            resetToFirstPage();
          }}
        >
          <option value="">All document types</option>
          <option value="RECEIPT">Receipts</option>
          <option value="DELIVERY">Deliveries</option>
          <option value="TRANSFER">Internal Transfers</option>
          <option value="ADJUSTMENT">Adjustments</option>
        </select>
        <select
          className="input"
          aria-label="Filter by direction"
          value={direction}
          onChange={(event) => {
            setDirection(event.target.value);
            resetToFirstPage();
          }}
        >
          <option value="">In &amp; Out</option>
          <option value="IN">In</option>
          <option value="OUT">Out</option>
        </select>
        <select
          className="input"
          aria-label="Filter by warehouse"
          value={warehouseId}
          onChange={(event) => {
            setWarehouseId(event.target.value);
            setLocationId('');
            resetToFirstPage();
          }}
        >
          <option value="">All warehouses</option>
          {(warehousesQuery.data ?? []).map((warehouse) => (
            <option key={warehouse.id} value={warehouse.id}>
              {warehouse.name}
            </option>
          ))}
        </select>
        <select
          className="input"
          aria-label="Filter by location"
          value={locationId}
          onChange={(event) => {
            setLocationId(event.target.value);
            resetToFirstPage();
          }}
        >
          <option value="">All locations</option>
          {(locationsQuery.data ?? []).map((location) => (
            <option key={location.id} value={location.id}>
              {location.name} ({location.shortCode})
            </option>
          ))}
        </select>
        <input
          type="date"
          className="input"
          aria-label="From date"
          value={dateFrom}
          onChange={(event) => {
            setDateFrom(event.target.value);
            resetToFirstPage();
          }}
        />
        <input
          type="date"
          className="input"
          aria-label="To date"
          value={dateTo}
          onChange={(event) => {
            setDateTo(event.target.value);
            resetToFirstPage();
          }}
        />
        <ListKanbanToggle
          view={view}
          onChange={(next) => {
            setView(next);
            resetToFirstPage();
          }}
        />
      </div>

      {historyQuery.isLoading && <LoadingState label="Loading move history…" />}
      {historyQuery.isError && <ErrorState message="Could not load move history." />}

      {historyQuery.data &&
        (rows.length === 0 ? (
          <EmptyState message="No stock movements match the current filters." />
        ) : view === 'list' ? (
          <>
            <div className="card table-card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Contact</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Product</th>
                    <th>Quantity</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className={rowClass(row)}>
                      <td className="mono">{row.reference}</td>
                      <td>{row.date}</td>
                      <td>{TYPE_LABELS[row.type] ?? row.type}</td>
                      <td>{row.contactName ?? <span className="muted">—</span>}</td>
                      <td>{row.from}</td>
                      <td>{row.to}</td>
                      <td>
                        {row.productName}
                        <span className="mono muted"> {row.sku}</span>
                      </td>
                      <td>
                        {row.direction === 'IN' ? '+' : '−'}
                        {row.quantity}
                      </td>
                      <td>
                        <span className={row.direction === 'IN' ? 'badge badge-success' : 'badge badge-danger'}>
                          {row.direction === 'IN' ? 'In' : 'Out'}
                        </span>{' '}
                        <span className="muted">{statusLabel(row.status)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={historyQuery.data.page}
              pageSize={historyQuery.data.pageSize}
              total={historyQuery.data.total}
              onPageChange={setPage}
            />
          </>
        ) : (
          <KanbanBoard
            columns={[
              { key: 'IN', title: 'In', items: rows.filter((row) => row.direction === 'IN') },
              { key: 'OUT', title: 'Out', items: rows.filter((row) => row.direction === 'OUT') },
            ]}
            renderCard={(row) => (
              <div className="kanban-card kanban-card-static" key={row.id}>
                <span className="mono">{row.reference}</span>
                <span>
                  {row.productName} · {row.direction === 'IN' ? '+' : '−'}
                  {row.quantity}
                </span>
                <span className="muted">
                  {row.from} → {row.to}
                </span>
              </div>
            )}
          />
        ))}
    </section>
  );
}
