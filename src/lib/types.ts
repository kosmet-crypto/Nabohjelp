// Mirrors the enums/tables in supabase/migrations/20260929000000_phase1_init.sql

export const TASK_CATEGORIES = ['loan_item', 'pet_sitting', 'home_check', 'small_repair', 'other'] as const;
export const PRICING_TYPES = ['free', 'loan', 'paid'] as const;
export const TASK_STATUSES = ['open', 'assigned', 'in_progress', 'completed', 'cancelled'] as const;
export const BOOKING_STATUSES = ['requested', 'accepted', 'declined', 'in_progress', 'completed', 'cancelled', 'disputed'] as const;
export const PAYMENT_MODES = ['test_free', 'live'] as const;
export const ESCROW_STATUSES = ['not_required', 'pending', 'held', 'released', 'refunded', 'disputed'] as const;

export type TaskCategory = (typeof TASK_CATEGORIES)[number];
export type PricingType = (typeof PRICING_TYPES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export type PaymentMode = (typeof PAYMENT_MODES)[number];
export type EscrowStatus = (typeof ESCROW_STATUSES)[number];

export interface GeoPoint { lat: number; lng: number }

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  phone: string | null;
  address_line: string | null;
  postal_code: string | null;
  city: string;
  country_code: string;
  location: unknown | null; // PostGIS geography (GeoJSON / WKB from PostgREST)
  rating_avg: number;
  rating_count: number;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

export type PublicProfile = Pick<
  Profile,
  'id' | 'full_name' | 'avatar_url' | 'bio' | 'city' | 'rating_avg' | 'rating_count' | 'is_verified' | 'created_at'
> & { approx_location: unknown | null };

export interface Task {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  category: TaskCategory;
  pricing_type: PricingType;
  price_ore: number;
  currency: string;
  status: TaskStatus;
  location: unknown;
  area_label: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NearbyTask {
  id: string;
  owner_id: string;
  title: string;
  category: TaskCategory;
  pricing_type: PricingType;
  area_label: string | null;
  status: TaskStatus;
  distance_m: number;
  created_at: string;
}

export interface Booking {
  id: string;
  task_id: string;
  owner_id: string;
  helper_id: string;
  status: BookingStatus;
  message: string | null;
  payment_mode: PaymentMode;
  is_simulated: boolean;
  amount_ore: number;
  platform_fee_ore: number;
  currency: string;
  escrow_status: EscrowStatus;
  payment_provider: 'vipps' | 'stripe' | null;
  payment_reference: string | null;
  escrow_held_at: string | null;
  escrow_released_at: string | null;
  disputed_at: string | null;
  dispute_reason: string | null;
  accepted_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export type BookingRole = 'owner' | 'helper';

/** Uniform result type for helpers & API routes. */
export type Result<T, E = string> = { ok: true; data: T } | { ok: false; error: E };
