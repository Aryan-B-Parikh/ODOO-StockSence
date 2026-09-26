import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { collectFieldErrors, transferCreateSchema, transferUpdateSchema } from '@stocksense/shared';
import { listLocations, listProducts } from '../../../api/inventory';
import {
  cancelTransfer,
  confirmTransfer,
  createTransfer,
  getTransfer,
  updateTransfer,
  validateTransfer,
} from '../../../api/operations';
import { ApiError } from '../../../api/client';
import { useAuth } from '../../../auth/AuthContext';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { StatusStepper } from '../../../components/StatusStepper';
import { ErrorState, LoadingState } from '../../../components/StateMessages';
import { DocumentLinesEditor, type EditableLine } from '../DocumentLinesEditor';

const STEPS = ['Draft', 'Ready', 'Done'];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

interface FormState {
  fromLocationId: string;
  toLocationId: string;
  scheduleDate: string;
  lines: EditableLine[];
}

const EMPTY_FORM: FormState = {
  fromLocationId: '',
  toLocationId: '',
  scheduleDate: todayISO(),
  lines: [{ productId: '', quantity: '1' }],
};

function toFormState(transfer: {
  fromLocationId: string;
  toLocationId: string;
  scheduleDate: string;
  lines: Array<{ productId: string; quantity: number }>;
}): FormState {
  return {
    fromLocationId: transfer.fromLocationId,
    toLocationId: transfer.toLocationId,
    scheduleDate: transfer.scheduleDate,
    lines: transfer.lines.map((line) => ({ productId: line.productId, quantity: String(line.quantity) })),
  };
}

/**
 * Internal Transfer detail/create — Draft → Ready (reserve) → Done (two-leg move).
 * PHASE4_DECISIONS §1; no Waiting state, no contact, no print.
 */
export function TransferDetailPage() {
  const { id } = useParams();
  const isCreate = !id;
  const { token } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState<FormState | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

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
    queryKey: ['transfer', id],
    queryFn: () => getTransfer(token!, id!),
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
    void queryClient.invalidateQueries({ queryKey: ['transfers'] });
    void queryClient.invalidateQueries({ queryKey: ['transfer', id] });
    void queryClient.invalidateQueries({ queryKey: ['stock'] });
    void queryClient.invalidateQueries({ queryKey: ['move-history'] });
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
    if (!form) throw new Error('Transfer form is not ready');
    return {
      fromLocationId: form.fromLocationId,
      toLocationId: form.toLocationId,
      scheduleDate: form.scheduleDate,
      lines: form.lines.map((line) => ({ productId: line.productId, quantity: Number(line.quantity) })),
    };
  };

  const createMutation = useMutation({
    mutationFn: () => createTransfer(token!, payloadFromForm()),
    onSuccess: (transfer) => {
      void queryClient.invalidateQueries({ queryKey: ['transfers'] });
      navigate(`/operations/transfers/${transfer.id}`);
    },
    onError: (error) => handleError(error, 'Could not create the transfer.'),
  });

  const updateMutation = useMutation({
    mutationFn: () => updateTransfer(token!, id!, payloadFromForm()),
    onSuccess: () => {
      setBanner({ tone: 'success', message: 'Transfer saved.' });
      invalidateAll();
    },
    onError: (error) => handleError(error, 'Could not save the transfer.'),
  });

  const confirmMutation = useMutation({
    mutationFn: () => confirmTransfer(token!, id!),
    onSuccess: (transfer) => {
      setBanner({ tone: 'success', message: `${transfer.reference} is ready — stock is reserved.` });
      invalidateAll();
    },
    onError: (error) => handleError(error, 'Could not confirm the transfer.'),
  });

  const validateMutation = useMutation({
    mutationFn: () => validateTransfer(token!, id!),
    onSuccess: (transfer) => {
      setBanner({ tone: 'success', message: `${transfer.reference} validated — stock moved between locations.` });
      invalidateAll();
    },
    onError: (error) => handleError(error, 'Could not validate the transfer.'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelTransfer(token!, id!),
    onSuccess: (transfer) => {
      setCancelOpen(false);
      setBanner({ tone: 'success', message: `${transfer.reference} canceled.` });
      invalidateAll();
    },
    onError: (error) => {
      setCancelOpen(false);
      handleError(error, 'Could not cancel the transfer.');
    },
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setBanner(null);
    setFieldErrors({});

    const payload = payloadFromForm();
    const parsed = isCreate ? transferCreateSchema.safeParse(payload) : transferUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      setFieldErrors(collectFieldErrors(parsed.error));
      return;
    }
    if (isCreate) createMutation.mutate();
    else updateMutation.mutate();
  };

  if (!isCreate && detailQuery.isLoading) {
    return <LoadingState label="Loading transfer…" />;
  }
  if (!isCreate && (detailQuery.isError || !detail)) {
    return <ErrorState message="Could not load the transfer." />;
  }
  if (!form) {
    return <LoadingState label="Loading transfer…" />;
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>{isCreate ? 'New Internal Transfer' : 'Internal Transfer'}</h1>
        {!isCreate && <span className="reference mono">{detail!.reference}</span>}
        {!isCreate && (
          <Link className="btn btn-secondary" to="/operations/transfers">
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
            <div className="form-field">
              <label htmlFor="fromLocationId">From Location</label>
              <select
                id="fromLocationId"
                className={fieldErrors.fromLocationId ? 'input input-error' : 'input'}
                value={form.fromLocationId}
                onChange={(event) => updateForm({ fromLocationId: event.target.value })}
                disabled={!editable}
              >
                <option value="">Select the source location…</option>
                {(locationsQuery.data ?? []).map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name} ({location.shortCode})
                  </option>
                ))}
              </select>
              {fieldErrors.fromLocationId && <p className="field-error">{fieldErrors.fromLocationId}</p>}
            </div>
            <div className="form-field">
              <label htmlFor="toLocationId">To Location</label>
              <select
                id="toLocationId"
                className={fieldErrors.toLocationId ? 'input input-error' : 'input'}
                value={form.toLocationId}
                onChange={(event) => updateForm({ toLocationId: event.target.value })}
                disabled={!editable}
              >
                <option value="">Select the destination location…</option>
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
                {isCreate ? 'Create Transfer' : updateMutation.isPending ? 'Saving…' : 'Save'}
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
          title="Cancel transfer"
          message="Canceling the transfer releases any reserved stock. No stock has moved for a Draft or Ready transfer."
          confirmLabel="Cancel transfer"
          busy={cancelMutation.isPending}
          onConfirm={() => cancelMutation.mutate()}
          onCancel={() => setCancelOpen(false)}
        />
      )}
    </section>
  );
}
