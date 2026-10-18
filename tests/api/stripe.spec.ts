import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { expectSchema } from '../helpers/contract';
import {
  createSuccessfulPayment,
  expectApiError,
  expectJson,
  PaymentApi,
  type ApiError,
  type CapturedPayment,
  type CreatedPayment,
  type Payment,
  type Refund,
} from '../helpers/payment-api';

test.describe('@stripe Merchant Payment API — Stripe sandbox flows', { tag: '@contract' }, () => {
  test.skip(
    process.env.RUN_STRIPE_TESTS !== 'true',
    'Set RUN_STRIPE_TESTS=true and start the service with Stripe test keys.',
  );

  test('creates and persists a successful Visa payment', async ({ request }) => {
    const api = new PaymentApi(request);
    const payment = await createSuccessfulPayment(api, {
      amount: 5_001,
      description: 'Automated Visa payment',
    });

    expectSchema('createdPayment', payment);
    expect(payment).toMatchObject({
      amount: 5_001,
      currency: 'usd',
      status: 'succeeded',
      capture_method: 'automatic',
      description: 'Automated Visa payment',
    });

    const stored = await expectJson<Payment>(await api.get(payment.id), 200);
    expectSchema('payment', stored);
    expect(stored).toMatchObject({ id: payment.id, stripe_pi_id: payment.stripe_pi_id });
    expect(stored).not.toHaveProperty('client_secret');
  });

  test('creates a successful Mastercard payment', async ({ request }) => {
    const payment = await createSuccessfulPayment(new PaymentApi(request), {
      amount: 5_002,
      payment_method: 'pm_card_mastercard',
    });

    expectSchema('createdPayment', payment);
    expect(payment.status).toBe('succeeded');
  });

  test('accepts Stripe minimum amount of 50 cents', async ({ request }) => {
    const payment = await createSuccessfulPayment(new PaymentApi(request), { amount: 50 });

    expect(payment.amount).toBe(50);
    expect(payment.status).toBe('succeeded');
  });

  test('rejects an amount below the Stripe minimum', async ({ request }) => {
    const error = await expectApiError(
      await new PaymentApi(request).create({ amount: 49, payment_method: 'pm_card_visa' }),
      400,
      'invalid_request',
    );

    expect(error.error.message).toMatch(/at least.*0\.50/i);
  });

  test('records a 3D Secure payment as requiring customer action', async ({ request }) => {
    const response = await new PaymentApi(request).create({
      amount: 5_003,
      payment_method: 'pm_card_threeDSecure2Required',
    });
    const payment = await expectJson<CreatedPayment>(response, 201);

    expectSchema('createdPayment', payment);
    expect(payment.status).toBe('requires_action');
  });

  const declinedCards = [
    {
      name: 'generic decline',
      paymentMethod: 'pm_card_chargeDeclined',
      declineCode: 'generic_decline',
    },
    {
      name: 'insufficient funds',
      paymentMethod: 'pm_card_chargeDeclinedInsufficientFunds',
      declineCode: 'insufficient_funds',
    },
  ];

  for (const card of declinedCards) {
    test(`returns a card error for ${card.name}`, async ({ request }) => {
      const response = await new PaymentApi(request).create({
        amount: 5_100,
        payment_method: card.paymentMethod,
      });
      const error = await expectJson<ApiError>(response, 402);

      expectSchema('cardError', error);
      expect(error.error).toMatchObject({
        type: 'card_error',
        code: 'card_declined',
        decline_code: card.declineCode,
      });
      expect(error.error.message).toEqual(expect.any(String));
    });
  }

  test('rejects an email address Stripe considers invalid', async ({ request }) => {
    const error = await expectApiError(
      await new PaymentApi(request).create({
        amount: 5_004,
        payment_method: 'pm_card_visa',
        customer_email: 'not-an-email',
      }),
      400,
      'invalid_request',
    );

    expect(error.error.message).toMatch(/invalid email/i);
  });

  test('returns the same payment for a retry with the same idempotency key', async ({ request }) => {
    const api = new PaymentApi(request);
    const idempotencyKey = `qa-${randomUUID()}`;
    const payload = {
      amount: 5_005,
      payment_method: 'pm_card_visa',
      idempotency_key: idempotencyKey,
    };

    const first = await expectJson<CreatedPayment>(await api.create(payload), 201);
    const retry = await expectJson<CreatedPayment>(await api.create(payload), 201);

    expectSchema('createdPayment', first);
    expectSchema('createdPayment', retry);
    expect.soft(retry.id).toBe(first.id);
    expect(retry.stripe_pi_id).toBe(first.stripe_pi_id);
    expect(retry.idempotency_key).toBe(idempotencyKey);
  });

  test('captures a manually authorized payment in full', async ({ request }) => {
    const api = new PaymentApi(request);
    const authorized = await createSuccessfulPayment(api, {
      amount: 6_000,
      capture_method: 'manual',
    });
    expect(authorized.status).toBe('requires_capture');

    const captured = await expectJson<CapturedPayment>(await api.capture(authorized.id), 200);
    expectSchema('capturedPayment', captured);
    expect(captured).toMatchObject({ status: 'succeeded', amount: 6_000, captured_amount: 6_000 });
  });

  test('rejects capture after a payment has already been captured', async ({ request }) => {
    const api = new PaymentApi(request);
    const authorized = await createSuccessfulPayment(api, {
      amount: 6_001,
      capture_method: 'manual',
    });
    const captured = await expectJson<CapturedPayment>(await api.capture(authorized.id), 200);
    expectSchema('capturedPayment', captured);

    await expectApiError(await api.capture(authorized.id), 400, 'invalid_state');
  });

  test('supports partial capture and releases the remainder', async ({ request }) => {
    const api = new PaymentApi(request);
    const authorized = await createSuccessfulPayment(api, {
      amount: 6_002,
      capture_method: 'manual',
    });

    const captured = await expectJson<CapturedPayment>(await api.capture(authorized.id, { amount: 4_000 }), 200);
    expectSchema('capturedPayment', captured);
    expect(captured).toMatchObject({ status: 'succeeded', amount: 4_000, captured_amount: 4_000 });
  });

  test('does not change an authorization when capture exceeds the authorized amount', async ({ request }) => {
    const api = new PaymentApi(request);
    const authorized = await createSuccessfulPayment(api, {
      amount: 6_003,
      capture_method: 'manual',
    });

    const response = await api.capture(authorized.id, { amount: 6_004 });
    expect.soft(response.status()).toBe(400);
    if (response.status() === 200) {
      const unexpectedCapture = await expectJson<CapturedPayment>(response, 200);
      expectSchema('capturedPayment', unexpectedCapture);
    } else {
      const error = await expectJson<ApiError>(response, 400);
      expectSchema('error', error);
    }
    const stored = await expectJson<Payment>(await api.get(authorized.id), 200);
    expectSchema('payment', stored);
    expect(stored.status).toBe('requires_capture');
    expect(stored.amount).toBe(6_003);
  });

  test('refunds a captured payment in full', async ({ request }) => {
    const api = new PaymentApi(request);
    const payment = await createSuccessfulPayment(api, { amount: 7_000 });

    const refund = await expectJson<Refund>(
      await api.refund(payment.id, { reason: 'Automated full-refund check' }),
      200,
    );
    expectSchema('refund', refund);
    expect(refund).toMatchObject({ payment_id: payment.id, amount: 7_000, status: 'succeeded' });

    const stored = await expectJson<Payment>(await api.get(payment.id), 200);
    expectSchema('payment', stored);
    expect(stored.status).toBe('refunded');
  });

  test('allows partial refunds but prevents refunding more than the remaining balance', async ({ request }) => {
    const api = new PaymentApi(request);
    const payment = await createSuccessfulPayment(api, { amount: 7_001 });

    const partial = await expectJson<Refund>(await api.refund(payment.id, { amount: 2_000 }), 200);
    expectSchema('refund', partial);
    expect(partial.amount).toBe(2_000);

    const afterPartial = await expectJson<Payment>(await api.get(payment.id), 200);
    expectSchema('payment', afterPartial);
    expect.soft(afterPartial.status).toBe('succeeded');

    const overRefund = await expectJson<ApiError>(await api.refund(payment.id, { amount: 5_002 }), 400);
    expectSchema('error', overRefund);

    const remainingResponse = await api.refund(payment.id, { amount: 5_001 });
    expect.soft(remainingResponse.status()).toBe(200);
    if (remainingResponse.status() === 200) {
      const remaining = await expectJson<Refund>(remainingResponse, 200);
      expectSchema('refund', remaining);
      expect(remaining.amount).toBe(5_001);
    } else {
      const error = await expectJson<ApiError>(remainingResponse, 400);
      expectSchema('error', error);
    }
    const fullyRefunded = await expectJson<Payment>(await api.get(payment.id), 200);
    expectSchema('payment', fullyRefunded);
    expect(fullyRefunded.status).toBe('refunded');
  });

  test('rejects refunding an authorization that has not been captured', async ({ request }) => {
    const api = new PaymentApi(request);
    const authorized = await createSuccessfulPayment(api, {
      amount: 7_002,
      capture_method: 'manual',
    });

    await expectApiError(await api.refund(authorized.id), 400, 'invalid_state');
  });
});
