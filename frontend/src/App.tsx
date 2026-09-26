import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { PlaceholderPage } from './components/PlaceholderPage';
import { AppLayout } from './layouts/AppLayout';
import { DashboardPage } from './pages/DashboardPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { LoginPage } from './pages/LoginPage';
import { ProfilePage } from './pages/ProfilePage';
import { SignupPage } from './pages/SignupPage';

/** Routing shell — public auth screens + protected app shell (R3.1-R3.5). */
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/profile" element={<ProfilePage />} />

          <Route
            path="/products"
            element={
              <PlaceholderPage
                title="Products"
                phase="Phase 2"
                description="Catalog tab (products, SKUs, categories, units of measure, reorder rules) and Stock tab (on hand / free to use, inline stock edit)."
              />
            }
          />
          <Route
            path="/move-history"
            element={
              <PlaceholderPage
                title="Move History"
                phase="Phase 4"
                description="Unified stock ledger view: reference, date, contact, from/to, quantity, status, color-coded IN/OUT rows."
              />
            }
          />

          <Route
            path="/operations/receipts"
            element={
              <PlaceholderPage
                title="Receipts"
                phase="Phase 3"
                description="Incoming stock documents: list, detail, Draft → Ready → Done, validate increases stock."
              />
            }
          />
          <Route
            path="/operations/deliveries"
            element={
              <PlaceholderPage
                title="Delivery Orders"
                phase="Phase 3"
                description="Outgoing stock documents: list, detail, Draft → Waiting → Ready → Done, validate decreases stock."
              />
            }
          />
          <Route
            path="/operations/transfers"
            element={
              <PlaceholderPage
                title="Internal Transfers"
                phase="Phase 4"
                description="Move stock between locations while preserving total stock; two ledger legs per line."
              />
            }
          />
          <Route
            path="/operations/adjustments"
            element={
              <PlaceholderPage
                title="Inventory Adjustment"
                phase="Phase 4"
                description="Single-step reconciliation of recorded stock against counted stock."
              />
            }
          />

          <Route
            path="/settings/warehouses"
            element={
              <PlaceholderPage
                title="Warehouse"
                phase="Phase 2"
                description="Warehouse management: name, short code (reference prefix), address."
              />
            }
          />
          <Route
            path="/settings/locations"
            element={
              <PlaceholderPage
                title="Location"
                phase="Phase 2"
                description="Location management: name, short code, parent warehouse."
              />
            }
          />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
