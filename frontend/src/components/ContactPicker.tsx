import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { collectFieldErrors, contactCreateSchema } from '@stocksense/shared';
import { ApiError } from '../api/client';
import { createContact, listContacts } from '../api/operations';
import { useAuth } from '../auth/AuthContext';
import { Modal } from './Modal';
import { TextField } from './TextField';

interface ContactPickerProps {
  id: string;
  label: string;
  type: 'VENDOR' | 'CUSTOMER';
  value: string;
  onChange: (contactId: string) => void;
  error?: string;
  disabled?: boolean;
}

/** Contact select for the receipt "Receive From" / delivery customer fields (§4b). */
export function ContactPicker({
  id,
  label,
  type,
  value,
  onChange,
  error,
  disabled = false,
}: ContactPickerProps) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const contactsQuery = useQuery({
    queryKey: ['contacts', { type }],
    queryFn: () => listContacts(token!, { type }),
    enabled: Boolean(token),
  });

  const createMutation = useMutation({
    mutationFn: (input: { name: string; type: 'VENDOR' | 'CUSTOMER'; email: string | null; phone: string | null }) =>
      createContact(token!, input),
    onSuccess: (contact) => {
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
      onChange(contact.id);
      setCreateOpen(false);
      setForm({ name: '', email: '', phone: '' });
      setFieldErrors({});
      setFormError(null);
    },
    onError: (mutationError) => {
      if (mutationError instanceof ApiError) {
        if (mutationError.fields) setFieldErrors(mutationError.fields);
        else setFormError(mutationError.message);
      } else {
        setFormError('Unexpected error. Please try again.');
      }
    },
  });

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const handleCreate = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const parsed = contactCreateSchema.safeParse({
      name: form.name,
      type,
      email: form.email || null,
      phone: form.phone || null,
    });
    if (!parsed.success) {
      setFieldErrors(collectFieldErrors(parsed.error));
      return;
    }
    setFieldErrors({});
    createMutation.mutate({
      name: parsed.data.name,
      type: parsed.data.type,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
    });
  };

  const noun = type === 'VENDOR' ? 'supplier' : 'customer';

  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <div className="input-with-action">
        <select
          id={id}
          className={error ? 'input input-error' : 'input'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          aria-invalid={Boolean(error)}
        >
          <option value="">Select a {noun}…</option>
          {(contactsQuery.data ?? []).map((contact) => (
            <option key={contact.id} value={contact.id}>
              {contact.name}
              {contact.email ? ` — ${contact.email}` : ''}
            </option>
          ))}
        </select>
        {!disabled && (
          <button type="button" className="btn btn-secondary" onClick={() => setCreateOpen(true)}>
            New
          </button>
        )}
      </div>
      {error && <p className="field-error">{error}</p>}

      {createOpen && (
        <Modal title={type === 'VENDOR' ? 'New Supplier' : 'New Customer'} onClose={() => setCreateOpen(false)}>
          {formError && <div className="alert alert-error">{formError}</div>}
          <form onSubmit={handleCreate} noValidate>
            <TextField label="Name" name="name" value={form.name} onChange={handleChange} error={fieldErrors.name} />
            <TextField
              label="Email"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              error={fieldErrors.email}
            />
            <TextField
              label="Phone"
              name="phone"
              value={form.phone}
              onChange={handleChange}
              error={fieldErrors.phone}
            />
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setCreateOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating…' : `Create ${type === 'VENDOR' ? 'Supplier' : 'Customer'}`}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
