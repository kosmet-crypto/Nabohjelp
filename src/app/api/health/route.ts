import { APP_CONFIG } from '@/lib/config';
import { ok } from '@/lib/api';

export const GET = () => ok({ status: 'ok', app: APP_CONFIG.appName, paymentMode: APP_CONFIG.paymentMode });
