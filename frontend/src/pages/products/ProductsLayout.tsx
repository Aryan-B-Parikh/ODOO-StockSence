import { NavLink, Outlet } from 'react-router-dom';

/**
 * Products page shell — nav-1 decision (01_REQUIREMENTS.md): "Products" is the top-level
 * nav item; the Stock view (IMG:13) is a tab inside it.
 */
export function ProductsLayout() {
  const tabClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? 'tab tab-active' : 'tab';

  return (
    <section className="page">
      <header className="page-header">
        <h1>Products</h1>
      </header>
      <nav className="tabs" aria-label="Products sections">
        <NavLink to="/products" end className={tabClass}>
          Catalog
        </NavLink>
        <NavLink to="/products/stock" className={tabClass}>
          Stock
        </NavLink>
      </nav>
      <Outlet />
    </section>
  );
}
