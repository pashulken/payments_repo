import { randomUUID } from 'node:crypto';
import Stripe from 'stripe';

const stripeKey = process.env.STRIPE_TEST_KEY;
const paymentsApiUrl = process.env.PAYMENTS_API_URL?.replace(/\/$/, '');

const describeWithStripe = stripeKey ? describe : describe.skip;
const describeWithPaymentsApi = paymentsApiUrl ? describe : describe.skip;

const paymentIntentParams = (
  amount: number,
  paymentMethod: string,
  metadata: Stripe.MetadataParam = {}
): Stripe.PaymentIntentCreateParams => ({
  amount,
  currency: 'usd',
  payment_method: paymentMethod,
  confirm: true,
  automatic_payment_methods: {
    enabled: true,
    allow_redirects: 'never',
  },
  metadata: {
    test_run_id: randomUUID(),
    ...metadata,
  },
});

async function refundPaymentIntent(
  stripe: Stripe,
  paymentIntentId: string
): Promise<void> {
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

  if (paymentIntent.status === 'succeeded') {
    await stripe.refunds.create({ payment_intent: paymentIntentId });
  }
}

interface MerchantPayment {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

interface MerchantRefund {
  amount: number;
  payment_id: string;
  status: string;
}

async function requestJson<T>(
  path: string,
  init?: RequestInit,
  expectedStatus = 200
): Promise<T> {
  const response = await fetch(`${paymentsApiUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init?.headers,
    },
  });
  const body = (await response.json()) as T;

  if (response.status !== expectedStatus) {
    throw new Error(
      `Expected HTTP ${expectedStatus}, received ${response.status}: ${JSON.stringify(body)}`
    );
  }

  return body;
}

const createMerchantPayment = (amount: number): Promise<MerchantPayment> =>
  requestJson<MerchantPayment>(
    '/api/payments',
    {
      method: 'POST',
      body: JSON.stringify({
        amount,
        currency: 'usd',
        payment_method: 'pm_card_visa',
        customer_email: `qa+${randomUUID()}@example.com`,
        idempotency_key: `homework-10-${randomUUID()}`,
      }),
    },
    201
  );

const getMerchantPayment = (paymentId: string): Promise<MerchantPayment> =>
  requestJson<MerchantPayment>(`/api/payments/${paymentId}`);

const refundMerchantPayment = (paymentId: string): Promise<MerchantRefund> =>
  requestJson<MerchantRefund>(`/api/payments/${paymentId}/refund`, {
    method: 'POST',
    body: '{}',
  });

async function waitForPaymentStatus(
  paymentId: string,
  expectedStatus: string,
  timeoutMs = 10_000,
  intervalMs = 250
): Promise<MerchantPayment> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const payment = await getMerchantPayment(paymentId);

    if (payment.status === expectedStatus) {
      return payment;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  const payment = await getMerchantPayment(paymentId);
  throw new Error(
    `Payment ${paymentId} did not reach ${expectedStatus}; current status is ${payment.status}`
  );
}

describeWithStripe('Stripe payment integration', () => {
  const stripe = new Stripe(stripeKey!);

  test('creates a succeeded payment', async () => {
    let paymentIntent: Stripe.PaymentIntent | undefined;

    try {
      paymentIntent = await stripe.paymentIntents.create(
        paymentIntentParams(15_000, 'pm_card_visa')
      );

      expect(paymentIntent.status).toBe('succeeded');
      expect(paymentIntent.amount).toBe(15_000);
    } finally {
      if (paymentIntent) await refundPaymentIntent(stripe, paymentIntent.id);
    }
  });

  test('refunds the payment created by the same test', async () => {
    const paymentIntent = await stripe.paymentIntents.create(
      paymentIntentParams(15_000, 'pm_card_visa')
    );

    const refund = await stripe.refunds.create({
      payment_intent: paymentIntent.id,
    });

    expect(refund.status).toBe('succeeded');
    expect(refund.payment_intent).toBe(paymentIntent.id);
  });

  test('creates a customer', async () => {
    const customer = await stripe.customers.create({
      email: `qa+${randomUUID()}@example.com`,
      metadata: { test_run_id: randomUUID() },
    });

    try {
      expect(customer.id).toMatch(/^cus_/);
    } finally {
      await stripe.customers.del(customer.id);
    }
  });

  test('creates a card payment method without raw card data', async () => {
    const customer = await stripe.customers.create({
      metadata: { test_run_id: randomUUID() },
    });

    try {
      const paymentMethod = await stripe.paymentMethods.create({
        type: 'card',
        card: { token: 'tok_visa' },
      });
      await stripe.paymentMethods.attach(paymentMethod.id, {
        customer: customer.id,
      });

      expect(paymentMethod.id).toMatch(/^pm_/);
      expect(paymentMethod.type).toBe('card');
    } finally {
      await stripe.customers.del(customer.id);
    }
  });

  test('creates a succeeded payment for a customer', async () => {
    const customer = await stripe.customers.create({
      email: `qa+${randomUUID()}@example.com`,
      metadata: { test_run_id: randomUUID() },
    });
    let paymentIntent: Stripe.PaymentIntent | undefined;

    try {
      paymentIntent = await stripe.paymentIntents.create({
        ...paymentIntentParams(25_000, 'pm_card_visa'),
        customer: customer.id,
      });

      expect(paymentIntent.status).toBe('succeeded');
      expect(paymentIntent.amount).toBe(25_000);
      expect(paymentIntent.customer).toBe(customer.id);
    } finally {
      if (paymentIntent) await refundPaymentIntent(stripe, paymentIntent.id);
      await stripe.customers.del(customer.id);
    }
  });

  test('returns a card error for a declined payment', async () => {
    await expect(
      stripe.paymentIntents.create(
        paymentIntentParams(15_000, 'pm_card_chargeDeclined')
      )
    ).rejects.toMatchObject({
      type: 'StripeCardError',
      code: 'card_declined',
    });
  });
});

describeWithPaymentsApi('Merchant order integration', () => {
  test('eventually reports a paid order after payment', async () => {
    const payment = await createMerchantPayment(5_000);

    try {
      const paidOrder = await waitForPaymentStatus(payment.id, 'succeeded');

      expect(paidOrder.amount).toBe(5_000);
      expect(paidOrder.currency).toBe('usd');
    } finally {
      const current = await getMerchantPayment(payment.id);
      if (current.status === 'succeeded') {
        await refundMerchantPayment(payment.id);
      }
    }
  });

  test('eventually reports the order as fully refunded', async () => {
    const payment = await createMerchantPayment(25_000);
    const refund = await refundMerchantPayment(payment.id);
    const refundedOrder = await waitForPaymentStatus(payment.id, 'refunded');

    expect(refund.status).toBe('succeeded');
    expect(refund.amount).toBe(25_000);
    expect(refund.payment_id).toBe(payment.id);
    expect(refundedOrder.amount).toBe(25_000);
  });
});
