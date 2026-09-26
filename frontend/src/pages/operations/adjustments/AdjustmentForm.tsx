import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adjustmentCreateSchema, collectFieldErrors } from '@stocksense/shared';
import { listLocations, listProducts, listStock } from '../../../api/inventory';
import { createAdjustment } from '../../../api/operations';
import { ApiError } from '../../../api/client';
import { useAuth } from '../../../auth/AuthContext';
import { Modal } from '../../../components/Modal';
import { TextField } from '../../../components/TextField';

interface AdjustmentFormProps {
  onClose: () => void;
  onSaved: (message: string) => void;
}

/**
 * New Adjustment — single-step form (adjust-1): product/location picker, recorded quantity,
 * counted quantity, live delta preview, optional reason. Applied immediately on submit.
 */
export function AdjustmentForm({ onClose, onSaved }: AdjustmentFormProps) {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const [productId, setProductId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

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

  const stockQuery = useQuery({
    queryKey: ['stock', { adjustment: { productId, locationId } }],
    queryFn: () => listStock(token!, { locationId, pageSize: 100 }),
    enabled: Boolean(token) && Boolean(productId) && Boolean(locationId),
  });

  const stockRow = stockQuery.data?.data.find((row) => row.productId === productId);
  const recorded = stockRow?.onHand ?? 0;
  const reserved = stockRow?.reserved ?? 0;
  const countedNumber = counted.trim() === '' ? null : Number(counted);
  const delta = countedNumber != null && Number.isFinite(countedNumber) ? countedNumber - recorded : null;

  const mutation = useMutation({
    mutationFn: () =>
      createAdjustment(token!, {
        productId,
        locationId,
        countedQuantity: countedNumber ?? 0,
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    onSuccess: (adjustment) => {
      void queryClient.invalidateQueries({ queryKey: ['adjustments'] });
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
      void queryClient.invalidateQueries({ queryKey: ['move-history'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      const signed = adjustment.delta > 0 ? `+${adjustment.delta}` : String(adjustment.delta);
      onSaved(`${adjustment.reference ?? 'Adjustment'} applied (${signed})`);
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        if (error.fields) setFieldErrors(error.fields);
        setFormError(error.message);
      } else {
        setFormError('Unexpected error. Please try again.');
      }
    },
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const parsed = adjustmentCreateSchema.safeParse({
      productId,
      locationId,
      countedQuantity: countedNumber ?? Number.NaN,
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    if (!parsed.success) {
      setFieldErrors(collectFieldErrors(parsed.error));
      return;
    }
    mutation.mutate();
  };

  const handleCountedChange = (event: ChangeEvent<HTMLInputElement>) => setCounted(event.target.value);

  return (
    <Modal title="New Adjustment" onClose={onClose}>
      {formError && <div className="alert alert-error">{formError}</div>}
      <form onSubmit={handleSubmit} noValidate>
        <div className="form-field">
          <label htmlFor="adjustmentProduct">Product</label>
          <select
            id="adjustmentProduct"
            className={fieldErrors.productId ? 'input input-error' : 'input'}
            value={productId}
            onChange={(event) => setProductId(event.target.value)}
          >
            <option value="">Select a product…</option>
            {(productsQuery.data?.data ?? []).map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} ({product.sku})
              </option>
            ))}
          </select>
          {fieldErrors.productId && <p className="field-error">{fieldErrors.productId}</p>}
        </div>

        <div className="form-field">
          <label htmlFor="adjustmentLocation">Location</label>
          <select
            id="adjustmentLocation"
            className={fieldErrors.locationId ? 'input input-error' : 'input'}
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
          >
            <option value="">Select a location…</option>
            {(locationsQuery.data ?? []).map((location) => (
              <option key={location.id} value={location.id}>
                {location.name} ({location.shortCode})
              </option>
            ))}
          </select>
          {fieldErrors.locationId && <p className="field-error">{fieldErrors.locationId}</p>}
        </div>

        {productId && locationId && (
          <div className="adjustment-preview">
            <div>
              <span className="kpi-label">Recorded</span>
              <strong>{stockQuery.isLoading ? '…' : recorded}</strong>
            </div>
            <div>
              <span className="kpi-label">Reserved</span>
              <strong>{stockQuery.isLoading ? '…' : reserved}</strong>
            </div>
            <div>
              <span className="kpi-label">Difference</span>
              {delta == null ? (
                <strong className="muted">—</strong>
              ) : delta > 0 ? (
                <strong className="delta-positive">+{delta}</strong>
              ) : delta < 0 ? (
                <strong className="delta-negative">{delta}</strong>
              ) : (
                <strong className="muted">0</strong>
              )}
            </div>
          </div>
        )}

        <TextField
          label="Counted Quantity"
          name="countedQuantity"
          type="number"
          value={counted}
          onChange={handleCountedChange}
          error={fieldErrors.countedQuantity}
          placeholder="Physical count"
        />

        <div className="form-field">
          <label htmlFor="adjustmentNote">Reason / Note (optional)</label>
          <textarea
            id="adjustmentNote"
            className="input"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          {fieldErrors.note && <p className="field-error">{fieldErrors.note}</p>}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Applying…' : 'Apply Adjustment'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
