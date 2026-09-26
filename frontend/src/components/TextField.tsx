import type { ChangeEvent } from 'react';

interface TextFieldProps {
  label: string;
  name: string;
  type?: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  autoComplete?: string;
  placeholder?: string;
}

export function TextField({
  label,
  name,
  type = 'text',
  value,
  onChange,
  error,
  autoComplete,
  placeholder,
}: TextFieldProps) {
  return (
    <div className="form-field">
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        className={error ? 'input input-error' : 'input'}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${name}-error` : undefined}
        autoComplete={autoComplete}
        placeholder={placeholder}
      />
      {error && (
        <p className="field-error" id={`${name}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
