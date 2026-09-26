import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StockRow } from '@stocksense/shared';
import { ApiError } from '../../api/client';
import { listLocations, listStock, listWarehouses, updateStockOnHand } from '../../api/inventory';
import { useAuth } from '../../auth/AuthContext';
import { Pagination } from '../../components/Pagination';
import { EmptyState, ErrorState, LoadingState } from '../../components/StateMessages';

const PAGE_SIZE = 10;

function statusBadge(row: StockRow) {
  if (row.outOfStock) return <span className="badge badge-danger">Out of stock</span>;
  if (row.lowStock) return <span className="badge badge-warning">Low</span>;
  return <span className="badge badge-success">In stock</span>;
}

/** Products — Stock tab (IMG:13, R4.6/R4.7): on hand / free to use, search, inline edit. */
export function StockTab() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [page, setPage] = useState(1);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

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

  const stockQuery = useQuery({
    queryKey: ['stock', { search, warehouseId, locationId, page }],
    queryFn: () =>
      listStock(token!, {
        search: search || undefined,
        warehouseId: warehouseId || undefined,
        locationId: locationId || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    enabled: Boolean(token),
  });

  const mutation = useMutation({
    mutationFn: (input: { row: StockRow; onHand: number }) =>
      updateStockOnHand(token!, input.row.productId, input.row.locationId, { onHand: input.onHand }),
    onSuccess: () => {
      setEditingKey(null);
      setEditError(null);
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setEditError(error.fields?.onHand ?? error.message);
      } else {
        setEditError('Unexpected error. Please try again.');
      }
    },
  });

  const locationNames = new Map((locationsQuery.data ?? []).map((location) => [location.id, location.name]));

  const startEdit = (row: StockRow) => {
    setEditingKey(`${row.productId}:${row.locationId}`);
    setEditValue(String(row.onHand));
    setEditError(null);
  };

  const saveEdit = (row: StockRow) => {
    const value = Number(editValue);
    if (editValue.trim() === '' || Number.isNaN(value) || value < 0) {
      setEditError('On hand quantity must be 0 or more');
      return;
    }
    mutation.mutate({ row, onHand: value });
  };

  return (
    <>
      <div className="toolbar">
        <div className="toolbar-filters">
          <input
            type="search"
            className="input"
            placeholder="Search by product or SKU…"
            aria-label="Search stock"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          <select
            className="input"
            aria-label="Filter by warehouse"
            value={warehouseId}
            onChange={(event) => {
              setWarehouseId(event.target.value);
              setLocationId('');
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
          <select
            className="input"
            aria-label="Filter by location"
            value={locationId}
            onChange={(event) => {
              setLocationId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All locations</option>
            {(locationsQuery.data ?? []).map((location) => (
              <option key={location.id} value={location.id}>
                {location.name} ({location.shortCode})
              </option>
            ))}
          </select>
        </div>
      </div>

      {editError && (
        <div className="alert alert-error" role="alert">
          {editError}
        </div>
      )}
      {stockQuery.isLoading && <LoadingState label="Loading stock…" />}
      {stockQuery.isError && <ErrorState message="Could not load stock." />}

      {stockQuery.data && (
        <>
          {stockQuery.data.data.length === 0 ? (
            <EmptyState message="No stock records for the current filters." />
          ) : (
            <div className="card table-card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Location</th>
                    <th>Per Unit Cost</th>
                    <th>On Hand</th>
                    <th>Free to Use</th>
                    <th>Status</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {stockQuery.data.data.map((row) => {
                    const key = `${row.productId}:${row.locationId}`;
                    const isEditing = editingKey === key;
                    return (
                      <tr key={key}>
                        <td>
                          {row.productName}
                          <span className="mono muted"> {row.sku}</span>
                        </td>
                        <td>{locationNames.get(row.locationId) ?? row.locationId.slice(0, 8)}</td>
                        <td>{row.costPerUnit != null ? row.costPerUnit.toFixed(2) : '—'}</td>
                        <td>
                          {isEditing ? (
                            <input
                              type="number"
                              className="input input-inline"
                              aria-label={`On hand for ${row.productName}`}
                              value={editValue}
                              min={0}
                              onChange={(event) => setEditValue(event.target.value)}
                            />
                          ) : (
                            row.onHand
                          )}
                        </td>
                        <td>{row.freeToUse}</td>
                        <td>{statusBadge(row)}</td>
                        <td className="table-actions">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                className="btn btn-small btn-primary"
                                disabled={mutation.isPending}
                                onClick={() => saveEdit(row)}
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                className="btn btn-small"
                                onClick={() => {
                                  setEditingKey(null);
                                  setEditError(null);
                                }}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button type="button" className="btn btn-small" onClick={() => startEdit(row)}>
                              Edit
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            page={stockQuery.data.page}
            pageSize={stockQuery.data.pageSize}
            total={stockQuery.data.total}
            onPageChange={setPage}
          />
        </>
      )}
    </>
  );
}
