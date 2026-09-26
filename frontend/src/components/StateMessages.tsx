export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="state-message loading-state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="alert alert-error" role="alert">
      {message}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="state-message muted empty-state">
      <span className="empty-state-icon" aria-hidden="true">
        ▤
      </span>
      {message}
    </div>
  );
}
