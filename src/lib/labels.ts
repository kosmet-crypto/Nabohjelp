import type { PricingType, TaskCategory, TaskStatus } from './types';

export const CATEGORY_LABEL: Record<TaskCategory, string> = {
  loan_item: 'Lån av ting',
  pet_sitting: 'Dyrepass',
  home_check: 'Tilsyn av bolig',
  small_repair: 'Småreparasjoner',
  other: 'Annet',
};

export const PRICING_LABEL: Record<PricingType, string> = {
  free: 'Gratis',
  loan: 'Utlån',
  paid: 'Betalt',
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  open: 'Åpen',
  assigned: 'Tildelt',
  in_progress: 'Pågår',
  completed: 'Fullført',
  cancelled: 'Kansellert',
};
