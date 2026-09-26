import { useState, type ChangeEvent, type FormEvent } from 'react';
import {
  collectFieldErrors,
  locationCreateSchema,
  locationUpdateSchema,
  type LocationSummary,
  type WarehouseSummary,
} from '@stocksense/shared';
import { ApiError } from '../../api/client';
import { createLocation, updateLocation } from '../../api/inventory';
import { useAuth } from '../../auth/AuthContext';
import { Modal } from '../../components/Modal';
import { TextField } from '../../components/TextField';

interface LocationFormProps {
  location: LocationSummary | null;
  warehouses: WarehouseSummary[];
  onClose: () => void;
  onSaved: () => void;
}

/** Location settings form — IMG:8/10, R10.2/R10.3, BR29 (warehouse immutable on edit). */
export function LocationForm({ location, warehouses, onClose, onSaved }: LocationFormProps) {
  const { token } = useAuth();
  const isEdit = Boolean(location);

  const [form, setForm] = useState({
    warehouseId: location?.warehouseId ?? '',
    name: location?.name ?? '',
    shortCode: location?.shortCode ?? '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const warehouseName = warehouses.find((warehouse) => warehouse.id === form.warehouseId)?.name;

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (isEdit) {
      const parsed = locationUpdateSchema.safeParse({ name: form.name, shortCode: form.shortCode });
      if (!parsed.success) {
        setFieldErrors(collectFieldErrors(parsed.error));
        return;
      }
      setFieldErrors({});
      setSubmitting(true);
      try {
        await updateLocation(token!, location!.id, { name: form.name, shortCode: form.shortCode });
        onSaved();
      } catch (error) {
        if (error instanceof ApiError) {
          if (error.fields) setFieldErrors(error.fields);
          else setFormError(error.message);
        } else {
          setFormError('Unexpected error. Please try again.');
        }
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const parsed = locationCreateSchema.safeParse(form);
    if (!parsed.success) {
      setFieldErrors(collectFieldErrors(parsed.error));
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      await createLocation(token!, form);
      onSaved();
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.fields) setFieldErrors(error.fields);
        else setFormError(error.message);
      } else {
        setFormError('Unexpected error. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={isEdit ? 'Edit Location' : 'New Location'} onClose={onClose}>
      {formError && <div className="alert alert-error">{formError}</div>}
      <form onSubmit={handleSubmit} noValidate>
        {isEdit ? (
          <div className="form-field">
            <label>Warehouse</label>
            <p className="static-field">
              {warehouseName ?? '—'} <span className="muted">(cannot be changed — BR29)</span>
            </p>
          </div>
        ) : (
          <div className="form-field">
            <label htmlFor="warehouseId">Warehouse</label>
            <select
              id="warehouseId"
              name="warehouseId"
              className="input"
              value={form.warehouseId}
              onChange={handleChange}
            >
              <option value="">Select a warehouse…</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name} ({warehouse.shortCode})
                </option>
              ))}
            </select>
            {fieldErrors.warehouseId && <p className="field-error">{fieldErrors.warehouseId}</p>}
          </div>
        )}

        <TextField label="Name" name="name" value={form.name} onChange={handleChange} error={fieldErrors.name} />
        <TextField
          label="Short Code"
          name="shortCode"
          value={form.shortCode}
          onChange={handleChange}
          error={fieldErrors.shortCode}
          placeholder="e.g. RACKA"
        />

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Location'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
