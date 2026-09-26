import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import type { DeliverySummary } from '@stocksense/shared';
import { listWarehouses } from '../../../api/inventory';
import { listDeliveries } from '../../../api/operations';
import { useAuth } from '../../../auth/AuthContext';
import { KanbanBoard } from '../../../components/KanbanBoard';
import { ListKanbanToggle, type ListViewMode } from '../../../components/ListKanbanToggle';
import { Pagination } from '../../../components/Pagination';
import { EmptyState, ErrorState, LoadingState } from '../../../components/StateMessages';
import { STATUS_BADGE_CLASS, statusLabel } from '../../../components/status';

const KANBAN_COLUMNS = [
  { key: 'DRAFT', title: 'Draft' },
  { key: 'WAITING', title: 'Waiting' },
  { key: 'READY', title: 'Ready' },
  { key: 'DONE', title: 'Done' },
  { key: 'CANCELED', title: 'Canceled' },
];

const PAGE_SIZE = 20;

/** Delivery Orders — List (IMG:2/6, R6.4-R6.6): search, status filter, List ⇄ Kanban. */
export function DeliveryListPage() {
  const { token } = useAuth();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [view, setView] = useState<ListViewMode>('list');
  const [page, setPage] = useState(1);

  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => listWarehouses(token!),
    enabled: Boolean(token),
  });

  const deliveriesQuery = useQuery({
    queryKey: ['deliveries', { search, status, warehouseId, page, view }],
    queryFn: () =>
      listDeliveries(token!, {
        search: search || undefined,
        status: status || undefined,
        warehouseId: warehouseId || undefined,
        page,
        pageSize: view === 'kanban' ? 100 : PAGE_SIZE,
      }),
    enabled: Boolean(token),
  });

  const rows = deliveriesQuery.data?.data ?? [];
  const resetToFirstPage = () => setPage(1);

  return (
    <section className="page">
      <header className="page-header">
        <h1>Delivery Orders</h1>
        <Link className="btn btn-primary" to="/operations/deliveries/new">
          New
        </Link>
      </header>

      <div className="toolbar">
        <div className="toolbar-filters">
          <input
            type="search"
            className="input"
            placeholder="Search by reference or contact…"
            aria-label="Search deliveries"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              resetToFirstPage();
            }}
          />
          <select
            className="input"
            aria-label="Filter deliveries by status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              resetToFirstPage();
            }}
          >
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="WAITING">Waiting</option>
            <option value="READY">Ready</option>
            <option value="DONE">Done</option>
            <option value="CANCELED">Canceled</option>
          </select>
          <select
            className="input"
            aria-label="Filter deliveries by warehouse"
            value={warehouseId}
            onChange={(event) => {
              setWarehouseId(event.target.value);
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
        </div>
        <ListKanbanToggle
          view={view}
          onChange={(next) => {
            setView(next);
            resetToFirstPage();
          }}
        />
      </div>

      {deliveriesQuery.isLoading && <LoadingState label="Loading deliveries…" />}
      {deliveriesQuery.isError && <ErrorState message="Could not load deliveries." />}

      {deliveriesQuery.data &&
        (rows.length === 0 ? (
          <EmptyState message="No deliveries match the current filters." />
        ) : view === 'list' ? (
          <>
            <div className="card table-card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Contact</th>
                    <th>Schedule date</th>
                    <th>Status</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((delivery: DeliverySummary) => (
                    <tr key={delivery.id}>
                      <td className="mono">{delivery.reference}</td>
                      <td>{delivery.fromLocationName}</td>
                      <td>{delivery.toContactName}</td>
                      <td>{delivery.toContactEmail ?? <span className="muted">—</span>}</td>
                      <td>{delivery.scheduleDate}</td>
                      <td>
                        <span className={STATUS_BADGE_CLASS[delivery.status] ?? 'badge'}>
                          {statusLabel(delivery.status)}
                        </span>
                      </td>
                      <td className="table-actions">
                        <Link className="btn btn-small" to={`/operations/deliveries/${delivery.id}`}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={deliveriesQuery.data.page}
              pageSize={deliveriesQuery.data.pageSize}
              total={deliveriesQuery.data.total}
              onPageChange={setPage}
            />
          </>
        ) : (
          <KanbanBoard
            columns={KANBAN_COLUMNS.map((column) => ({
              key: column.key,
              title: column.title,
              items: rows.filter((delivery) => delivery.status === column.key),
            }))}
            renderCard={(delivery) => (
              <button
                type="button"
                className="kanban-card"
                onClick={() => navigate(`/operations/deliveries/${delivery.id}`)}
              >
                <span className="mono">{delivery.reference}</span>
                <span>
                  {delivery.fromLocationName} → {delivery.toContactName}
                </span>
                <span className="muted">{delivery.scheduleDate}</span>
              </button>
            )}
          />
        ))}
    </section>
  );
}
