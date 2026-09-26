import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import type { ReceiptSummary } from '@stocksense/shared';
import { listReceipts } from '../../../api/operations';
import { listWarehouses } from '../../../api/inventory';
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

/** Receipts — List (IMG:3, R5.4-R5.6): search, status filter, List ⇄ Kanban. */
export function ReceiptListPage() {
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

  const receiptsQuery = useQuery({
    queryKey: ['receipts', { search, status, warehouseId, page, view }],
    queryFn: () =>
      listReceipts(token!, {
        search: search || undefined,
        status: status || undefined,
        warehouseId: warehouseId || undefined,
        page,
        pageSize: view === 'kanban' ? 100 : PAGE_SIZE,
      }),
    enabled: Boolean(token),
  });

  const rows = receiptsQuery.data?.data ?? [];

  const resetToFirstPage = () => setPage(1);

  return (
    <section className="page">
      <header className="page-header">
        <h1>Receipts</h1>
        <Link className="btn btn-primary" to="/operations/receipts/new">
          New
        </Link>
      </header>

      <div className="toolbar">
        <div className="toolbar-filters">
          <input
            type="search"
            className="input"
            placeholder="Search by reference or contact…"
            aria-label="Search receipts"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              resetToFirstPage();
            }}
          />
          <select
            className="input"
            aria-label="Filter receipts by status"
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
            aria-label="Filter receipts by warehouse"
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

      {receiptsQuery.isLoading && <LoadingState label="Loading receipts…" />}
      {receiptsQuery.isError && <ErrorState message="Could not load receipts." />}

      {receiptsQuery.data &&
        (rows.length === 0 ? (
          <EmptyState message="No receipts match the current filters." />
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
                  {rows.map((receipt: ReceiptSummary) => (
                    <tr key={receipt.id}>
                      <td className="mono">{receipt.reference}</td>
                      <td>{receipt.fromContactName}</td>
                      <td>{receipt.toLocationName}</td>
                      <td>{receipt.fromContactEmail ?? <span className="muted">—</span>}</td>
                      <td>{receipt.scheduleDate}</td>
                      <td>
                        <span className={STATUS_BADGE_CLASS[receipt.status] ?? 'badge'}>
                          {statusLabel(receipt.status)}
                        </span>
                      </td>
                      <td className="table-actions">
                        <Link className="btn btn-small" to={`/operations/receipts/${receipt.id}`}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={receiptsQuery.data.page}
              pageSize={receiptsQuery.data.pageSize}
              total={receiptsQuery.data.total}
              onPageChange={setPage}
            />
          </>
        ) : (
          <KanbanBoard
            columns={KANBAN_COLUMNS.map((column) => ({
              key: column.key,
              title: column.title,
              items: rows.filter((receipt) => receipt.status === column.key),
            }))}
            renderCard={(receipt) => (
              <button
                type="button"
                className="kanban-card"
                onClick={() => navigate(`/operations/receipts/${receipt.id}`)}
              >
                <span className="mono">{receipt.reference}</span>
                <span>
                  {receipt.fromContactName} → {receipt.toLocationName}
                </span>
                <span className="muted">{receipt.scheduleDate}</span>
              </button>
            )}
          />
        ))}
    </section>
  );
}
