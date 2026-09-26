import { http, HttpResponse } from 'msw';
import {
  adjustmentCreateSchema,
  adjustmentQuerySchema,
  collectFieldErrors,
  contactCreateSchema,
  contactQuerySchema,
  deliveryCreateSchema,
  deliveryUpdateSchema,
  moveHistoryQuerySchema,
  operationsQuerySchema,
  receiptCreateSchema,
  receiptUpdateSchema,
  transferCreateSchema,
  transferUpdateSchema,
} from '@stocksense/shared';
import { requireMockAuth, validationError } from './http';
import {
  mockCancelDelivery,
  mockCancelReceipt,
  mockCancelTransfer,
  mockConfirmReceipt,
  mockConfirmTransfer,
  mockCreateAdjustment,
  mockCreateContact,
  mockCreateDelivery,
  mockCreateReceipt,
  mockCreateTransfer,
  mockDeliveryPrint,
  mockGetAdjustment,
  mockGetDelivery,
  mockGetReceipt,
  mockGetTransfer,
  mockListAdjustments,
  mockListContacts,
  mockListDeliveries,
  mockListReceipts,
  mockListTransfers,
  mockMoveHistory,
  mockReceiptPrint,
  mockUpdateDelivery,
  mockUpdateReceipt,
  mockUpdateTransfer,
  mockValidateDelivery,
  mockValidateReceipt,
  mockValidateTransfer,
  type MockResult,
} from './fixtures/operations';

const API = '*/api/v1';

function respond(result: MockResult<unknown>) {
  if (result.ok) {
    return HttpResponse.json(result.body as Record<string, unknown>, { status: result.status ?? 200 });
  }
  return HttpResponse.json(
    {
      error: {
        code: result.code,
        message: result.message,
        ...(result.fields ? { fields: result.fields } : {}),
      },
    },
    { status: result.status },
  );
}

function parseOperationsQuery(url: URL) {
  return operationsQuerySchema.safeParse({
    search: url.searchParams.get('search') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    warehouseId: url.searchParams.get('warehouseId') ?? undefined,
    page: url.searchParams.get('page') ?? undefined,
    pageSize: url.searchParams.get('pageSize') ?? undefined,
  });
}

/** §4b/§6/§7/§8/§9/§10 stateful mocks. */
export const operationsHandlers = [
  // ---------------------------------------------------------------- contacts
  http.get(`${API}/contacts`, ({ request }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;
    const url = new URL(request.url);
    const parsed = contactQuerySchema.safeParse({
      type: url.searchParams.get('type') ?? undefined,
      search: url.searchParams.get('search') ?? undefined,
    });
    if (!parsed.success) return validationError(collectFieldErrors(parsed.error));
    return HttpResponse.json(mockListContacts(parsed.data.type, parsed.data.search));
  }),

  http.post(`${API}/contacts`, async ({ request }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;
    const body = await request.json().catch(() => ({}));
    const parsed = contactCreateSchema.safeParse(body);
    if (!parsed.success) return validationError(collectFieldErrors(parsed.error));
    return HttpResponse.json(
      mockCreateContact({
        name: parsed.data.name,
        type: parsed.data.type,
        email: parsed.data.email ?? null,
        phone: parsed.data.phone ?? null,
      }),
      { status: 201 },
    );
  }),

  // ---------------------------------------------------------------- receipts
  http.get(`${API}/receipts`, ({ request }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;
    const parsed = parseOperationsQuery(new URL(request.url));
    if (!parsed.success) return validationError(collectFieldErrors(parsed.error));
    return HttpResponse.json(mockListReceipts(parsed.data));
  }),

  http.post(`${API}/receipts`, async ({ request }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;
    const body = await request.json().catch(() => ({}));
    const parsed = receiptCreateSchema.safeParse(body);
    if (!parsed.success) return validationError(collectFieldErrors(parsed.error));
    return respond(mockCreateReceipt(parsed.data));
  }),

  http.get(`${API}/receipts/:id/print`, ({ request, params }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;
    return respond(mockReceiptPrint(String(params.id)));
  }),

  http.get(`${API}/receipts/:id`, ({ request, params }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;
    return respond(mockGetReceipt(String(params.id)));
  }),

  http.patch(`${API}/receipts/:id`, async ({ request, params }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;
    const body = await request.json().catch(() => ({}));
    const parsed = receiptUpdateSchema.safeParse(body);
    if (!parsed.success) return validationError(collectFieldErrors(parsed.error));
    return respond(mockUpdateReceipt(String(params.id), parsed.data));
  }),

  http.post(`${API}/receipts/:id/confirm`, ({ request, params }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;
    return respond(mockConfirmReceipt(String(params.id)));
  }),

  http.post(`${API}/receipts/:id/validate`, ({ request, params }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;
    return respond(mockValidateReceipt(String(params.id)));
  }),

  http.post(`${API}/receipts/:id/cancel`, ({ request, params }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;
    return respond(mockCancelReceipt(String(params.id)));
  }),

  // -------------------------------------------------------------- deliveries
  http.get(`${API}/deliveries`, ({ request }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;
    const parsed = parseOperationsQuery(new URL(request.url));
    if (!parsed.success) return validationError(collectFieldErrors(parsed.error));
    return HttpResponse.json(mockListDeliveries(parsed.data));
  }),

  http.post(`${API}/deliveries`, async ({ request }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;
    const body = await request.json().catch(() => ({}));
    const parsed = deliveryCreateSchema.safeParse(body);
    if (!parsed.success) return validationError(collectFieldErrors(parsed.error));
    return respond(mockCreateDelivery(parsed.data));
  }),

  http.get(`${API}/deliveries/:id/print`, ({ request, params }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;
    return respond(mockDeliveryPrint(String(params.id)));
  }),

  http.get(`${API}/deliveries/:id`, ({ request, params }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;
    return respond(mockGetDelivery(String(params.id)));
  }),

  http.patch(`${API}/deliveries/:id`, async ({ request, params }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;
    const body = await request.json().catch(() => ({}));
    const parsed = deliveryUpdateSchema.safeParse(body);
    if (!parsed.success) return validationError(collectFieldErrors(parsed.error));
    return respond(mockUpdateDelivery(String(params.id), parsed.data));
  }),

  http.post(`${API}/deliveries/:id/validate`, ({ request, params }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;
    return respond(mockValidateDelivery(String(params.id)));
  }),

  http.post(`${API}/deliveries/:id/cancel`, ({ request, params }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;
    return respond(mockCancelDelivery(String(params.id)));
  }),

  // --------------------------------------------------------------- transfers
  http.get(`${API}/transfers`, ({ request }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;
    const parsed = parseOperationsQuery(new URL(request.url));
    if (!parsed.success) return validationError(collectFieldErrors(parsed.error));
    return HttpResponse.json(mockListTransfers(parsed.data));
  }),

  http.post(`${API}/transfers`, async ({ request }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;
    const body = await request.json().catch(() => ({}));
    const parsed = transferCreateSchema.safeParse(body);
    if (!parsed.success) return validationError(collectFieldErrors(parsed.error));
    return respond(mockCreateTransfer(parsed.data));
  }),

  http.get(`${API}/transfers/:id`, ({ request, params }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;
    return respond(mockGetTransfer(String(params.id)));
  }),

  http.patch(`${API}/transfers/:id`, async ({ request, params }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;
    const body = await request.json().catch(() => ({}));
    const parsed = transferUpdateSchema.safeParse(body);
    if (!parsed.success) return validationError(collectFieldErrors(parsed.error));
    return respond(mockUpdateTransfer(String(params.id), parsed.data));
  }),

  http.post(`${API}/transfers/:id/confirm`, ({ request, params }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;
    return respond(mockConfirmTransfer(String(params.id)));
  }),

  http.post(`${API}/transfers/:id/validate`, ({ request, params }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;
    return respond(mockValidateTransfer(String(params.id)));
  }),

  http.post(`${API}/transfers/:id/cancel`, ({ request, params }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;
    return respond(mockCancelTransfer(String(params.id)));
  }),

  // ------------------------------------------------------------- adjustments
  http.get(`${API}/adjustments`, ({ request }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;
    const url = new URL(request.url);
    const parsed = adjustmentQuerySchema.safeParse({
      search: url.searchParams.get('search') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      warehouseId: url.searchParams.get('warehouseId') ?? undefined,
      productId: url.searchParams.get('productId') ?? undefined,
      locationId: url.searchParams.get('locationId') ?? undefined,
      page: url.searchParams.get('page') ?? undefined,
      pageSize: url.searchParams.get('pageSize') ?? undefined,
    });
    if (!parsed.success) return validationError(collectFieldErrors(parsed.error));
    return HttpResponse.json(mockListAdjustments(parsed.data));
  }),

  http.post(`${API}/adjustments`, async ({ request }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;
    const body = await request.json().catch(() => ({}));
    const parsed = adjustmentCreateSchema.safeParse(body);
    if (!parsed.success) return validationError(collectFieldErrors(parsed.error));
    return respond(mockCreateAdjustment(parsed.data));
  }),

  http.get(`${API}/adjustments/:id`, ({ request, params }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;
    return respond(mockGetAdjustment(String(params.id)));
  }),

  // ------------------------------------------------------------- move history
  http.get(`${API}/move-history`, ({ request }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;
    const url = new URL(request.url);
    const parsed = moveHistoryQuerySchema.safeParse({
      search: url.searchParams.get('search') ?? undefined,
      type: url.searchParams.get('type') ?? undefined,
      direction: url.searchParams.get('direction') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      productId: url.searchParams.get('productId') ?? undefined,
      warehouseId: url.searchParams.get('warehouseId') ?? undefined,
      locationId: url.searchParams.get('locationId') ?? undefined,
      dateFrom: url.searchParams.get('dateFrom') ?? undefined,
      dateTo: url.searchParams.get('dateTo') ?? undefined,
      page: url.searchParams.get('page') ?? undefined,
      pageSize: url.searchParams.get('pageSize') ?? undefined,
    });
    if (!parsed.success) return validationError(collectFieldErrors(parsed.error));
    return HttpResponse.json(mockMoveHistory(parsed.data));
  }),
];
