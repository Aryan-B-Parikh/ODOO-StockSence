import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AppLayout } from './layouts/AppLayout';
import { DashboardPage } from './pages/DashboardPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { LoginPage } from './pages/LoginPage';
import { MoveHistoryPage } from './pages/MoveHistoryPage';
import { ProfilePage } from './pages/ProfilePage';
import { SignupPage } from './pages/SignupPage';
import { AdjustmentListPage } from './pages/operations/adjustments/AdjustmentListPage';
import { DeliveryDetailPage } from './pages/operations/deliveries/DeliveryDetailPage';
import { DeliveryListPage } from './pages/operations/deliveries/DeliveryListPage';
import { ReceiptDetailPage } from './pages/operations/receipts/ReceiptDetailPage';
import { ReceiptListPage } from './pages/operations/receipts/ReceiptListPage';
import { TransferDetailPage } from './pages/operations/transfers/TransferDetailPage';
import { TransferListPage } from './pages/operations/transfers/TransferListPage';
import { CatalogTab } from './pages/products/CatalogTab';
import { ProductsLayout } from './pages/products/ProductsLayout';
import { StockTab } from './pages/products/StockTab';
import { LocationPage } from './pages/settings/LocationPage';
import { WarehousePage } from './pages/settings/WarehousePage';

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

          <Route path="/products" element={<ProductsLayout />}>
            <Route index element={<CatalogTab />} />
            <Route path="stock" element={<StockTab />} />
          </Route>

          <Route path="/move-history" element={<MoveHistoryPage />} />

          <Route path="/operations/receipts" element={<ReceiptListPage />} />
          <Route path="/operations/receipts/new" element={<ReceiptDetailPage />} />
          <Route path="/operations/receipts/:id" element={<ReceiptDetailPage />} />
          <Route path="/operations/deliveries" element={<DeliveryListPage />} />
          <Route path="/operations/deliveries/new" element={<DeliveryDetailPage />} />
          <Route path="/operations/deliveries/:id" element={<DeliveryDetailPage />} />
          <Route path="/operations/transfers" element={<TransferListPage />} />
          <Route path="/operations/transfers/new" element={<TransferDetailPage />} />
          <Route path="/operations/transfers/:id" element={<TransferDetailPage />} />
          <Route path="/operations/adjustments" element={<AdjustmentListPage />} />

          <Route path="/settings/warehouses" element={<WarehousePage />} />
          <Route path="/settings/locations" element={<LocationPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
