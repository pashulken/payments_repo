import { createHmac } from 'node:crypto';

export function signWebhook(payload: string): string {
  const timestamp = Math.floor(Date.now() / 1_000);
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_test';
  const digest = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${digest}`;
}
