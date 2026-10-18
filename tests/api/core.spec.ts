import { expect, test } from '@playwright/test';

import { expectSchema } from '../helpers/contract';
import {
  expectApiError,
  expectJson,
  PaymentApi,
  type PaymentList,
} from '../helpers/payment-api';
import { signWebhook } from '../helpers/webhook';

const missingPaymentId = '00000000-0000-4000-8000-000000000000';

test.describe('Merchant Payment API — credential-free checks', () => {
  test('reports healthy service and database state', async ({ request }) => {
    const response = await request.get('/api/health');
    const body = await expectJson<{ status: string; db: string; timestamp: string }>(response, 200);

    expectSchema('health', body);
    expect(body).toMatchObject({ status: 'ok', db: 'connected' });
  });

  test('returns checkout configuration without exposing a secret key', async ({ request }) => {
    const response = await request.get('/api/config');
    const body = await expectJson<{ publishableKey: string }>(response, 200);

    expect(body.publishableKey).toMatch(/^pk_test_/);
    expect(JSON.stringify(body)).not.toContain('sk_test_');
  });

  test('lists payments using documented defaults', async ({ request }) => {
    const body = await expectJson<PaymentList>(await new PaymentApi(request).list(), 200);

    expectSchema('paymentList', body);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);
    expect(body.payments.length).toBeLessThanOrEqual(20);
    expect(body.payments.every((payment) => !('client_secret' in payment))).toBe(true);
    const timestamps = body.payments.map((payment) => Date.parse(payment.created_at));
    expect(timestamps).toEqual([...timestamps].sort((left, right) => right - left));
  });

  test('normalizes invalid page and limit values', async ({ request }) => {
    const body = await expectJson<PaymentList>(
      await new PaymentApi(request).list({ page: 'not-a-number', limit: 'not-a-number' }),
      200,
    );

    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);
  });

  test('caps the list page size at 100', async ({ request }) => {
    const body = await expectJson<PaymentList>(
      await new PaymentApi(request).list({ page: -5, limit: 101 }),
      200,
    );

    expect(body.page).toBe(1);
    expect(body.limit).toBe(100);
    expect(body.payments.length).toBeLessThanOrEqual(100);
  });

  test('filters payment listings by status', async ({ request }) => {
    const body = await expectJson<PaymentList>(
      await new PaymentApi(request).list({ status: 'failed', limit: 100 }),
      200,
    );

    expect(body.payments.every((payment) => payment.status === 'failed')).toBe(true);
  });

  const invalidPaymentBodies: Array<{
    name: string;
    body: Record<string, unknown>;
    message: RegExp;
  }> = [
    {
      name: 'missing amount',
      body: { payment_method: 'pm_card_visa' },
      message: /amount/i,
    },
    {
      name: 'missing payment method',
      body: { amount: 5_000 },
      message: /payment_method/i,
    },
    {
      name: 'zero amount',
      body: { amount: 0, payment_method: 'pm_card_visa' },
      message: /positive integer/i,
    },
    {
      name: 'negative amount',
      body: { amount: -1, payment_method: 'pm_card_visa' },
      message: /positive integer/i,
    },
    {
      name: 'fractional amount',
      body: { amount: 50.5, payment_method: 'pm_card_visa' },
      message: /positive integer/i,
    },
    {
      name: 'string amount',
      body: { amount: '5000', payment_method: 'pm_card_visa' },
      message: /positive integer/i,
    },
    {
      name: 'unsupported currency',
      body: { amount: 5_000, currency: 'eur', payment_method: 'pm_card_visa' },
      message: /usd/i,
    },
    {
      name: 'unsupported capture method',
      body: { amount: 5_000, capture_method: 'later', payment_method: 'pm_card_visa' },
      message: /automatic.*manual/i,
    },
  ];

  for (const scenario of invalidPaymentBodies) {
    test(`rejects payment creation with ${scenario.name}`, async ({ request }) => {
      const error = await expectApiError(
        await new PaymentApi(request).create(scenario.body),
        400,
        'validation_error',
      );

      expectSchema('error', error);
      expect(error.error.message).toMatch(scenario.message);
    });
  }

  test('rejects malformed payment JSON', async ({ request }) => {
    const response = await request.post('/api/payments', {
      data: Buffer.from('{bad'),
      headers: { 'Content-Type': 'application/json' },
    });
    const error = await expectApiError(response, 400, 'invalid_request');

    expectSchema('error', error);
    expect(error.error.message).toMatch(/invalid json/i);
  });

  test('rejects an invalid payment ID on retrieval', async ({ request }) => {
    const error = await expectApiError(await new PaymentApi(request).get('not-a-uuid'), 400, 'validation_error');
    expectSchema('error', error);
  });

  test('returns not found for an unknown payment', async ({ request }) => {
    const error = await expectApiError(await new PaymentApi(request).get(missingPaymentId), 404, 'not_found');
    expectSchema('error', error);
  });

  test('rejects an invalid payment ID on capture', async ({ request }) => {
    const error = await expectApiError(
      await new PaymentApi(request).capture('not-a-uuid'),
      400,
      'validation_error',
    );
    expectSchema('error', error);
  });

  test('returns not found when capturing an unknown payment', async ({ request }) => {
    const error = await expectApiError(
      await new PaymentApi(request).capture(missingPaymentId),
      404,
      'not_found',
    );
    expectSchema('error', error);
  });

  test('rejects an invalid payment ID on refund', async ({ request }) => {
    const error = await expectApiError(
      await new PaymentApi(request).refund('not-a-uuid'),
      400,
      'validation_error',
    );
    expectSchema('error', error);
  });

  test('returns not found when refunding an unknown payment', async ({ request }) => {
    const error = await expectApiError(
      await new PaymentApi(request).refund(missingPaymentId),
      404,
      'not_found',
    );
    expectSchema('error', error);
  });

  test('rejects a webhook without an event type', async ({ request }) => {
    const payload = '{}';
    const signature = signWebhook(payload);
    const response = await request.post('/api/webhooks', {
      data: Buffer.from(payload),
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature },
    });
    const error = await expectApiError(response, 400, 'validation_error');

    expectSchema('error', error);
    expect(error.error.message).toMatch(/event type/i);
  });

  test('rejects malformed webhook JSON', async ({ request }) => {
    const payload = '{bad';
    const signature = signWebhook(payload);
    const response = await request.post('/api/webhooks', {
      data: Buffer.from(payload),
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature },
    });
    const error = await expectApiError(response, 400, 'validation_error');

    expectSchema('error', error);
    expect(error.error.message).toMatch(/invalid json/i);
  });

  test('accepts a correctly signed unsupported webhook without changing payments', async ({ request }) => {
    const event = {
      id: `evt_qa_${Date.now()}`,
      object: 'event',
      type: 'customer.created',
      created: Math.floor(Date.now() / 1_000),
      data: { object: { id: `cus_qa_${Date.now()}` } },
    };
    const payload = JSON.stringify(event);
    const signature = signWebhook(payload);
    const response = await request.post('/api/webhooks', {
      data: payload,
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature },
    });
    const body = await expectJson<{ received: boolean }>(response, 200);

    expect(body).toEqual({ received: true });
  });
});
