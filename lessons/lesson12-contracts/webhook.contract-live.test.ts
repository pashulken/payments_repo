/**
 * LIVE Contract test — validates REAL Stripe API responses against our schema
 *
 * Unlike webhook.contract.test.ts (which tests hardcoded payloads),
 * this test hits the Stripe API in test mode and validates the actual response.
 *
 * If Stripe changes their API structure — this test catches it.
 *
 * Requirements:
 *   - STRIPE_TEST_KEY environment variable (sk_test_...)
 *   - Network access to api.stripe.com
 *
 * Run:
 *   npm run test:contract:live -- --verbose   (reads STRIPE_TEST_KEY from .env)
 */

import Ajv, { ValidateFunction } from 'ajv';
import Stripe from 'stripe';
import webhookSchema from './webhook.schema.json';

// Skip entire suite if no Stripe key — this is an integration-level test
const STRIPE_KEY = process.env.STRIPE_TEST_KEY;

const describeIfStripeKey = STRIPE_KEY ? describe : describe.skip;

describeIfStripeKey('LIVE: Stripe webhook payload contract', () => {
  let stripe: Stripe;
  let validate: ValidateFunction;

  beforeAll(() => {
    const ajv = new Ajv({ allErrors: true });
    validate = ajv.compile(webhookSchema);

    stripe = new Stripe(STRIPE_KEY!);
  });

  // ── Helper: create a succeeded PaymentIntent ────────────────

  async function createSucceededPaymentIntent(): Promise<Stripe.PaymentIntent> {
    // Create and immediately confirm with a test card
    const pi = await stripe.paymentIntents.create({
      amount: 2000,
      currency: 'usd',
      payment_method: 'pm_card_visa',
      confirm: true,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never',
      },
      metadata: {
        test: 'contract-validation',
      },
    });

    return pi;
  }

  // ── Helper: find the event for a PaymentIntent ──────────────

  async function findEventForPaymentIntent(
    piId: string,
    eventType: string,
    maxRetries = 5
  ): Promise<Stripe.Event | null> {
    // Stripe events are eventually consistent — may need a short wait
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const events = await stripe.events.list({
        type: eventType,
        limit: 10,
      });

      const event = events.data.find(
        (e) => (e.data.object as Stripe.PaymentIntent).id === piId
      );

      if (event) return event;

      // Wait before retry (events may take a moment to appear)
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    return null;
  }

  // ── Tests ──────────────────────────────────────────────────

  test(
    'real payment_intent.succeeded event matches our JSON Schema',
    async () => {
      // 1. Create a real succeeded PaymentIntent
      const pi = await createSucceededPaymentIntent();
      expect(pi.status).toBe('succeeded');

      // 2. Fetch the real event from Stripe
      const event = await findEventForPaymentIntent(
        pi.id,
        'payment_intent.succeeded'
      );
      expect(event).not.toBeNull();

      // 3. Validate the REAL event payload against our schema
      // This is the actual contract check —
      // if Stripe changed their API, this line fails
      const rawEvent = JSON.parse(JSON.stringify(event));
      const valid = validate(rawEvent);

      if (!valid) {
        console.error('Schema validation errors:', validate.errors);
        console.error(
          'Event payload (first 500 chars):',
          JSON.stringify(rawEvent).substring(0, 500)
        );
      }

      expect(valid).toBe(true);
    },
    30_000 // 30s timeout — network calls
  );

  test(
    'real PaymentIntent response contains all fields our code depends on',
    async () => {
      // This test checks the PaymentIntent object directly (not the event wrapper)
      // — useful when your code calls stripe.paymentIntents.retrieve()
      const pi = await createSucceededPaymentIntent();

      // Validate that every field our code uses actually exists
      // These are the fields from our schema's "required" list
      expect(pi).toHaveProperty('id');
      expect(pi.id).toMatch(/^pi_/);

      expect(pi).toHaveProperty('object', 'payment_intent');

      expect(pi).toHaveProperty('status');
      expect([
        'requires_payment_method',
        'requires_confirmation',
        'requires_action',
        'processing',
        'requires_capture',
        'canceled',
        'succeeded',
      ]).toContain(pi.status);

      expect(pi).toHaveProperty('amount');
      expect(typeof pi.amount).toBe('number');
      expect(Number.isInteger(pi.amount)).toBe(true);

      expect(pi).toHaveProperty('currency');
      expect(pi.currency).toMatch(/^[a-z]{3}$/);
    },
    15_000
  );

  test(
    'Stripe event wrapper has expected top-level structure',
    async () => {
      // Validate the event envelope (not the nested PaymentIntent)
      const pi = await createSucceededPaymentIntent();

      const event = await findEventForPaymentIntent(
        pi.id,
        'payment_intent.succeeded'
      );
      expect(event).not.toBeNull();

      // Top-level event fields our webhook handler relies on
      expect(event!.id).toMatch(/^evt_/);
      expect(event!.object).toBe('event');
      expect(event!.type).toBe('payment_intent.succeeded');
      expect(typeof event!.created).toBe('number');
      expect(event!.data).toHaveProperty('object');
      expect(event!.data.object).toHaveProperty('id', pi.id);
    },
    30_000
  );
});
