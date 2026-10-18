/**
 * Integration test — PspClient against WireMock
 *
 * PspClient (failure-points.ts) talks to a "PSP" over HTTP.
 * WireMock plays the PSP and returns canned responses from ./stubs/.
 *
 * Each scenario lives under its own URL prefix, because PspClient always
 * calls `${baseUrl}/v1/payment_intents`:
 *   /v1/payment_intents           → 200 success
 *   /declined/v1/payment_intents  → 402 card_declined
 *   /timeout/v1/payment_intents   → 200 after a 2s delay
 *   /error/v1/payment_intents     → 503 api_error
 *
 * Requirements:
 *   - WireMock running:  docker run -d --name wiremock -p 8080:8080 wiremock/wiremock:3.3.1
 *   - WIREMOCK_URL environment variable (e.g. http://localhost:8080)
 *
 * Run:
 *   WIREMOCK_URL=http://localhost:8080 npx jest psp-client.integration --no-coverage --verbose
 */

import axios from 'axios';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { PspClient, CardDeclinedError } from '../lesson01-failure-points/failure-points';

// Skip entire suite if WireMock URL is not set
const WIREMOCK_URL = process.env.WIREMOCK_URL;

const describeIfWiremock = WIREMOCK_URL ? describe : describe.skip;

const STUBS_DIR = join(__dirname, 'stubs');

describeIfWiremock('PspClient ↔ WireMock', () => {
  const admin = axios.create({ baseURL: `${WIREMOCK_URL}/__admin` });

  // ── Load stubs from ./stubs/ ────────────────────────────────

  beforeAll(async () => {
    // Start from a clean state — removes old stubs and request history
    await admin.post('/reset');

    for (const file of readdirSync(STUBS_DIR).filter((f) => f.endsWith('.json'))) {
      const stub = JSON.parse(readFileSync(join(STUBS_DIR, file), 'utf8'));
      await admin.post('/mappings', stub);
    }
  });

  beforeEach(async () => {
    // Clear request history so each test only sees its own calls
    await admin.delete('/requests');
  });

  // ── Helper: find what PspClient actually sent to WireMock ───

  async function requestsTo(url: string) {
    const { data } = await admin.post('/requests/find', { method: 'POST', url });
    return data.requests as Array<{ headers: Record<string, string> }>;
  }

  const params = {
    amount: 15000,
    currency: 'usd',
    idempotencyKey: 'charge:order-42',
  };

  // ── Happy path ─────────────────────────────────────────────

  test('returns PaymentIntent on 200', async () => {
    const client = new PspClient(WIREMOCK_URL);

    const pi = await client.createPaymentIntent(params);

    expect(pi).toEqual({
      id: 'pi_mock_001',
      status: 'requires_capture',
      amount: 15000,
      currency: 'usd',
    });
  });

  test('sends Idempotency-Key header', async () => {
    const client = new PspClient(WIREMOCK_URL);

    await client.createPaymentIntent(params);

    const requests = await requestsTo('/v1/payment_intents');
    expect(requests).toHaveLength(1);
    expect(requests[0].headers['Idempotency-Key']).toBe('charge:order-42');
  });

  // ── Decline (402) ──────────────────────────────────────────

  test('throws non-retryable CardDeclinedError on 402 insufficient_funds', async () => {
    const client = new PspClient(`${WIREMOCK_URL}/declined`);

    const error = await client.createPaymentIntent(params).catch((e) => e);

    expect(error).toBeInstanceOf(CardDeclinedError);
    expect(error.errorCode).toBe('card_declined');
    expect(error.declineCode).toBe('insufficient_funds');
    expect(error.canRetry).toBe(false);
  });

  test('does NOT retry a declined card', async () => {
    const client = new PspClient(`${WIREMOCK_URL}/declined`);

    await client.createPaymentIntent(params).catch(() => {});

    const requests = await requestsTo('/declined/v1/payment_intents');
    expect(requests).toHaveLength(1);
  });

  // ── Timeout ────────────────────────────────────────────────

  test(
    'retries on timeout with the SAME Idempotency-Key, then gives up',
    async () => {
      // PspClient logs every timeout — silence it and check it instead
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

      // Client timeout 500ms < stub delay 2000ms → every attempt times out
      const client = new PspClient(`${WIREMOCK_URL}/timeout`, 500, 3);

      await expect(client.createPaymentIntent(params)).rejects.toThrow(
        'PSP unreachable after 3 attempts'
      );

      expect(warn).toHaveBeenCalledTimes(3);
      expect(warn).toHaveBeenLastCalledWith('PSP timeout (attempt 3/3)');
      warn.mockRestore();

      const requests = await requestsTo('/timeout/v1/payment_intents');
      expect(requests).toHaveLength(3);

      // Same key on every attempt — this is what prevents a double charge
      const keys = requests.map((r) => r.headers['Idempotency-Key']);
      expect(new Set(keys)).toEqual(new Set(['charge:order-42']));
    },
    15_000
  );

  // ── Server error (503) ─────────────────────────────────────

  test('throws the HTTP error on 503', async () => {
    const client = new PspClient(`${WIREMOCK_URL}/error`);

    await expect(client.createPaymentIntent(params)).rejects.toMatchObject({
      response: { status: 503 },
    });
  });
});
