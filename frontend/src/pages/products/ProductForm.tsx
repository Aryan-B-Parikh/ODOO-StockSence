import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  collectFieldErrors,
  productCreateSchema,
  productUpdateSchema,
  type CategorySummary,
  type ProductSummary,
} from '@stocksense/shared';
import { createProduct, listLocations, updateProduct } from '../../api/inventory';
import { ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Modal } from '../../components/Modal';
import { TextField } from '../../components/TextField';

interface ProductFormProps {
  product: ProductSummary | null;
  categories: CategorySummary[];
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  name: string;
  sku: string;
  categoryId: string;
  uom: string;
  costPerUnit: string;
  reorderMin: string;
  reorderMax: string;
  initialLocationId: string;
  initialQuantity: string;
}

function toFormState(product: ProductSummary | null): FormState {
  return {
    name: product?.name ?? '',
    sku: product?.sku ?? '',
    categoryId: product?.categoryId ?? '',
    uom: product?.uom ?? '',
    costPerUnit: product?.costPerUnit != null ? String(product.costPerUnit) : '',
    reorderMin: product?.reorderMin != null ? String(product.reorderMin) : '',
    reorderMax: product?.reorderMax != null ? String(product.reorderMax) : '',
    initialLocationId: '',
    initialQuantity: '',
  };
}

function optionalNumber(value: string): number | null {
  return value.trim() === '' ? null : Number(value);
}

/** Create/edit product form — R4.1, R4.2, R4.5, 06_BUSINESS_RULES BR27/BR28. */
export function ProductForm({ product, categories, onClose, onSaved }: ProductFormProps) {
  const { token } = useAuth();
  const isEdit = Boolean(product);

  const [form, setForm] = useState<FormState>(() => toFormState(product));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const locationsQuery = useQuery({
    queryKey: ['locations'],
    queryFn: () => listLocations(token!),
    enabled: Boolean(token) && !isEdit,
  });

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const buildPatch = () => ({
    name: form.name,
    sku: form.sku,
    categoryId: form.categoryId === '' ? null : form.categoryId,
    uom: form.uom,
    costPerUnit: optionalNumber(form.costPerUnit),
    reorderMin: optionalNumber(form.reorderMin),
    reorderMax: optionalNumber(form.reorderMax),
  });

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const base = buildPatch();
    const createInput = {
      ...base,
      ...(!isEdit && form.initialLocationId && form.initialQuantity.trim() !== ''
        ? { initialStock: { locationId: form.initialLocationId, quantity: Number(form.initialQuantity) } }
        : {}),
    };

    const parsed = isEdit ? productUpdateSchema.safeParse(base) : productCreateSchema.safeParse(createInput);
    if (!parsed.success) {
      setFieldErrors(collectFieldErrors(parsed.error));
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    try {
      if (isEdit && product) {
        await updateProduct(token!, product.id, base);
      } else {
        await createProduct(token!, createInput);
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
    <Modal title={isEdit ? 'Edit Product' : 'New Product'} onClose={onClose}>
      {formError && <div className="alert alert-error">{formError}</div>}
      <form onSubmit={handleSubmit} noValidate>
        <TextField label="Name" name="name" value={form.name} onChange={handleChange} error={fieldErrors.name} />
        <TextField
          label="SKU / Code"
          name="sku"
          value={form.sku}
          onChange={handleChange}
          error={fieldErrors.sku}
          placeholder="e.g. STL-ROD-001"
        />
        <div className="form-field">
          <label htmlFor="categoryId">Category</label>
          <select id="categoryId" name="categoryId" className="input" value={form.categoryId} onChange={handleChange}>
            <option value="">No category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <TextField
          label="Unit of Measure"
          name="uom"
          value={form.uom}
          onChange={handleChange}
          error={fieldErrors.uom}
          placeholder="kg, pcs, unit…"
        />
        <div className="form-row">
          <TextField
            label="Per Unit Cost"
            name="costPerUnit"
            type="number"
            value={form.costPerUnit}
            onChange={handleChange}
            error={fieldErrors.costPerUnit}
          />
          <TextField
            label="Reorder Min"
            name="reorderMin"
            type="number"
            value={form.reorderMin}
            onChange={handleChange}
            error={fieldErrors.reorderMin}
          />
          <TextField
            label="Reorder Max"
            name="reorderMax"
            type="number"
            value={form.reorderMax}
            onChange={handleChange}
            error={fieldErrors.reorderMax}
          />
        </div>

        {!isEdit && (
          <fieldset className="form-fieldset">
            <legend>Initial stock (optional)</legend>
            <div className="form-row">
              <div className="form-field">
                <label htmlFor="initialLocationId">Location</label>
                <select
                  id="initialLocationId"
                  name="initialLocationId"
                  className="input"
                  value={form.initialLocationId}
                  onChange={handleChange}
                >
                  <option value="">No initial stock</option>
                  {(locationsQuery.data ?? []).map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name} ({location.shortCode})
                    </option>
                  ))}
                </select>
                {fieldErrors.locationId && <p className="field-error">{fieldErrors.locationId}</p>}
              </div>
              <TextField
                label="Quantity"
                name="initialQuantity"
                type="number"
                value={form.initialQuantity}
                onChange={handleChange}
                error={fieldErrors.initialStock}
              />
            </div>
          </fieldset>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Product'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
