import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AdjustmentSummary } from '@stocksense/shared';
import { listWarehouses } from '../../../api/inventory';
import { listAdjustments } from '../../../api/operations';
import { useAuth } from '../../../auth/AuthContext';
import { Pagination } from '../../../components/Pagination';
import { EmptyState, ErrorState, LoadingState } from '../../../components/StateMessages';
import { AdjustmentForm } from './AdjustmentForm';

const PAGE_SIZE = 20;

function DeltaCell({ delta }: { delta: number }) {
  if (delta > 0) return <span className="delta-positive">+{delta}</span>;
  if (delta < 0) return <span className="delta-negative">{delta}</span>;
  return <span className="muted">0</span>;
}

/** Inventory Adjustment — list + single-step New form (R8, adjust-1). */
export function AdjustmentListPage() {
  const { token } = useAuth();

  const [search, setSearch] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => listWarehouses(token!),
    enabled: Boolean(token),
  });

  const adjustmentsQuery = useQuery({
    queryKey: ['adjustments', { search, warehouseId, page }],
    queryFn: () =>
      listAdjustments(token!, {
        search: search || undefined,
        warehouseId: warehouseId || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    enabled: Boolean(token),
  });

  const rows = adjustmentsQuery.data?.data ?? [];

  return (
    <section className="page">
      <header className="page-header">
        <h1>Inventory Adjustment</h1>
        <button type="button" className="btn btn-primary" onClick={() => setFormOpen(true)}>
          New Adjustment
        </button>
      </header>

      {banner && (
        <div className="alert alert-success" role="status">
          {banner}
        </div>
      )}

      <div className="toolbar">
        <div className="toolbar-filters">
          <input
            type="search"
            className="input"
            placeholder="Search by reference, product or SKU…"
            aria-label="Search adjustments"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          <select
            className="input"
            aria-label="Filter adjustments by warehouse"
            value={warehouseId}
            onChange={(event) => {
              setWarehouseId(event.target.value);
              setPage(1);
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
      </div>

      {adjustmentsQuery.isLoading && <LoadingState label="Loading adjustments…" />}
      {adjustmentsQuery.isError && <ErrorState message="Could not load adjustments." />}

      {adjustmentsQuery.data &&
        (rows.length === 0 ? (
          <EmptyState message="No adjustments yet. Use New Adjustment to reconcile a physical count." />
        ) : (
          <>
            <div className="card table-card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Date</th>
                    <th>Product</th>
                    <th>Location</th>
                    <th>Recorded</th>
                    <th>Counted</th>
                    <th>Difference</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((adjustment: AdjustmentSummary) => (
                    <tr key={adjustment.id}>
                      <td className="mono">{adjustment.reference}</td>
                      <td>{adjustment.scheduleDate}</td>
                      <td>
                        {adjustment.productName}
                        {adjustment.sku && <span className="mono muted"> {adjustment.sku}</span>}
                      </td>
                      <td>{adjustment.locationName}</td>
                      <td>{adjustment.recordedQuantity}</td>
                      <td>{adjustment.countedQuantity}</td>
                      <td>
                        <DeltaCell delta={adjustment.delta} />
                      </td>
                      <td>{adjustment.note ?? <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={adjustmentsQuery.data.page}
              pageSize={adjustmentsQuery.data.pageSize}
              total={adjustmentsQuery.data.total}
              onPageChange={setPage}
            />
          </>
        ))}

      {formOpen && (
        <AdjustmentForm
          onClose={() => setFormOpen(false)}
          onSaved={(message) => {
            setFormOpen(false);
            setBanner(message);
            setPage(1);
          }}
        />
      )}
    </section>
  );
}
