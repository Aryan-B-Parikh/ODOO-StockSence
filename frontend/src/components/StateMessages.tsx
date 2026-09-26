export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return <div className="state-message">{label}</div>;
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="alert alert-error" role="alert">
      {message}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <div className="state-message muted">{message}</div>;
}
