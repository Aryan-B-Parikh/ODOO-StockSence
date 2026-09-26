import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  collectFieldErrors,
  receiptCreateSchema,
  receiptUpdateSchema,
  type PrintPayload,
} from '@stocksense/shared';
import { listLocations, listProducts } from '../../../api/inventory';
import {
  cancelReceipt,
  confirmReceipt,
  createReceipt,
  getReceipt,
  printReceipt,
  updateReceipt,
  validateReceipt,
} from '../../../api/operations';
import { ApiError } from '../../../api/client';
import { useAuth } from '../../../auth/AuthContext';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { ContactPicker } from '../../../components/ContactPicker';
import { Modal } from '../../../components/Modal';
import { StatusStepper } from '../../../components/StatusStepper';
import { ErrorState, LoadingState } from '../../../components/StateMessages';
import { DocumentLinesEditor, type EditableLine } from '../DocumentLinesEditor';

const STEPS = ['Draft', 'Ready', 'Done'];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

interface FormState {
  fromContactId: string;
  toLocationId: string;
  scheduleDate: string;
  lines: EditableLine[];
}

const EMPTY_FORM: FormState = {
  fromContactId: '',
  toLocationId: '',
  scheduleDate: todayISO(),
  lines: [{ productId: '', quantity: '1' }],
};

function toFormState(receipt: { fromContactId: string; toLocationId: string; scheduleDate: string; lines: Array<{ productId: string; quantity: number }> }): FormState {
  return {
    fromContactId: receipt.fromContactId,
    toLocationId: receipt.toLocationId,
    scheduleDate: receipt.scheduleDate,
    lines: receipt.lines.map((line) => ({ productId: line.productId, quantity: String(line.quantity) })),
  };
}

/** Receipt detail/create — IMG:4, R5.8-R5.12, 07_STATUS_WORKFLOWS "Receipt". */
export function ReceiptDetailPage() {
  const { id } = useParams();
  const isCreate = !id;
  const { token } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState<FormState | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
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
    queryKey: ['receipt', id],
    queryFn: () => getReceipt(token!, id!),
    enabled: Boolean(token) && !isCreate,
  });

  const detail = detailQuery.data;
  const editable = isCreate || detail?.status === 'DRAFT' || detail?.status === 'READY';

  const form: FormState | null = draft ?? (isCreate ? EMPTY_FORM : detail ? toFormState(detail) : null);
  const updateForm = (patch: Partial<FormState>) => {
    if (!form) return;
    setDraft({ ...form, ...patch });
  };

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['receipts'] });
    void queryClient.invalidateQueries({ queryKey: ['receipt', id] });
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
    if (!form) throw new Error('Receipt form is not ready');
    return {
      fromContactId: form.fromContactId,
      toLocationId: form.toLocationId,
      scheduleDate: form.scheduleDate,
      lines: form.lines.map((line) => ({ productId: line.productId, quantity: Number(line.quantity) })),
    };
  };

  const createMutation = useMutation({
    mutationFn: () => createReceipt(token!, payloadFromForm()),
    onSuccess: (receipt) => {
      void queryClient.invalidateQueries({ queryKey: ['receipts'] });
      navigate(`/operations/receipts/${receipt.id}`);
    },
    onError: (error) => handleError(error, 'Could not create the receipt.'),
  });

  const updateMutation = useMutation({
    mutationFn: () => updateReceipt(token!, id!, payloadFromForm()),
    onSuccess: () => {
      setBanner({ tone: 'success', message: 'Receipt saved.' });
      invalidateAll();
    },
    onError: (error) => handleError(error, 'Could not save the receipt.'),
  });

  const confirmMutation = useMutation({
    mutationFn: () => confirmReceipt(token!, id!),
    onSuccess: (receipt) => {
      setBanner({ tone: 'success', message: `${receipt.reference} is ready to receive.` });
      invalidateAll();
    },
    onError: (error) => handleError(error, 'Could not confirm the receipt.'),
  });

  const validateMutation = useMutation({
    mutationFn: () => validateReceipt(token!, id!),
    onSuccess: (receipt) => {
      setBanner({ tone: 'success', message: `${receipt.reference} validated — stock has increased.` });
      invalidateAll();
    },
    onError: (error) => handleError(error, 'Could not validate the receipt.'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelReceipt(token!, id!),
    onSuccess: (receipt) => {
      setCancelOpen(false);
      setBanner({ tone: 'success', message: `${receipt.reference} canceled.` });
      invalidateAll();
    },
    onError: (error) => {
      setCancelOpen(false);
      handleError(error, 'Could not cancel the receipt.');
    },
  });

  const printMutation = useMutation({
    mutationFn: () => printReceipt(token!, id!),
    onSuccess: (payload) => setPrintPayload(payload),
    onError: (error) => handleError(error, 'Could not load the print payload.'),
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setBanner(null);
    setFieldErrors({});

    const payload = payloadFromForm();
    const parsed = isCreate ? receiptCreateSchema.safeParse(payload) : receiptUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      setFieldErrors(collectFieldErrors(parsed.error));
      return;
    }
    if (isCreate) createMutation.mutate();
    else updateMutation.mutate();
  };

  if (!isCreate && detailQuery.isLoading) {
    return <LoadingState label="Loading receipt…" />;
  }
  if (!isCreate && (detailQuery.isError || !detail)) {
    return <ErrorState message="Could not load the receipt." />;
  }
  if (!form) {
    return <LoadingState label="Loading receipt…" />;
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>{isCreate ? 'New Receipt' : 'Receipt'}</h1>
        {!isCreate && <span className="reference mono">{detail!.reference}</span>}
        {!isCreate && (
          <Link className="btn btn-secondary" to="/operations/receipts">
            Back to list
          </Link>
        )}
      </header>

      {!isCreate && <StatusStepper steps={STEPS} current={detail!.status} />}

      {banner && (
        <div className={`alert ${banner.tone === 'success' ? 'alert-success' : 'alert-error'}`} role="alert">
          {banner.message}
        </div>
      )}

      <div className="card">
        <form onSubmit={handleSubmit} noValidate>
          <div className="form-row">
            <ContactPicker
              id="fromContactId"
              label="Receive From"
              type="VENDOR"
              value={form.fromContactId}
              onChange={(value) => updateForm({ fromContactId: value })}
              error={fieldErrors.fromContactId}
              disabled={!editable}
            />
            <div className="form-field">
              <label htmlFor="toLocationId">To Location</label>
              <select
                id="toLocationId"
                className={fieldErrors.toLocationId ? 'input input-error' : 'input'}
                value={form.toLocationId}
                onChange={(event) => updateForm({ toLocationId: event.target.value })}
                disabled={!editable}
              >
                <option value="">Select a location…</option>
                {(locationsQuery.data ?? []).map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name} ({location.shortCode})
                  </option>
                ))}
              </select>
              {fieldErrors.toLocationId && <p className="field-error">{fieldErrors.toLocationId}</p>}
            </div>
          </div>

          <div className="form-row">
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
          />

          <div className="modal-actions document-actions">
            {editable && (
              <button type="submit" className="btn btn-secondary" disabled={updateMutation.isPending}>
                {isCreate ? 'Create Receipt' : updateMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            )}
            {!isCreate && detail!.status === 'DRAFT' && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={confirmMutation.isPending}
                onClick={() => confirmMutation.mutate()}
              >
                {confirmMutation.isPending ? 'Confirming…' : 'Confirm'}
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
            {!isCreate && (detail!.status === 'DRAFT' || detail!.status === 'READY') && (
              <button type="button" className="btn btn-danger" onClick={() => setCancelOpen(true)}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {cancelOpen && (
        <ConfirmDialog
          title="Cancel receipt"
          message="Canceling the receipt cannot be undone. No stock has moved for a Draft or Ready receipt."
          confirmLabel="Cancel receipt"
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
              {printPayload.contactName} → {printPayload.locationName} · {printPayload.date}
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
