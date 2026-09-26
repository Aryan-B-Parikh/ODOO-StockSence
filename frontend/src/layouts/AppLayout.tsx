import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { TopNav } from '../components/TopNav';

function titleFor(pathname: string): string {
  if (pathname.startsWith('/dashboard')) return 'Dashboard';
  if (pathname.startsWith('/operations/receipts')) return 'Receipts';
  if (pathname.startsWith('/operations/deliveries')) return 'Delivery Orders';
  if (pathname.startsWith('/operations/transfers')) return 'Internal Transfers';
  if (pathname.startsWith('/operations/adjustments')) return 'Inventory Adjustments';
  if (pathname.startsWith('/products')) return 'Products';
  if (pathname.startsWith('/move-history')) return 'Move History';
  if (pathname.startsWith('/settings/warehouses')) return 'Warehouse';
  if (pathname.startsWith('/settings/locations')) return 'Location';
  if (pathname.startsWith('/settings')) return 'Settings';
  if (pathname.startsWith('/profile')) return 'My Profile';
  return 'StockSense';
}

export function AppLayout() {
  const { pathname } = useLocation();

  // Keep the document title in sync with the route and reset scroll on navigation.
  useEffect(() => {
    document.title = `${titleFor(pathname)} — StockSense`;
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [pathname]);

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <TopNav />
      <main className="app-main" id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
