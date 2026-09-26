import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getDashboardKpis, listCategories, listLocations, listWarehouses } from '../api/inventory';
import { useAuth } from '../auth/AuthContext';
import { ErrorState, LoadingState } from '../components/StateMessages';

/**
 * Dashboard — IMG:12, R2.1-R2.17.
 * KPI cards + Receipt/Delivery summary cards + dynamic filters (document type, status,
 * warehouse, location, category) backed by GET /dashboard/kpis (05 §5).
 */
export function DashboardPage() {
  const { token, user } = useAuth();

  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [categoryId, setCategoryId] = useState('');

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

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: () => listCategories(token!),
    enabled: Boolean(token),
  });

  const kpisQuery = useQuery({
    queryKey: ['dashboard', { type, status, warehouseId, locationId, categoryId }],
    queryFn: () =>
      getDashboardKpis(token!, {
        type: type || undefined,
        status: status || undefined,
        warehouseId: warehouseId || undefined,
        locationId: locationId || undefined,
        categoryId: categoryId || undefined,
      }),
    enabled: Boolean(token),
  });

  const kpis = kpisQuery.data;

  return (
    <section className="page">
      <header className="page-header">
        <h1>Dashboard</h1>
        <span className="muted">
          Welcome, {user?.displayName ?? user?.loginId ?? 'there'} — inventory operations snapshot
        </span>
      </header>

      <div className="card filter-bar">
        <select className="input" aria-label="Document type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All document types</option>
          <option value="RECEIPT">Receipts</option>
          <option value="DELIVERY">Delivery</option>
          <option value="TRANSFER">Internal Transfers</option>
          <option value="ADJUSTMENT">Adjustments</option>
        </select>
        <select className="input" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="WAITING">Waiting</option>
          <option value="READY">Ready</option>
          <option value="DONE">Done</option>
          <option value="CANCELED">Canceled</option>
        </select>
        <select
          className="input"
          aria-label="Warehouse"
          value={warehouseId}
          onChange={(e) => {
            setWarehouseId(e.target.value);
            setLocationId('');
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
          aria-label="Location"
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
        >
          <option value="">All locations</option>
          {(locationsQuery.data ?? []).map((location) => (
            <option key={location.id} value={location.id}>
              {location.name} ({location.shortCode})
            </option>
          ))}
        </select>
        <select
          className="input"
          aria-label="Category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">All categories</option>
          {(categoriesQuery.data ?? []).map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      {kpisQuery.isLoading && <LoadingState label="Loading dashboard…" />}
      {kpisQuery.isError && <ErrorState message="Could not load dashboard KPIs." />}

      {kpis && (
        <>
          <div className="kpi-grid">
            <div className="card kpi-card">
              <span className="kpi-label">Total Products in Stock</span>
              <span className="kpi-value">{kpis.totalProductsInStock}</span>
            </div>
            <div className="card kpi-card">
              <span className="kpi-label">Low Stock / Out of Stock</span>
              <span className="kpi-value">{kpis.lowStockCount}</span>
            </div>
            <div className="card kpi-card">
              <span className="kpi-label">Pending Receipts</span>
              <span className="kpi-value">{kpis.pendingReceipts}</span>
            </div>
            <div className="card kpi-card">
              <span className="kpi-label">Pending Deliveries</span>
              <span className="kpi-value">{kpis.pendingDeliveries}</span>
            </div>
            <div className="card kpi-card">
              <span className="kpi-label">Internal Transfers Scheduled</span>
              <span className="kpi-value">{kpis.internalTransfersScheduled}</span>
            </div>
          </div>

          <div className="summary-grid">
            <div className="card summary-card">
              <h2>Receipt</h2>
              <div className="summary-stats">
                <div>
                  <span className="kpi-value">{kpis.receiptSummary.toReceive}</span>
                  <span className="kpi-label">to receive</span>
                </div>
                <div>
                  <span className="kpi-value kpi-danger">{kpis.receiptSummary.late}</span>
                  <span className="kpi-label">Late</span>
                </div>
                <div>
                  <span className="kpi-value">{kpis.receiptSummary.operations}</span>
                  <span className="kpi-label">operations</span>
                </div>
              </div>
              <Link to="/operations/receipts">Open receipts →</Link>
            </div>

            <div className="card summary-card">
              <h2>Delivery</h2>
              <div className="summary-stats">
                <div>
                  <span className="kpi-value">{kpis.deliverySummary.toDeliver}</span>
                  <span className="kpi-label">to Deliver</span>
                </div>
                <div>
                  <span className="kpi-value kpi-danger">{kpis.deliverySummary.late}</span>
                  <span className="kpi-label">Late</span>
                </div>
                <div>
                  <span className="kpi-value">{kpis.deliverySummary.waiting}</span>
                  <span className="kpi-label">waiting</span>
                </div>
                <div>
                  <span className="kpi-value">{kpis.deliverySummary.operations}</span>
                  <span className="kpi-label">operations</span>
                </div>
              </div>
              <Link to="/operations/deliveries">Open delivery orders →</Link>
            </div>
          </div>

          <div className="card dashboard-links">
            <Link to="/products/stock">List the available stock</Link>
            <Link to="/move-history">Display history of In/Out stocks</Link>
          </div>

          <div className="card dashboard-links">
            <span className="muted">Operations:</span>
            <Link to="/operations/receipts">Receipt</Link>
            <Link to="/operations/deliveries">Delivery</Link>
            <Link to="/operations/adjustments">Adjustment</Link>
          </div>
        </>
      )}
    </section>
  );
}
