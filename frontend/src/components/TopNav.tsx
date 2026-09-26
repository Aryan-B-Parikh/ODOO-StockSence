import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

type OpenMenu = 'operations' | 'settings' | 'profile' | null;

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return isActive ? 'nav-link nav-link-active' : 'nav-link';
}

/** Primary navigation shell — R3.1, R3.2, R3.3, R3.4 (02_UI_FUNCTIONALITY.md global layout). */
export function TopNav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);

  useEffect(() => {
    setOpenMenu(null);
  }, [location.pathname]);

  const toggle = (menu: Exclude<OpenMenu, null>) => {
    setOpenMenu((current) => (current === menu ? null : menu));
  };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const avatarLabel = (user?.displayName ?? user?.loginId ?? '?').charAt(0).toUpperCase();

  return (
    <header className="topnav">
      <div className="topnav-inner">
        <div className="brand">
          Stock<span>Sense</span>
        </div>

        <nav className="nav" aria-label="Primary">
          <NavLink to="/dashboard" className={navLinkClass}>
            Dashboard
          </NavLink>

          <div className="nav-dropdown">
            <button
              type="button"
              className="nav-button"
              onClick={() => toggle('operations')}
              aria-expanded={openMenu === 'operations'}
            >
              Operations ▾
            </button>
            {openMenu === 'operations' && (
              <div className="dropdown-panel" role="menu">
                <NavLink to="/operations/receipts" className="dropdown-item" role="menuitem">
                  Receipts
                </NavLink>
                <NavLink to="/operations/deliveries" className="dropdown-item" role="menuitem">
                  Delivery Orders
                </NavLink>
                <NavLink to="/operations/transfers" className="dropdown-item" role="menuitem">
                  Internal Transfers
                </NavLink>
                <NavLink to="/operations/adjustments" className="dropdown-item" role="menuitem">
                  Inventory Adjustment
                </NavLink>
              </div>
            )}
          </div>

          <NavLink to="/products" className={navLinkClass}>
            Products
          </NavLink>

          <NavLink to="/move-history" className={navLinkClass}>
            Move History
          </NavLink>

          <div className="nav-dropdown">
            <button
              type="button"
              className="nav-button"
              onClick={() => toggle('settings')}
              aria-expanded={openMenu === 'settings'}
            >
              Settings ▾
            </button>
            {openMenu === 'settings' && (
              <div className="dropdown-panel" role="menu">
                <NavLink to="/settings/warehouses" className="dropdown-item" role="menuitem">
                  Warehouse
                </NavLink>
                <NavLink to="/settings/locations" className="dropdown-item" role="menuitem">
                  Location
                </NavLink>
              </div>
            )}
          </div>
        </nav>

        <div className="topnav-user">
          <button
            type="button"
            className="avatar-button"
            onClick={() => toggle('profile')}
            aria-haspopup="menu"
            aria-expanded={openMenu === 'profile'}
            aria-label="Profile menu"
          >
            {avatarLabel}
          </button>

          {openMenu === 'profile' && (
            <div className="dropdown-panel dropdown-panel-right" role="menu">
              <div className="dropdown-header">
                <strong>{user?.displayName ?? user?.loginId}</strong>
                <span>{user?.email}</span>
              </div>
              <NavLink to="/profile" className="dropdown-item" role="menuitem">
                My Profile
              </NavLink>
              <button type="button" className="dropdown-item dropdown-logout" role="menuitem" onClick={handleLogout}>
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
