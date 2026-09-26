import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import type { TransferSummary } from '@stocksense/shared';
import { listWarehouses } from '../../../api/inventory';
import { listTransfers } from '../../../api/operations';
import { useAuth } from '../../../auth/AuthContext';
import { KanbanBoard } from '../../../components/KanbanBoard';
import { ListKanbanToggle, type ListViewMode } from '../../../components/ListKanbanToggle';
import { Pagination } from '../../../components/Pagination';
import { EmptyState, ErrorState, LoadingState } from '../../../components/StateMessages';
import { STATUS_BADGE_CLASS, statusLabel } from '../../../components/status';

const KANBAN_COLUMNS = [
  { key: 'DRAFT', title: 'Draft' },
  { key: 'READY', title: 'Ready' },
  { key: 'DONE', title: 'Done' },
  { key: 'CANCELED', title: 'Canceled' },
];

const PAGE_SIZE = 20;

/** Internal Transfers — List (02_UI_FUNCTIONALITY, modeled on Receipts; R7). */
export function TransferListPage() {
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

  const transfersQuery = useQuery({
    queryKey: ['transfers', { search, status, warehouseId, page, view }],
    queryFn: () =>
      listTransfers(token!, {
        search: search || undefined,
        status: status || undefined,
        warehouseId: warehouseId || undefined,
        page,
        pageSize: view === 'kanban' ? 100 : PAGE_SIZE,
      }),
    enabled: Boolean(token),
  });

  const rows = transfersQuery.data?.data ?? [];
  const resetToFirstPage = () => setPage(1);

  return (
    <section className="page">
      <header className="page-header">
        <h1>Internal Transfers</h1>
        <Link className="btn btn-primary" to="/operations/transfers/new">
          New
        </Link>
      </header>

      <div className="toolbar">
        <div className="toolbar-filters">
          <input
            type="search"
            className="input"
            placeholder="Search by reference or location…"
            aria-label="Search transfers"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              resetToFirstPage();
            }}
          />
          <select
            className="input"
            aria-label="Filter transfers by status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              resetToFirstPage();
            }}
          >
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="READY">Ready</option>
            <option value="DONE">Done</option>
            <option value="CANCELED">Canceled</option>
          </select>
          <select
            className="input"
            aria-label="Filter transfers by warehouse"
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

      {transfersQuery.isLoading && <LoadingState label="Loading transfers…" />}
      {transfersQuery.isError && <ErrorState message="Could not load transfers." />}

      {transfersQuery.data &&
        (rows.length === 0 ? (
          <EmptyState message="No transfers match the current filters." />
        ) : view === 'list' ? (
          <>
            <div className="card table-card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Schedule date</th>
                    <th>Status</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((transfer: TransferSummary) => (
                    <tr key={transfer.id}>
                      <td className="mono">{transfer.reference}</td>
                      <td>{transfer.fromLocationName}</td>
                      <td>{transfer.toLocationName}</td>
                      <td>{transfer.scheduleDate}</td>
                      <td>
                        <span className={STATUS_BADGE_CLASS[transfer.status] ?? 'badge'}>
                          {statusLabel(transfer.status)}
                        </span>
                      </td>
                      <td className="table-actions">
                        <Link className="btn btn-small" to={`/operations/transfers/${transfer.id}`}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={transfersQuery.data.page}
              pageSize={transfersQuery.data.pageSize}
              total={transfersQuery.data.total}
              onPageChange={setPage}
            />
          </>
        ) : (
          <KanbanBoard
            columns={KANBAN_COLUMNS.map((column) => ({
              key: column.key,
              title: column.title,
              items: rows.filter((transfer) => transfer.status === column.key),
            }))}
            renderCard={(transfer) => (
              <button
                type="button"
                className="kanban-card"
                onClick={() => navigate(`/operations/transfers/${transfer.id}`)}
              >
                <span className="mono">{transfer.reference}</span>
                <span>
                  {transfer.fromLocationName} → {transfer.toLocationName}
                </span>
                <span className="muted">{transfer.scheduleDate}</span>
              </button>
            )}
          />
        ))}
    </section>
  );
}
