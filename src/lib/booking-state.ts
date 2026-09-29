/**
 * Client-side mirror of the booking state machine enforced by the
 * `bookings_before_update` trigger. The DB is the source of truth; this is
 * used to render the right buttons and fail fast before hitting the API.
 */
import type { BookingRole, BookingStatus, EscrowStatus, PaymentMode, TaskStatus } from './types';

type Rule = { from: BookingStatus[]; to: BookingStatus; roles: BookingRole[] };

const RULES: Rule[] = [
  { from: ['requested'], to: 'accepted', roles: ['owner'] },
  { from: ['requested'], to: 'declined', roles: ['owner'] },
  { from: ['requested'], to: 'cancelled', roles: ['helper'] },
  { from: ['accepted'], to: 'in_progress', roles: ['owner', 'helper'] },
  { from: ['accepted'], to: 'cancelled', roles: ['owner', 'helper'] },
  { from: ['in_progress'], to: 'completed', roles: ['owner'] },
  { from: ['accepted', 'in_progress', 'completed'], to: 'disputed', roles: ['owner', 'helper'] },
];

export function canTransition(from: BookingStatus, to: BookingStatus, role: BookingRole): boolean {
  return RULES.some((r) => r.to === to && r.from.includes(from) && r.roles.includes(role));
}

export function allowedTransitions(from: BookingStatus, role: BookingRole): BookingStatus[] {
  return RULES.filter((r) => r.from.includes(from) && r.roles.includes(role)).map((r) => r.to);
}

export const isTerminal = (s: BookingStatus) => s === 'declined' || s === 'cancelled' || s === 'completed';

export function roleOf(booking: { owner_id: string; helper_id: string }, userId: string): BookingRole | null {
  if (booking.owner_id === userId) return 'owner';
  if (booking.helper_id === userId) return 'helper';
  return null;
}

/** Simulated escrow lifecycle used in test_free mode (mirrors the trigger). */
export function nextEscrowStatus(
  mode: PaymentMode,
  prevEscrow: EscrowStatus,
  nextStatus: BookingStatus,
): EscrowStatus {
  if (mode !== 'test_free') return prevEscrow; // live: driven by PSP webhooks
  switch (nextStatus) {
    case 'accepted':
    case 'in_progress':
      return 'held';
    case 'completed':
      return 'released';
    case 'disputed':
      return 'disputed';
    case 'cancelled':
      return prevEscrow === 'held' ? 'refunded' : prevEscrow;
    default:
      return prevEscrow;
  }
}

/** Task status implied by a booking transition (mirrors bookings_sync_task). */
export function taskStatusAfter(
  current: TaskStatus,
  prevBooking: BookingStatus,
  nextBooking: BookingStatus,
): TaskStatus {
  switch (nextBooking) {
    case 'accepted':
      return 'assigned';
    case 'in_progress':
      return 'in_progress';
    case 'completed':
      return 'completed';
    case 'cancelled':
      return prevBooking === 'accepted' || prevBooking === 'in_progress' ? 'open' : current;
    default:
      return current;
  }
}

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  requested: 'Forespurt',
  accepted: 'Akseptert',
  declined: 'Avslått',
  in_progress: 'Pågår',
  completed: 'Fullført',
  cancelled: 'Kansellert',
  disputed: 'Tvist',
};

export const ESCROW_STATUS_LABEL: Record<EscrowStatus, string> = {
  not_required: 'Ingen betaling',
  pending: 'Venter på betaling',
  held: 'Holdt (depositum)',
  released: 'Utbetalt',
  refunded: 'Refundert',
  disputed: 'Frosset – tvist',
};
