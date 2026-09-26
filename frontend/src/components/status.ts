export const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  WAITING: 'Waiting',
  READY: 'Ready',
  DONE: 'Done',
  CANCELED: 'Canceled',
};

export const STATUS_BADGE_CLASS: Record<string, string> = {
  DRAFT: 'badge',
  WAITING: 'badge badge-warning',
  READY: 'badge',
  DONE: 'badge badge-success',
  CANCELED: 'badge badge-danger',
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}
