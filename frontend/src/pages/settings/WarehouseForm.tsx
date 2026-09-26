import { useState, type ChangeEvent, type FormEvent } from 'react';
import {
  collectFieldErrors,
  warehouseCreateSchema,
  warehouseUpdateSchema,
  type WarehouseSummary,
} from '@stocksense/shared';
import { ApiError } from '../../api/client';
import { createWarehouse, updateWarehouse } from '../../api/inventory';
import { useAuth } from '../../auth/AuthContext';
import { Modal } from '../../components/Modal';
import { TextField } from '../../components/TextField';

interface WarehouseFormProps {
  warehouse: WarehouseSummary | null;
  onClose: () => void;
  onSaved: () => void;
}

/** Warehouse settings form — IMG:11, R10.1. */
export function WarehouseForm({ warehouse, onClose, onSaved }: WarehouseFormProps) {
  const { token } = useAuth();
  const isEdit = Boolean(warehouse);

  const [form, setForm] = useState({
    name: warehouse?.name ?? '',
    shortCode: warehouse?.shortCode ?? '',
    address: warehouse?.address ?? '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const input = { name: form.name, shortCode: form.shortCode, address: form.address || null };
    const parsed = isEdit ? warehouseUpdateSchema.safeParse(input) : warehouseCreateSchema.safeParse(input);
    if (!parsed.success) {
      setFieldErrors(collectFieldErrors(parsed.error));
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    try {
      if (isEdit && warehouse) {
        await updateWarehouse(token!, warehouse.id, input);
      } else {
        await createWarehouse(token!, input);
      }
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
    <Modal title={isEdit ? 'Edit Warehouse' : 'New Warehouse'} onClose={onClose}>
      {formError && <div className="alert alert-error">{formError}</div>}
      <form onSubmit={handleSubmit} noValidate>
        <TextField label="Name" name="name" value={form.name} onChange={handleChange} error={fieldErrors.name} />
        <TextField
          label="Short Code"
          name="shortCode"
          value={form.shortCode}
          onChange={handleChange}
          error={fieldErrors.shortCode}
          placeholder="e.g. WH"
        />
        <div className="form-field">
          <label htmlFor="address">Address</label>
          <textarea
            id="address"
            name="address"
            className="input"
            rows={3}
            value={form.address}
            onChange={handleChange}
          />
          {fieldErrors.address && <p className="field-error">{fieldErrors.address}</p>}
        </div>
        <p className="muted">
          The Short Code is used as the reference prefix for receipts, deliveries, transfers and adjustments.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Warehouse'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
