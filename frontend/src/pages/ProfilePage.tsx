import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { collectFieldErrors, updateProfileSchema } from '@stocksense/shared';
import { updateProfile } from '../api/auth';
import { ApiError } from '../api/client';
import { useAuth, type AuthUser } from '../auth/AuthContext';
import { TextField } from '../components/TextField';

interface ProfileFormProps {
  user: AuthUser;
  token: string;
}

function ProfileForm({ user, token }: ProfileFormProps) {
  const { setUser } = useAuth();
  const [displayName, setDisplayName] = useState(user.displayName ?? '');
  const [passwords, setPasswords] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [displayBanner, setDisplayBanner] = useState<string | null>(null);
  const [displayError, setDisplayError] = useState<string | null>(null);
  const [passwordBanner, setPasswordBanner] = useState<string | null>(null);
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const handleSaveName = async (event: FormEvent) => {
    event.preventDefault();
    setDisplayBanner(null);
    setDisplayError(null);

    const parsed = updateProfileSchema.safeParse({ displayName: displayName.trim() });
    if (!parsed.success) {
      setDisplayError(collectFieldErrors(parsed.error).displayName ?? 'Invalid display name');
      return;
    }

    setSavingName(true);
    try {
      const updated = await updateProfile(token, { displayName: displayName.trim() });
      setUser(updated);
      setDisplayBanner('Profile updated.');
    } catch (error) {
      setDisplayError(error instanceof ApiError ? error.message : 'Could not update the profile.');
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordBanner(null);
    setPasswordError(null);
    setPasswordErrors({});

    const parsed = updateProfileSchema.safeParse(passwords);
    if (!parsed.success) {
      setPasswordErrors(collectFieldErrors(parsed.error));
      return;
    }

    setSavingPassword(true);
    try {
      await updateProfile(token, passwords);
      setPasswords({ oldPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordBanner('Password changed.');
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.fields) setPasswordErrors(error.fields);
        setPasswordError(error.message);
      } else {
        setPasswordError('Could not change the password.');
      }
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="profile-grid">
      <div className="card">
        <h2 className="section-title">Account</h2>
        <div className="form-field">
          <label>Login Id</label>
          <p className="static-field">{user.loginId}</p>
        </div>
        <div className="form-field">
          <label>Email Id</label>
          <p className="static-field">{user.email}</p>
        </div>

        {displayBanner && (
          <div className="alert alert-success" role="status">
            {displayBanner}
          </div>
        )}
        {displayError && (
          <div className="alert alert-error" role="alert">
            {displayError}
          </div>
        )}
        <form onSubmit={handleSaveName} noValidate>
          <TextField
            label="Display Name"
            name="displayName"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="How your name appears in the app"
          />
          <button type="submit" className="btn btn-primary" disabled={savingName}>
            {savingName ? 'Saving…' : 'Save Profile'}
          </button>
        </form>
      </div>

      <div className="card">
        <h2 className="section-title">Change Password</h2>
        {passwordBanner && (
          <div className="alert alert-success" role="status">
            {passwordBanner}
          </div>
        )}
        {passwordError && (
          <div className="alert alert-error" role="alert">
            {passwordError}
          </div>
        )}
        <form onSubmit={handleChangePassword} noValidate>
          <TextField
            label="Old Password"
            name="oldPassword"
            type="password"
            value={passwords.oldPassword}
            onChange={(event) => setPasswords((current) => ({ ...current, oldPassword: event.target.value }))}
            error={passwordErrors.oldPassword}
            autoComplete="current-password"
          />
          <TextField
            label="New Password"
            name="newPassword"
            type="password"
            value={passwords.newPassword}
            onChange={(event) => setPasswords((current) => ({ ...current, newPassword: event.target.value }))}
            error={passwordErrors.newPassword}
            autoComplete="new-password"
            placeholder="Lowercase, uppercase, special, 9+ characters"
          />
          <TextField
            label="Confirm New Password"
            name="confirmPassword"
            type="password"
            value={passwords.confirmPassword}
            onChange={(event) => setPasswords((current) => ({ ...current, confirmPassword: event.target.value }))}
            error={passwordErrors.confirmPassword}
            autoComplete="new-password"
          />
          <button type="submit" className="btn btn-primary" disabled={savingPassword}>
            {savingPassword ? 'Changing…' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  );
}

/** My Profile — 02_UI_FUNCTIONALITY: loginId/email read-only, display name + password edit. */
export function ProfilePage() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <section className="page">
      <header className="page-header">
        <h1>My Profile</h1>
        <button type="button" className="btn btn-danger" onClick={handleLogout}>
          Logout
        </button>
      </header>

      {user && token ? (
        <ProfileForm key={user.id} user={user} token={token} />
      ) : (
        <div className="state-message">Loading profile…</div>
      )}
    </section>
  );
}
