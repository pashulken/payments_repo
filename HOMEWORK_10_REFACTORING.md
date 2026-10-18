# Homework #10 - Test File Refactoring

## Problem Analysis

### Problem 1

What is wrong: `lessons/lesson11-test-architecture/test-buggy.ts:6` initializes Stripe with a secret directly in source code.

Why it is bad: Anyone with repository access can read the credential, and changing environments requires editing the test. Even a test-mode key must not be committed.

How to fix: Read `STRIPE_TEST_KEY` from the environment and skip the Stripe integration suite when it is absent.

### Problem 2

What is wrong: `test-buggy.ts:8-25` stores a PaymentIntent ID in `globalPaymentId`; the refund test only works after the create-payment test has run.

Why it is bad: The refund test fails by itself, depends on execution order, and is unsafe if tests execute concurrently.

How to fix: Create the payment required by the refund scenario inside that test and keep all identifiers local to the test.

### Problem 3

What is wrong: `test-buggy.ts:37` and `test-buggy.ts:75` use fixed sleeps of 10 and 5 seconds before reading order state.

Why it is bad: A fixed wait wastes time when the update finishes sooner and can still fail when the update takes longer than expected.

How to fix: Poll the specific payment until it reaches the expected status or a bounded timeout expires. Include the last observed status in the timeout error.

### Problem 4

What is wrong: `test-buggy.ts:34`, `test-buggy.ts:39`, and `test-buggy.ts:76` call undefined `createPayment`, `db`, and `orderId` symbols.

Why it is bad: The file does not compile, so the webhook and order assertions cannot run. The intended data relationship is also unclear.

How to fix: Use the documented merchant API through small typed request helpers. Create a payment, retain its returned ID locally, and query that same payment.

### Problem 5

What is wrong: `test-buggy.ts:44-79` combines customer creation, payment-method creation, payment creation, refunding, and order-state verification in one test.

Why it is bad: A failure does not identify which behavior broke, and setup for later assertions is mixed with unrelated assertions.

How to fix: Split the flow into focused customer, payment-method, customer-payment, refund, and merchant-order tests. Each test creates only its own prerequisites.

### Problem 6

What is wrong: The original tests create customers, payment methods, successful payments, and refunds without teardown; the declined-payment test comments on the missing cleanup at `test-buggy.ts:90`.

Why it is bad: Repeated runs pollute Stripe and merchant test data, make failures harder to investigate, and can interfere with later tests.

How to fix: Use `try/finally` in each test. Refund successful payments as compensating cleanup and delete temporary customers. Use unique metadata, emails, and idempotency keys so unavoidable provider records remain identifiable.

### Problem 7

What is wrong: `test-buggy.ts:82-91` awaits a declined payment request but contains no assertion. Stripe rejects that request, so the test fails instead of checking the expected card error.

Why it is bad: The scenario does not verify its stated behavior and treats the expected negative response as an unexpected test failure.

How to fix: Assert that the promise rejects with `StripeCardError` and the `card_declined` code.

### Problem 8

What is wrong: The original name `test-buggy.ts` does not match the repository's Jest pattern `**/*.test.ts` from `jest.config.js:6`.

Why it is bad: `npm test` does not discover the homework file, so broken or stale tests can appear healthy.

How to fix: Rename the file in the same lesson folder to `payment-flow.integration.test.ts`, which also makes its external-service scope explicit.

### Problem 9

What is wrong: `test-buggy.ts:50-54` embeds raw card fields and an expiry year of 2025.

Why it is bad: The expired data makes the success scenario time-dependent. Handling raw card details in server-side tests is unnecessary and normalizes an unsafe payment-data pattern.

How to fix: Use Stripe test tokens or predefined test PaymentMethod IDs. The refactor uses `tok_visa` for payment-method creation and `pm_card_visa` for payment confirmation.

## Refactored Code

The original file was renamed within the same folder to `lessons/lesson11-test-architecture/payment-flow.integration.test.ts` so Jest discovers it.

```ts
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
```

## Test Execution Results

### Static verification

- Command: `npx tsc --noEmit --pretty false`
- Result: completed successfully with no TypeScript errors.

### Refactored test file

- Command: `npx jest --runTestsByPath lessons/lesson11-test-architecture/payment-flow.integration.test.ts --runInBand --verbose --cacheDirectory .tmp-jest`
- Tests discovered: 8
- Tests executed: 0
- Passed: 0
- Failed: 0
- Skipped: 8
- Limitation: `STRIPE_TEST_KEY` and `PAYMENTS_API_URL` were not configured. The suites were deliberately skipped, and no Stripe transaction or merchant API request was made.

### Independent scenario check

- Command: `npx jest --runTestsByPath lessons/lesson11-test-architecture/payment-flow.integration.test.ts --testNamePattern "refunds the payment created" --runInBand --cacheDirectory .tmp-jest`
- Result: the file was discovered successfully, but all 8 tests were skipped at suite level because `STRIPE_TEST_KEY` and `PAYMENTS_API_URL` were absent. No external request was made.

### Parallel-worker check

- Command: `npx jest --runTestsByPath lessons/lesson11-test-architecture/payment-flow.integration.test.ts --maxWorkers=2 --cacheDirectory .tmp-jest`
- Result: the file was discovered successfully with parallel workers enabled; all 8 tests were skipped because the required environment was absent. Parallel execution against live services was not verified.

### Complete repository suite

- Command: `npm test -- --runInBand --cacheDirectory .tmp-jest`
- Tests: 64 total; 47 passed; 0 failed; 17 skipped
- Suites: 6 total; 3 passed; 0 failed; 3 skipped
- Limitation: external-service suites were skipped by their environment guards.

No credential-shaped value remains in the refactored test file. Live success, independent execution against Stripe, merchant cleanup, and real parallel execution require isolated test credentials plus a running merchant API and were not claimed as passed.
