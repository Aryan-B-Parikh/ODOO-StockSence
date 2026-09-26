import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { collectFieldErrors, loginSchema } from '@stocksense/shared';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { TextField } from '../components/TextField';

interface LoginLocationState {
  message?: string;
}

/** Login screen — IMG:1, R1.6-R1.9, R1.11, BR5. */
export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const successMessage = (location.state as LoginLocationState | null)?.message;

  const [form, setForm] = useState({ loginId: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const parsed = loginSchema.safeParse(form);
    if (!parsed.success) {
      setFieldErrors(collectFieldErrors(parsed.error));
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      await login(parsed.data.loginId, parsed.data.password);
      navigate('/dashboard', { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message);
        if (error.fields) setFieldErrors(error.fields);
      } else {
        setFormError('Unexpected error. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          Stock<span>Sense</span>
        </div>
        <h1>Sign In</h1>
        <p className="muted">Inventory Management System</p>

        {successMessage && <div className="alert alert-success">{successMessage}</div>}
        {formError && <div className="alert alert-error">{formError}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <TextField
            label="Login Id"
            name="loginId"
            value={form.loginId}
            onChange={handleChange}
            error={fieldErrors.loginId}
            autoComplete="username"
            placeholder="e.g. demo01"
          />
          <TextField
            label="Password"
            name="password"
            type="password"
            value={form.password}
            onChange={handleChange}
            error={fieldErrors.password}
            autoComplete="current-password"
            placeholder="Your password"
          />
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div className="auth-links">
          <Link to="/forgot-password">Forget Password?</Link>
          <span>
            New here? <Link to="/signup">Sign Up</Link>
          </span>
        </div>
      </div>
    </div>
  );
}
