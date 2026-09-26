import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LocationSummary } from '@stocksense/shared';
import { listLocations, listWarehouses } from '../../api/inventory';
import { useAuth } from '../../auth/AuthContext';
import { EmptyState, ErrorState, LoadingState } from '../../components/StateMessages';
import { LocationForm } from './LocationForm';

/** Settings → Location (IMG:8/10, R10.2/R10.3). */
export function LocationPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LocationSummary | null>(null);

  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => listWarehouses(token!),
    enabled: Boolean(token),
  });

  const locationsQuery = useQuery({
    queryKey: ['locations', { warehouseId: warehouseFilter }],
    queryFn: () => listLocations(token!, warehouseFilter || undefined),
    enabled: Boolean(token),
  });

  const warehouses = warehousesQuery.data ?? [];
  const warehouseNames = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse.name]));

  return (
    <section className="page">
      <header className="page-header">
        <h1>Locations</h1>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          New Location
        </button>
      </header>

      <div className="toolbar">
        <div className="toolbar-filters">
          <select
            className="input"
            aria-label="Filter by warehouse"
            value={warehouseFilter}
            onChange={(event) => setWarehouseFilter(event.target.value)}
          >
            <option value="">All warehouses</option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {locationsQuery.isLoading && <LoadingState label="Loading locations…" />}
      {locationsQuery.isError && <ErrorState message="Could not load locations." />}

      {locationsQuery.data &&
        (locationsQuery.data.length === 0 ? (
          <EmptyState message="No locations yet. Locations are subdivisions of a warehouse (rooms, racks, zones)." />
        ) : (
          <div className="card table-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Short Code</th>
                  <th>Warehouse</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {locationsQuery.data.map((location) => (
                  <tr key={location.id}>
                    <td>{location.name}</td>
                    <td className="mono">{location.shortCode}</td>
                    <td>{warehouseNames.get(location.warehouseId) ?? '—'}</td>
                    <td className="table-actions">
                      <button
                        type="button"
                        className="btn btn-small"
                        onClick={() => {
                          setEditing(location);
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
        <LocationForm
          location={editing}
          warehouses={warehouses}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            void queryClient.invalidateQueries({ queryKey: ['locations'] });
          }}
        />
      )}
    </section>
  );
}
