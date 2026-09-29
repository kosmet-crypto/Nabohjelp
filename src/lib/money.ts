import { APP_CONFIG } from './config';

/** 1 NOK = 100 øre. All amounts are stored as integer øre. */
export const nokToOre = (nok: number): number => Math.round(nok * 100);
export const oreToNok = (ore: number): number => ore / 100;

export function formatNok(ore: number): string {
  if (ore === 0) return 'Gratis';
  return new Intl.NumberFormat(APP_CONFIG.locale, {
    style: 'currency',
    currency: APP_CONFIG.currency,
    minimumFractionDigits: ore % 100 === 0 ? 0 : 2,
  }).format(oreToNok(ore));
}

export function calcPlatformFee(amountOre: number, feeBps: number = APP_CONFIG.platformFeeBps): number {
  if (amountOre <= 0 || feeBps <= 0) return 0;
  return Math.round((amountOre * feeBps) / 10_000);
}

/** Amounts a booking should carry given the current payment mode. */
export function bookingAmounts(taskPriceOre: number) {
  if (APP_CONFIG.paymentMode === 'test_free') {
    return { amount_ore: 0, platform_fee_ore: 0, helper_payout_ore: 0 };
  }
  const fee = calcPlatformFee(taskPriceOre);
  return { amount_ore: taskPriceOre, platform_fee_ore: fee, helper_payout_ore: taskPriceOre - fee };
}
