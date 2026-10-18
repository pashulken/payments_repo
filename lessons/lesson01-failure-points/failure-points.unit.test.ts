/**
 * Unit tests — pure logic from failure-points.ts
 *
 * No network, no WireMock, no Stripe — runs in milliseconds.
 *
 * Run:
 *   npm run test:unit
 */

import { createHmac } from 'crypto';
import {
  isRetryableDecline,
  verifyWebhookSignature,
  handleWebhookIdempotently,
} from './failure-points';

// ── ZONE 3: decline codes ─────────────────────────────────────

describe('isRetryableDecline', () => {
  test.each(['issuer_unavailable', 'processing_error', 'try_again_later'])(
    '%s → retryable',
    (code) => {
      expect(isRetryableDecline(code)).toBe(true);
    }
  );

  test.each([
    'insufficient_funds',
    'do_not_honor',
    'card_velocity_exceeded',
    'expired_card',
    'invalid_card_number',
    'lost_card',
    'stolen_card',
    'card_not_supported',
  ])('%s → NOT retryable', (code) => {
    expect(isRetryableDecline(code)).toBe(false);
  });

  test('unknown code → NOT retryable (safe default)', () => {
    expect(isRetryableDecline('some_new_code')).toBe(false);
  });
});

// ── ZONE 4: webhook signature ─────────────────────────────────

describe('verifyWebhookSignature', () => {
  const secret = 'whsec_test_secret';
  const payload = JSON.stringify({ id: 'evt_123', type: 'payment_intent.succeeded' });

  // Helper: build a Stripe-Signature header the same way Stripe does
  function sign(body: string, timestamp: number, key = secret): string {
    const hash = createHmac('sha256', key).update(`${timestamp}.${body}`).digest('hex');
    return `t=${timestamp},v1=${hash}`;
  }

  const now = () => Math.floor(Date.now() / 1000);

  test('valid signature → true', () => {
    expect(verifyWebhookSignature(payload, sign(payload, now()), secret)).toBe(true);
  });

  test('signed with a different secret → false', () => {
    expect(verifyWebhookSignature(payload, sign(payload, now(), 'whsec_other'), secret)).toBe(false);
  });

  test('payload changed after signing → false', () => {
    const header = sign(payload, now());
    const tampered = payload.replace('evt_123', 'evt_999');

    expect(verifyWebhookSignature(tampered, header, secret)).toBe(false);
  });

  test('timestamp older than 5 minutes → false (replay attack)', () => {
    // verifyWebhookSignature logs the rejection — silence it and check it instead
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const tenMinutesAgo = now() - 600;

    expect(verifyWebhookSignature(payload, sign(payload, tenMinutesAgo), secret)).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('timestamp is too old'));
    warn.mockRestore();
  });

  test.each(['', 'invalid_sig', 't=123', 'v1=abc'])('malformed header "%s" → false', (header) => {
    expect(verifyWebhookSignature(payload, header, secret)).toBe(false);
  });
});

// ── ZONE 4: idempotent webhook handling ───────────────────────

describe('handleWebhookIdempotently', () => {
  // Minimal in-memory DB that records every status update
  function createDb() {
    const processed = new Set<string>();
    const updates: Array<{ txId: string; status: string }> = [];

    return {
      updates,
      hasProcessedEvent: async (id: string) => processed.has(id),
      markEventProcessed: async (id: string) => {
        processed.add(id);
      },
      updateTransactionStatus: async (txId: string, status: string) => {
        updates.push({ txId, status });
      },
    };
  }

  const event = {
    id: 'evt_123',
    type: 'payment_intent.succeeded',
    data: { object: { id: 'pi_123', status: 'succeeded' as const, amount: 15000 } },
  };

  test('first delivery → processed, status updated', async () => {
    const db = createDb();

    expect(await handleWebhookIdempotently(event, db)).toBe('processed');
    expect(db.updates).toEqual([{ txId: 'pi_123', status: 'succeeded' }]);
  });

  test('same event delivered twice → second is a duplicate, status updated once', async () => {
    // handleWebhookIdempotently logs the skipped duplicate — silence it and check it instead
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const db = createDb();

    await handleWebhookIdempotently(event, db);
    const second = await handleWebhookIdempotently(event, db);

    expect(second).toBe('duplicate');
    expect(db.updates).toHaveLength(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('already processed'));
    log.mockRestore();
  });

  test('unhandled event type → ignored, nothing updated', async () => {
    const db = createDb();

    const result = await handleWebhookIdempotently({ ...event, type: 'charge.refunded' }, db);

    expect(result).toBe('ignored');
    expect(db.updates).toHaveLength(0);
  });
});
