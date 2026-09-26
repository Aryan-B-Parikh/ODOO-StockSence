import type {
  AdjustmentCreateInput,
  AdjustmentSummary,
  ContactCreateInput,
  ContactSummary,
  DeliveryCreateInput,
  DeliveryDetail,
  DeliverySummary,
  DeliveryUpdateInput,
  MoveHistoryRow,
  Paginated,
  PrintPayload,
  ReceiptCreateInput,
  ReceiptDetail,
  ReceiptSummary,
  ReceiptUpdateInput,
  TransferCreateInput,
  TransferDetail,
  TransferSummary,
  TransferUpdateInput,
} from '@stocksense/shared';
import { apiRequest, buildQuery } from './client';

/** 05_API_CONTRACTS.md §4b/§6/§7/§8/§9/§10 — contacts, operations, history. */

export interface OperationsListParams {
  search?: string;
  status?: string;
  warehouseId?: string;
  page?: number;
  pageSize?: number;
}

// ------------------------------------------------------------------ contacts

export interface ContactListParams {
  type?: 'VENDOR' | 'CUSTOMER';
  search?: string;
}

export function listContacts(token: string, params: ContactListParams = {}): Promise<ContactSummary[]> {
  return apiRequest<ContactSummary[]>(`/contacts${buildQuery(params)}`, { token });
}

export function createContact(token: string, input: ContactCreateInput): Promise<ContactSummary> {
  return apiRequest<ContactSummary>('/contacts', { method: 'POST', token, body: input });
}

// ------------------------------------------------------------------ receipts

export function listReceipts(
  token: string,
  params: OperationsListParams = {},
): Promise<Paginated<ReceiptSummary>> {
  return apiRequest<Paginated<ReceiptSummary>>(`/receipts${buildQuery(params)}`, { token });
}

export function createReceipt(token: string, input: ReceiptCreateInput): Promise<ReceiptDetail> {
  return apiRequest<ReceiptDetail>('/receipts', { method: 'POST', token, body: input });
}

export function getReceipt(token: string, id: string): Promise<ReceiptDetail> {
  return apiRequest<ReceiptDetail>(`/receipts/${id}`, { token });
}

export function updateReceipt(
  token: string,
  id: string,
  input: ReceiptUpdateInput,
): Promise<ReceiptDetail> {
  return apiRequest<ReceiptDetail>(`/receipts/${id}`, { method: 'PATCH', token, body: input });
}

export function confirmReceipt(token: string, id: string): Promise<ReceiptDetail> {
  return apiRequest<ReceiptDetail>(`/receipts/${id}/confirm`, { method: 'POST', token });
}

export function validateReceipt(token: string, id: string): Promise<ReceiptDetail> {
  return apiRequest<ReceiptDetail>(`/receipts/${id}/validate`, { method: 'POST', token });
}

export function cancelReceipt(token: string, id: string): Promise<ReceiptDetail> {
  return apiRequest<ReceiptDetail>(`/receipts/${id}/cancel`, { method: 'POST', token });
}

export function printReceipt(token: string, id: string): Promise<PrintPayload> {
  return apiRequest<PrintPayload>(`/receipts/${id}/print`, { token });
}

// ---------------------------------------------------------------- deliveries

export function listDeliveries(
  token: string,
  params: OperationsListParams = {},
): Promise<Paginated<DeliverySummary>> {
  return apiRequest<Paginated<DeliverySummary>>(`/deliveries${buildQuery(params)}`, { token });
}

export function createDelivery(token: string, input: DeliveryCreateInput): Promise<DeliveryDetail> {
  return apiRequest<DeliveryDetail>('/deliveries', { method: 'POST', token, body: input });
}

export function getDelivery(token: string, id: string): Promise<DeliveryDetail> {
  return apiRequest<DeliveryDetail>(`/deliveries/${id}`, { token });
}

export function updateDelivery(
  token: string,
  id: string,
  input: DeliveryUpdateInput,
): Promise<DeliveryDetail> {
  return apiRequest<DeliveryDetail>(`/deliveries/${id}`, { method: 'PATCH', token, body: input });
}

export function validateDelivery(token: string, id: string): Promise<DeliveryDetail> {
  return apiRequest<DeliveryDetail>(`/deliveries/${id}/validate`, { method: 'POST', token });
}

export function cancelDelivery(token: string, id: string): Promise<DeliveryDetail> {
  return apiRequest<DeliveryDetail>(`/deliveries/${id}/cancel`, { method: 'POST', token });
}

export function printDelivery(token: string, id: string): Promise<PrintPayload> {
  return apiRequest<PrintPayload>(`/deliveries/${id}/print`, { token });
}

// ----------------------------------------------------------------- transfers

export function listTransfers(
  token: string,
  params: OperationsListParams = {},
): Promise<Paginated<TransferSummary>> {
  return apiRequest<Paginated<TransferSummary>>(`/transfers${buildQuery(params)}`, { token });
}

export function createTransfer(token: string, input: TransferCreateInput): Promise<TransferDetail> {
  return apiRequest<TransferDetail>('/transfers', { method: 'POST', token, body: input });
}

export function getTransfer(token: string, id: string): Promise<TransferDetail> {
  return apiRequest<TransferDetail>(`/transfers/${id}`, { token });
}

export function updateTransfer(
  token: string,
  id: string,
  input: TransferUpdateInput,
): Promise<TransferDetail> {
  return apiRequest<TransferDetail>(`/transfers/${id}`, { method: 'PATCH', token, body: input });
}

export function confirmTransfer(token: string, id: string): Promise<TransferDetail> {
  return apiRequest<TransferDetail>(`/transfers/${id}/confirm`, { method: 'POST', token });
}

export function validateTransfer(token: string, id: string): Promise<TransferDetail> {
  return apiRequest<TransferDetail>(`/transfers/${id}/validate`, { method: 'POST', token });
}

export function cancelTransfer(token: string, id: string): Promise<TransferDetail> {
  return apiRequest<TransferDetail>(`/transfers/${id}/cancel`, { method: 'POST', token });
}

// --------------------------------------------------------------- adjustments

export interface AdjustmentListParams {
  search?: string;
  status?: string;
  warehouseId?: string;
  productId?: string;
  locationId?: string;
  page?: number;
  pageSize?: number;
}

export function listAdjustments(
  token: string,
  params: AdjustmentListParams = {},
): Promise<Paginated<AdjustmentSummary>> {
  return apiRequest<Paginated<AdjustmentSummary>>(`/adjustments${buildQuery(params)}`, { token });
}

export function createAdjustment(
  token: string,
  input: AdjustmentCreateInput,
): Promise<AdjustmentSummary> {
  return apiRequest<AdjustmentSummary>('/adjustments', { method: 'POST', token, body: input });
}

export function getAdjustment(token: string, id: string): Promise<AdjustmentSummary> {
  return apiRequest<AdjustmentSummary>(`/adjustments/${id}`, { token });
}

// -------------------------------------------------------------- move history

export interface MoveHistoryListParams {
  search?: string;
  type?: string;
  direction?: string;
  status?: string;
  productId?: string;
  warehouseId?: string;
  locationId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export function getMoveHistory(
  token: string,
  params: MoveHistoryListParams = {},
): Promise<Paginated<MoveHistoryRow>> {
  return apiRequest<Paginated<MoveHistoryRow>>(`/move-history${buildQuery(params)}`, { token });
}
