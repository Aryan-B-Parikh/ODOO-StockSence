import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collectFieldErrors, otpRequestSchema, otpVerifyResetSchema } from '@stocksense/shared';
import { requestOtp, verifyOtpReset } from '../api/auth';
import { ApiError } from '../api/client';
import { TextField } from '../components/TextField';

type Step = 'request' | 'reset';

/** Forgot Password (OTP) flow — R1.9, R1.10, BR3, BR4, BR6. */
export function ForgotPasswordPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('request');
  const [loginIdOrEmail, setLoginIdOrEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [debugOtp, setDebugOtp] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleRequestOtp = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const parsed = otpRequestSchema.safeParse({ loginIdOrEmail });
    if (!parsed.success) {
      setFieldErrors(collectFieldErrors(parsed.error));
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      const result = await requestOtp(parsed.data);
      setDebugOtp(result.debugOtp ?? null);
      setStep('reset');
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'Unexpected error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const parsed = otpVerifyResetSchema.safeParse({ loginIdOrEmail, otp, newPassword, confirmPassword });
    if (!parsed.success) {
      setFieldErrors(collectFieldErrors(parsed.error));
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      await verifyOtpReset(parsed.data);
      navigate('/login', {
        replace: true,
        state: { message: 'Password reset successful. Please sign in.' },
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

  const handleTextChange =
    (setter: (value: string) => void) => (event: ChangeEvent<HTMLInputElement>) => {
      setter(event.target.value);
    };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          Stock<span>Sense</span>
        </div>
        <h1>Forgot Password?</h1>
        <p className="muted">
          {step === 'request'
            ? 'Enter your Login Id or Email Id to receive a one-time password.'
            : 'Enter the OTP you received, then choose a new password.'}
        </p>

        {step === 'reset' && debugOtp && (
          <div className="alert alert-info">
            Demo environment: your OTP is <strong>{debugOtp}</strong> (also logged on the server console).
          </div>
        )}
        {formError && <div className="alert alert-error">{formError}</div>}

        {step === 'request' ? (
          <form onSubmit={handleRequestOtp} noValidate>
            <TextField
              label="Login Id or Email Id"
              name="loginIdOrEmail"
              value={loginIdOrEmail}
              onChange={handleTextChange(setLoginIdOrEmail)}
              error={fieldErrors.loginIdOrEmail}
              placeholder="demo01 or demo@example.com"
            />
            <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
              {submitting ? 'Sending OTP…' : 'Send OTP'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleReset} noValidate>
            <TextField
              label="OTP"
              name="otp"
              value={otp}
              onChange={handleTextChange(setOtp)}
              error={fieldErrors.otp}
              placeholder="6-digit code"
            />
            <TextField
              label="New Password"
              name="newPassword"
              type="password"
              value={newPassword}
              onChange={handleTextChange(setNewPassword)}
              error={fieldErrors.newPassword}
              autoComplete="new-password"
              placeholder="Lowercase, uppercase, special, 9+ characters"
            />
            <TextField
              label="Confirm New Password"
              name="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={handleTextChange(setConfirmPassword)}
              error={fieldErrors.confirmPassword}
              autoComplete="new-password"
              placeholder="Repeat your new password"
            />
            <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
              {submitting ? 'Resetting password…' : 'Reset Password'}
            </button>
          </form>
        )}

        <div className="auth-links">
          <Link to="/login">Back to Sign In</Link>
        </div>
      </div>
    </div>
  );
}
