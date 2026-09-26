import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  collectFieldErrors,
  deliveryCreateSchema,
  deliveryUpdateSchema,
  type PrintPayload,
} from '@stocksense/shared';
import { listLocations, listProducts } from '../../../api/inventory';
import {
  cancelDelivery,
  createDelivery,
  getDelivery,
  printDelivery,
  updateDelivery,
  validateDelivery,
} from '../../../api/operations';
import { ApiError } from '../../../api/client';
import { useAuth } from '../../../auth/AuthContext';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { ContactPicker } from '../../../components/ContactPicker';
import { Modal } from '../../../components/Modal';
import { StatusStepper } from '../../../components/StatusStepper';
import { ErrorState, LoadingState } from '../../../components/StateMessages';
import { DocumentLinesEditor, type EditableLine } from '../DocumentLinesEditor';

const STEPS = ['Draft', 'Waiting', 'Ready', 'Done'];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

interface FormState {
  fromLocationId: string;
  toContactId: string;
  operationType: string;
  scheduleDate: string;
  lines: EditableLine[];
}

const EMPTY_FORM: FormState = {
  fromLocationId: '',
  toContactId: '',
  operationType: 'Delivery order',
  scheduleDate: todayISO(),
  lines: [{ productId: '', quantity: '1' }],
};

function toFormState(delivery: {
  fromLocationId: string;
  toContactId: string;
  operationType: string | null;
  scheduleDate: string;
  lines: Array<{ productId: string; quantity: number }>;
}): FormState {
  return {
    fromLocationId: delivery.fromLocationId,
    toContactId: delivery.toContactId,
    operationType: delivery.operationType ?? 'Delivery order',
    scheduleDate: delivery.scheduleDate,
    lines: delivery.lines.map((line) => ({ productId: line.productId, quantity: String(line.quantity) })),
  };
}

/**
 * Delivery detail/create — IMG:5, R6.8-R6.12.
 * PDF "pick → pack → validate" maps to Draft → Ready ("Pick & Pack") → Done ("Validate")
 * per 07_STATUS_WORKFLOWS and PHASE3_DECISIONS §3.
 */
export function DeliveryDetailPage() {
  const { id } = useParams();
  const isCreate = !id;
  const { token } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState<FormState | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ tone: 'success' | 'error'; info?: boolean; message: string } | null>(
    null,
  );
  const [cancelOpen, setCancelOpen] = useState(false);
  const [printPayload, setPrintPayload] = useState<PrintPayload | null>(null);

  const productsQuery = useQuery({
    queryKey: ['products', { pageSize: 100 }],
    queryFn: () => listProducts(token!, { pageSize: 100 }),
    enabled: Boolean(token),
  });

  const locationsQuery = useQuery({
    queryKey: ['locations'],
    queryFn: () => listLocations(token!),
    enabled: Boolean(token),
  });

  const detailQuery = useQuery({
    queryKey: ['delivery', id],
    queryFn: () => getDelivery(token!, id!),
    enabled: Boolean(token) && !isCreate,
  });

  const detail = detailQuery.data;
  const editable = isCreate || detail?.status === 'DRAFT' || detail?.status === 'READY' || detail?.status === 'WAITING';

  const form: FormState | null = draft ?? (isCreate ? EMPTY_FORM : detail ? toFormState(detail) : null);
  const updateForm = (patch: Partial<FormState>) => {
    if (!form) return;
    setDraft({ ...form, ...patch });
  };

  const outOfStockProducts = new Set(
    (detail?.lines ?? []).filter((line) => line.outOfStock).map((line) => line.productId),
  );

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['deliveries'] });
    void queryClient.invalidateQueries({ queryKey: ['delivery', id] });
    void queryClient.invalidateQueries({ queryKey: ['stock'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const handleError = (error: unknown, fallback: string) => {
    if (error instanceof ApiError) {
      if (error.fields) setFieldErrors(error.fields);
      setBanner({ tone: 'error', message: error.message });
    } else {
      setBanner({ tone: 'error', message: fallback });
    }
  };

  const payloadFromForm = () => {
    if (!form) throw new Error('Delivery form is not ready');
    return {
      fromLocationId: form.fromLocationId,
      toContactId: form.toContactId,
      operationType: form.operationType,
      scheduleDate: form.scheduleDate,
      lines: form.lines.map((line) => ({ productId: line.productId, quantity: Number(line.quantity) })),
    };
  };

  const createMutation = useMutation({
    mutationFn: () => createDelivery(token!, payloadFromForm()),
    onSuccess: (delivery) => {
      void queryClient.invalidateQueries({ queryKey: ['deliveries'] });
      navigate(`/operations/deliveries/${delivery.id}`);
    },
    onError: (error) => handleError(error, 'Could not create the delivery.'),
  });

  const updateMutation = useMutation({
    mutationFn: () => updateDelivery(token!, id!, payloadFromForm()),
    onSuccess: (delivery) => {
      setBanner({
        tone: 'success',
        message: delivery.status === 'WAITING' ? 'Delivery saved — waiting for stock.' : 'Delivery saved.',
      });
      invalidateAll();
    },
    onError: (error) => handleError(error, 'Could not save the delivery.'),
  });

  const validateMutation = useMutation({
    mutationFn: () => validateDelivery(token!, id!),
    onSuccess: (delivery) => {
      setBanner(
        delivery.status === 'READY'
          ? { tone: 'success', message: `${delivery.reference} picked & packed — ready to deliver.` }
          : { tone: 'success', message: `${delivery.reference} validated — stock has decreased.` },
      );
      invalidateAll();
    },
    onError: (error) => handleError(error, 'Could not validate the delivery.'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelDelivery(token!, id!),
    onSuccess: (delivery) => {
      setCancelOpen(false);
      setBanner({ tone: 'success', message: `${delivery.reference} canceled.` });
      invalidateAll();
    },
    onError: (error) => {
      setCancelOpen(false);
      handleError(error, 'Could not cancel the delivery.');
    },
  });

  const printMutation = useMutation({
    mutationFn: () => printDelivery(token!, id!),
    onSuccess: (payload) => setPrintPayload(payload),
    onError: (error) => handleError(error, 'Could not load the print payload.'),
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setBanner(null);
    setFieldErrors({});

    const payload = payloadFromForm();
    const parsed = isCreate ? deliveryCreateSchema.safeParse(payload) : deliveryUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      setFieldErrors(collectFieldErrors(parsed.error));
      return;
    }
    if (isCreate) createMutation.mutate();
    else updateMutation.mutate();
  };

  if (!isCreate && detailQuery.isLoading) {
    return <LoadingState label="Loading delivery…" />;
  }
  if (!isCreate && (detailQuery.isError || !detail)) {
    return <ErrorState message="Could not load the delivery." />;
  }
  if (!form) {
    return <LoadingState label="Loading delivery…" />;
  }

  const waiting = !isCreate && detail!.status === 'WAITING';

  return (
    <section className="page">
      <header className="page-header">
        <h1>{isCreate ? 'New Delivery' : 'Delivery'}</h1>
        {!isCreate && <span className="reference mono">{detail!.reference}</span>}
        {!isCreate && (
          <Link className="btn btn-secondary" to="/operations/deliveries">
            Back to list
          </Link>
        )}
      </header>

      {!isCreate && <StatusStepper steps={STEPS} current={detail!.status} />}

      {waiting && (
        <div className="alert alert-error" role="alert">
          Waiting for stock to become available — the highlighted products are out of stock at the
          source location. Add stock (a receipt or a stock adjustment) to move this delivery to Ready.
        </div>
      )}
      {banner && (
        <div className={`alert ${banner.tone === 'success' ? 'alert-success' : 'alert-error'}`} role="alert">
          {banner.message}
        </div>
      )}

      <div className="card">
        <form onSubmit={handleSubmit} noValidate>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="fromLocationId">From Location</label>
              <select
                id="fromLocationId"
                className={fieldErrors.fromLocationId ? 'input input-error' : 'input'}
                value={form.fromLocationId}
                onChange={(event) => updateForm({ fromLocationId: event.target.value })}
                disabled={!editable}
              >
                <option value="">Select a source location…</option>
                {(locationsQuery.data ?? []).map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name} ({location.shortCode})
                  </option>
                ))}
              </select>
              {fieldErrors.fromLocationId && <p className="field-error">{fieldErrors.fromLocationId}</p>}
            </div>
            <ContactPicker
              id="toContactId"
              label="Customer"
              type="CUSTOMER"
              value={form.toContactId}
              onChange={(value) => updateForm({ toContactId: value })}
              error={fieldErrors.toContactId}
              disabled={!editable}
            />
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="operationType">Operation Type</label>
              <input
                id="operationType"
                className={fieldErrors.operationType ? 'input input-error' : 'input'}
                value={form.operationType}
                onChange={(event) => updateForm({ operationType: event.target.value })}
                disabled={!editable}
              />
              {fieldErrors.operationType && <p className="field-error">{fieldErrors.operationType}</p>}
            </div>
            <div className="form-field">
              <label htmlFor="scheduleDate">Schedule Date</label>
              <input
                id="scheduleDate"
                type="date"
                className={fieldErrors.scheduleDate ? 'input input-error' : 'input'}
                value={form.scheduleDate}
                onChange={(event) => updateForm({ scheduleDate: event.target.value })}
                disabled={!editable}
              />
              {fieldErrors.scheduleDate && <p className="field-error">{fieldErrors.scheduleDate}</p>}
            </div>
            <div className="form-field">
              <label>Responsible</label>
              <p className="static-field">{isCreate ? 'You' : detail!.responsibleUserName ?? '—'}</p>
            </div>
          </div>

          <h2 className="section-title">Products</h2>
          <DocumentLinesEditor
            lines={form.lines}
            products={productsQuery.data?.data ?? []}
            onChange={(lines) => updateForm({ lines })}
            readOnly={!editable}
            error={fieldErrors.lines}
            rowClass={(index) =>
              outOfStockProducts.has(form.lines[index]?.productId ?? '') ? 'row-danger' : undefined
            }
            readOnlyStatus={(index) =>
              outOfStockProducts.has(form.lines[index]?.productId ?? '') ? (
                <span className="badge badge-danger line-flag">Out of stock</span>
              ) : undefined
            }
          />

          <div className="modal-actions document-actions">
            {editable && (
              <button type="submit" className="btn btn-secondary" disabled={updateMutation.isPending}>
                {isCreate ? 'Create Delivery' : updateMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            )}
            {!isCreate && detail!.status === 'DRAFT' && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={validateMutation.isPending}
                onClick={() => validateMutation.mutate()}
              >
                {validateMutation.isPending ? 'Processing…' : 'Pick & Pack'}
              </button>
            )}
            {!isCreate && detail!.status === 'READY' && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={validateMutation.isPending}
                onClick={() => validateMutation.mutate()}
              >
                {validateMutation.isPending ? 'Validating…' : 'Validate'}
              </button>
            )}
            {waiting && (
              <button type="button" className="btn btn-primary" disabled title="Waiting for stock">
                Waiting for stock
              </button>
            )}
            {!isCreate && detail!.status === 'DONE' && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={printMutation.isPending}
                onClick={() => printMutation.mutate()}
              >
                Print
              </button>
            )}
            {!isCreate &&
              (detail!.status === 'DRAFT' || detail!.status === 'WAITING' || detail!.status === 'READY') && (
                <button type="button" className="btn btn-danger" onClick={() => setCancelOpen(true)}>
                  Cancel
                </button>
              )}
          </div>
        </form>
      </div>

      {cancelOpen && (
        <ConfirmDialog
          title="Cancel delivery"
          message="Canceling the delivery releases any reserved stock and cannot be undone."
          confirmLabel="Cancel delivery"
          busy={cancelMutation.isPending}
          onConfirm={() => cancelMutation.mutate()}
          onCancel={() => setCancelOpen(false)}
        />
      )}

      {printPayload && (
        <Modal title={`Print ${printPayload.reference}`} onClose={() => setPrintPayload(null)}>
          <div className="print-preview">
            <h3>{printPayload.reference}</h3>
            <p>
              {printPayload.locationName} → {printPayload.contactName} · {printPayload.date}
            </p>
            <ul>
              {printPayload.lines.map((line, index) => (
                <li key={index}>
                  {line.productName} ({line.sku}) — {line.quantity} {line.uom}
                </li>
              ))}
            </ul>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setPrintPayload(null)}>
              Close
            </button>
            <button type="button" className="btn btn-primary" onClick={() => window.print()}>
              Print
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
