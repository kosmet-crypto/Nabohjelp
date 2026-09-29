/**
 * Global feature flags. During the test phase everything is free and no
 * payment provider is wired up. Flip `paymentMode` to 'live' only when
 * Vipps/Stripe escrow is implemented server-side.
 */
export const APP_CONFIG = {
  appName: 'Nabohjelp Pro',
  paymentMode: 'test_free' as 'test_free' | 'live',
  currency: 'NOK' as const,
  /** Platform fee in basis points (100 bps = 1 %). 0 during test phase. */
  platformFeeBps: 0,
  defaultSearchRadiusM: 3000,
  maxSearchRadiusM: 50_000,
  locale: 'nb-NO',
} as const;

export const isTestPhase = () => APP_CONFIG.paymentMode === 'test_free';
export const paymentsEnabled = () => APP_CONFIG.paymentMode === 'live';
