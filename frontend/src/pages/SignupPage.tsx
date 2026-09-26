import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collectFieldErrors, signupSchema } from '@stocksense/shared';
import { signup } from '../api/auth';
import { ApiError } from '../api/client';
import { TextField } from '../components/TextField';

/** Sign Up screen — IMG:1, R1.1-R1.5, BR1-BR4. Success redirects to Login with a toast. */
export function SignupPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState({ loginId: '', email: '', password: '', confirmPassword: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const parsed = signupSchema.safeParse(form);
    if (!parsed.success) {
      setFieldErrors(collectFieldErrors(parsed.error));
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      await signup(parsed.data);
      navigate('/login', {
        replace: true,
        state: { message: 'Account created successfully. Please sign in.' },
      });
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.fields ? null : error.message);
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
        <h1>Sign Up</h1>
        <p className="muted">Create your StockSense account</p>

        {formError && <div className="alert alert-error">{formError}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <TextField
            label="Login Id"
            name="loginId"
            value={form.loginId}
            onChange={handleChange}
            error={fieldErrors.loginId}
            autoComplete="username"
            placeholder="6-12 characters"
          />
          <TextField
            label="Email Id"
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            error={fieldErrors.email}
            autoComplete="email"
            placeholder="you@example.com"
          />
          <TextField
            label="Password"
            name="password"
            type="password"
            value={form.password}
            onChange={handleChange}
            error={fieldErrors.password}
            autoComplete="new-password"
            placeholder="Lowercase, uppercase, special, 9+ characters"
          />
          <TextField
            label="Re-Enter Password"
            name="confirmPassword"
            type="password"
            value={form.confirmPassword}
            onChange={handleChange}
            error={fieldErrors.confirmPassword}
            autoComplete="new-password"
            placeholder="Repeat your password"
          />
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Creating account…' : 'Sign Up'}
          </button>
        </form>

        <div className="auth-links">
          <span>
            Already have an account? <Link to="/login">Sign In</Link>
          </span>
        </div>
      </div>
    </div>
  );
}
