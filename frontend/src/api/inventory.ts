import type {
  CategorySummary,
  DashboardKpis,
  LocationSummary,
  Paginated,
  ProductCreateInput,
  ProductSummary,
  ProductUpdateInput,
  StockRow,
  WarehouseSummary,
} from '@stocksense/shared';
import { apiRequest, buildQuery as toQuery } from './client';

/** 05_API_CONTRACTS.md §2–§5 — inventory + dashboard endpoints. */

// ------------------------------------------------------------------ catalog

export interface ProductListParams {
  search?: string;
  categoryId?: string;
  page?: number;
  pageSize?: number;
}

export function listProducts(token: string, params: ProductListParams = {}): Promise<Paginated<ProductSummary>> {
  return apiRequest<Paginated<ProductSummary>>(`/products${toQuery(params)}`, { token });
}

export function createProduct(token: string, input: ProductCreateInput): Promise<ProductSummary> {
  return apiRequest<ProductSummary>('/products', { method: 'POST', token, body: input });
}

export function updateProduct(token: string, id: string, input: ProductUpdateInput): Promise<ProductSummary> {
  return apiRequest<ProductSummary>(`/products/${id}`, { method: 'PATCH', token, body: input });
}

export function listCategories(token: string): Promise<CategorySummary[]> {
  return apiRequest<CategorySummary[]>('/categories', { token });
}

export function createCategory(token: string, input: { name: string }): Promise<CategorySummary> {
  return apiRequest<CategorySummary>('/categories', { method: 'POST', token, body: input });
}

// ------------------------------------------------------ warehouses/locations

export function listWarehouses(token: string): Promise<WarehouseSummary[]> {
  return apiRequest<WarehouseSummary[]>('/warehouses', { token });
}

export interface WarehouseInput {
  name: string;
  shortCode: string;
  address?: string | null;
}

export function createWarehouse(token: string, input: WarehouseInput): Promise<WarehouseSummary> {
  return apiRequest<WarehouseSummary>('/warehouses', { method: 'POST', token, body: input });
}

export function updateWarehouse(token: string, id: string, input: Partial<WarehouseInput>): Promise<WarehouseSummary> {
  return apiRequest<WarehouseSummary>(`/warehouses/${id}`, { method: 'PATCH', token, body: input });
}

export function listLocations(token: string, warehouseId?: string): Promise<LocationSummary[]> {
  return apiRequest<LocationSummary[]>(`/locations${toQuery({ warehouseId })}`, { token });
}

export interface LocationInput {
  warehouseId: string;
  name: string;
  shortCode: string;
}

export function createLocation(token: string, input: LocationInput): Promise<LocationSummary> {
  return apiRequest<LocationSummary>('/locations', { method: 'POST', token, body: input });
}

export function updateLocation(
  token: string,
  id: string,
  input: { name?: string; shortCode?: string },
): Promise<LocationSummary> {
  return apiRequest<LocationSummary>(`/locations/${id}`, { method: 'PATCH', token, body: input });
}

// -------------------------------------------------------------------- stock

export interface StockListParams {
  search?: string;
  locationId?: string;
  warehouseId?: string;
  page?: number;
  pageSize?: number;
}

export function listStock(token: string, params: StockListParams = {}): Promise<Paginated<StockRow>> {
  return apiRequest<Paginated<StockRow>>(`/stock${toQuery(params)}`, { token });
}

export function updateStockOnHand(
  token: string,
  productId: string,
  locationId: string,
  input: { onHand: number; note?: string },
): Promise<StockRow> {
  return apiRequest<StockRow>(`/stock/${productId}/${locationId}`, { method: 'PATCH', token, body: input });
}

// ---------------------------------------------------------------- dashboard

export interface DashboardFilters {
  warehouseId?: string;
  locationId?: string;
  categoryId?: string;
  type?: string;
  status?: string;
}

export function getDashboardKpis(token: string, filters: DashboardFilters = {}): Promise<DashboardKpis> {
  return apiRequest<DashboardKpis>(`/dashboard/kpis${toQuery(filters)}`, { token });
}
