import { useAuth } from '../auth/AuthContext';

/**
 * Dashboard placeholder — Phase 1 lands here after login (R1.11).
 * KPI cards, Receipt/Delivery summary cards and dynamic filters ship in Phase 2
 * (02_UI_FUNCTIONALITY.md "Screen: Dashboard (IMG:12)").
 */
export function DashboardPage() {
  const { user } = useAuth();

  return (
    <section className="page">
      <header className="page-header">
        <h1>Dashboard</h1>
        <span className="badge">KPIs ship in Phase 2</span>
      </header>

      <div className="card">
        <p className="lead">
          Welcome{user?.displayName ? `, ${user.displayName}` : user?.loginId ? `, ${user.loginId}` : ''}.
        </p>
        <p className="muted">
          You are signed in to StockSense. The Inventory Dashboard (Total Products in Stock, Low/Out of Stock,
          Pending Receipts, Pending Deliveries, Internal Transfers Scheduled, dynamic filters) is implemented in
          Phase 2 per docs/08_PHASE_PLAN.md.
        </p>
      </div>
    </section>
  );
}
