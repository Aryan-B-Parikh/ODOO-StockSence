import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { WarehouseSummary } from '@stocksense/shared';
import { listWarehouses } from '../../api/inventory';
import { useAuth } from '../../auth/AuthContext';
import { EmptyState, ErrorState, LoadingState } from '../../components/StateMessages';
import { WarehouseForm } from './WarehouseForm';

/** Settings → Warehouse (IMG:11, R10.1/R10.4). */
export function WarehousePage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseSummary | null>(null);

  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => listWarehouses(token!),
    enabled: Boolean(token),
  });

  return (
    <section className="page">
      <header className="page-header">
        <h1>Warehouses</h1>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          New Warehouse
        </button>
      </header>

      {warehousesQuery.isLoading && <LoadingState label="Loading warehouses…" />}
      {warehousesQuery.isError && <ErrorState message="Could not load warehouses." />}

      {warehousesQuery.data &&
        (warehousesQuery.data.length === 0 ? (
          <EmptyState message="No warehouses yet. Create one to start storing stock." />
        ) : (
          <div className="card table-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Short Code</th>
                  <th>Address</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {warehousesQuery.data.map((warehouse) => (
                  <tr key={warehouse.id}>
                    <td>{warehouse.name}</td>
                    <td className="mono">{warehouse.shortCode}</td>
                    <td>{warehouse.address ?? <span className="muted">—</span>}</td>
                    <td className="table-actions">
                      <button
                        type="button"
                        className="btn btn-small"
                        onClick={() => {
                          setEditing(warehouse);
                          setFormOpen(true);
                        }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {formOpen && (
        <WarehouseForm
          warehouse={editing}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            void queryClient.invalidateQueries({ queryKey: ['warehouses'] });
          }}
        />
      )}
    </section>
  );
}
