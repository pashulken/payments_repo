/**
 * Contract test — JSON Schema validation for Stripe webhook payloads
 *
 * Verifies that webhook payloads match the expected structure.
 * Does NOT test business logic (amounts, statuses) — only shape.
 *
 * Tool: Ajv (https://ajv.js.org/)
 */

import Ajv, { ValidateFunction } from 'ajv';
import webhookSchema from './webhook.schema.json';

describe('Stripe webhook payload contract', () => {
  let ajv: Ajv;
  let validate: ValidateFunction;

  beforeAll(() => {
    ajv = new Ajv({ allErrors: true });
    validate = ajv.compile(webhookSchema);
  });

  // ── Helper: build a valid payload ──────────────────────────

  function validPayload(overrides: Record<string, unknown> = {}) {
    return {
      id: 'evt_1OqDmR2eZvKYlo2C0SuHn0pX',
      object: 'event',
      type: 'payment_intent.succeeded',
      created: 1709280000,
      livemode: false,
      api_version: '2024-06-20',
      data: {
        object: {
          id: 'pi_3OqDmR2eZvKYlo2C0abc1234',
          object: 'payment_intent',
          status: 'succeeded',
          amount: 15000,
          currency: 'usd',
          payment_method: 'pm_card_visa',
          metadata: {},
        },
      },
      ...overrides,
    };
  }

  // ── Happy path ─────────────────────────────────────────────

  test('valid payload passes schema validation', () => {
    const payload = validPayload();
    const valid = validate(payload);

    expect(valid).toBe(true);
    expect(validate.errors).toBeNull();
  });

  test('payload with extra fields still passes (additionalProperties: true)', () => {
    const payload = validPayload({
      pending_webhooks: 1,
      request: { id: 'req_abc', idempotency_key: null },
    });
    const valid = validate(payload);

    // Stripe may add new fields at any time — schema should not break
    expect(valid).toBe(true);
  });

  // ── Missing required fields ────────────────────────────────

  test('FAILS when top-level "id" is missing', () => {
    const payload = validPayload();
    delete (payload as Record<string, unknown>).id;

    const valid = validate(payload);

    expect(valid).toBe(false);
    expect(validate.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyword: 'required',
          params: { missingProperty: 'id' },
        }),
      ])
    );
  });

  test('FAILS when "data" is missing', () => {
    const payload = validPayload();
    delete (payload as Record<string, unknown>).data;

    const valid = validate(payload);

    expect(valid).toBe(false);
    expect(validate.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          params: { missingProperty: 'data' },
        }),
      ])
    );
  });

  test('FAILS when nested "data.object.status" is missing', () => {
    const payload = validPayload();
    delete (payload.data.object as Record<string, unknown>).status;

    const valid = validate(payload);

    expect(valid).toBe(false);
    expect(validate.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          params: { missingProperty: 'status' },
        }),
      ])
    );
  });

  test('FAILS when nested "data.object.amount" is missing', () => {
    const payload = validPayload();
    delete (payload.data.object as Record<string, unknown>).amount;

    const valid = validate(payload);

    expect(valid).toBe(false);
    expect(validate.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          params: { missingProperty: 'amount' },
        }),
      ])
    );
  });

  // ── Wrong types ────────────────────────────────────────────

  test('FAILS when "amount" is string instead of integer', () => {
    const payload = validPayload();
    (payload.data.object as Record<string, unknown>).amount = '15000';

    const valid = validate(payload);

    expect(valid).toBe(false);
    expect(validate.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyword: 'type',
          message: 'must be integer',
        }),
      ])
    );
  });

  test('FAILS when "created" is string instead of integer', () => {
    const payload = validPayload();
    (payload as Record<string, unknown>).created = '2024-03-01T10:00:00Z';

    const valid = validate(payload);

    expect(valid).toBe(false);
    expect(validate.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyword: 'type',
          message: 'must be integer',
        }),
      ])
    );
  });

  // ── Pattern violations ─────────────────────────────────────

  test('FAILS when event type is not payment_intent.succeeded', () => {
    const payload = validPayload({ type: 'payment_intent.payment_failed' });

    const valid = validate(payload);

    expect(valid).toBe(false);
    expect(validate.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyword: 'const',
          instancePath: '/type',
        }),
      ])
    );
  });

  test('FAILS when event id does not start with evt_', () => {
    const payload = validPayload({ id: 'wrong_prefix_123' });

    const valid = validate(payload);

    expect(valid).toBe(false);
    expect(validate.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyword: 'pattern',
          instancePath: '/id',
        }),
      ])
    );
  });

  test('FAILS when PaymentIntent id does not start with pi_', () => {
    const payload = validPayload();
    (payload.data.object as Record<string, unknown>).id = 'ch_not_a_pi';

    const valid = validate(payload);

    expect(valid).toBe(false);
    expect(validate.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyword: 'pattern',
          instancePath: '/data/object/id',
        }),
      ])
    );
  });

  test('FAILS when currency is not 3 lowercase letters', () => {
    const payload = validPayload();
    (payload.data.object as Record<string, unknown>).currency = 'USD'; // uppercase

    const valid = validate(payload);

    expect(valid).toBe(false);
    expect(validate.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyword: 'pattern',
          instancePath: '/data/object/currency',
        }),
      ])
    );
  });

  // ── Enum violations ────────────────────────────────────────

  test('FAILS when status has invalid value', () => {
    const payload = validPayload();
    (payload.data.object as Record<string, unknown>).status = 'paid'; // not in enum

    const valid = validate(payload);

    expect(valid).toBe(false);
    expect(validate.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyword: 'enum',
          instancePath: '/data/object/status',
        }),
      ])
    );
  });

  // ── Structural change simulation ───────────────────────────
  // These tests simulate the exact breaking changes from Slide 3

  test('DETECTS renamed field: data.object → data.payment', () => {
    // Simulates: provider renamed data.object to data.payment
    const payload = {
      id: 'evt_123',
      type: 'payment_intent.succeeded',
      created: 1709280000,
      data: {
        payment: {
          // renamed from "object" to "payment"
          id: 'pi_456',
          object: 'payment_intent',
          status: 'succeeded',
          amount: 15000,
          currency: 'usd',
        },
      },
    };

    const valid = validate(payload);

    // data.object is required — its absence is caught
    expect(valid).toBe(false);
    expect(validate.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          params: { missingProperty: 'object' },
        }),
      ])
    );
  });
});
