import { statusColors, statusSemantic } from './tokens.js';

// One place that turns a domain status string into a colour and a human label, so no
// component ever writes its own `status === 'VERIFIED' ? 'green' : ...` ladder. Unknown
// statuses fall back to neutral rather than throwing — a new enum value added on the
// API side should render plainly, not crash a dashboard.

export function statusColor(status: string | null | undefined): string {
  if (!status) return statusSemantic.neutral;
  return statusColors[status] ?? statusSemantic.neutral;
}

export const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending review',
  VERIFIED: 'Verified',
  REJECTED: 'Rejected',
  INFO_REQUESTED: 'More info needed',
  OPEN: 'Open',
  PARTIALLY_FUNDED: 'Partly funded',
  FULLY_FUNDED: 'Fully funded',
  CLOSED: 'Closed',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  CREATED: 'Awaiting payment',
  PAID: 'Paid',
  FAILED: 'Failed',
  REFUNDED: 'Refunded',
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  PLANNED: 'Planned',
  PURCHASED: 'Purchased',
};
