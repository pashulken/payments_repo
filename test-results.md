# Merchant Payment Service Test Results

**Execution date:** 2026-10-19
**Environment:** Windows, Node.js 24, Docker CLI 29.3.1

## Result

The complete 42-test Playwright suite was executed against the running Docker service with valid Stripe test-mode credentials and a retained PostgreSQL volume. On the final consolidated rerun, 30 tests passed and 12 failed. Strict response schemas now reject undocumented properties, so `BUG-001` fails each list, retrieval, capture, and post-refund response that exposes `client_secret`. The 12 failures still map to four confirmed application defects. Both browser journeys passed; every failing assertion remains enabled.

| Check | Result |
|---|---|
| TypeScript compilation | Passed (`npm run typecheck:course`) |
| JSON Schema compilation | Passed: 10 strict schemas registered and compiled by AJV |
| Playwright test discovery | Passed: 42 tests found in 3 files |
| Stripe test credential check | Passed: read-only Stripe API request returned HTTP 200 |
| Playwright Chromium installation | Passed: Chromium and headless shell installed for Playwright 1.64.1 |
| Docker service health | Passed: API and PostgreSQL containers healthy; `/api/health` returned HTTP 200 with `db: connected` |
| Credential-free API tests | 20 passed, 4 failed on the retained database; all four failures detect `BUG-001` in payment lists |
| Complete API suite | Final consolidated API result: 28 passed, 12 failed out of 40 |
| Stripe sandbox API tests | 8 passed, 8 failed out of 16 |
| Browser E2E tests | Passed: 2/2 |
| GitHub Actions | Passed: Merchant Payment Service QA workflow |

## Confirmed defects

1. `BUG-001`: payment responses expose `client_secret` outside creation.
2. `BUG-002`: an idempotent retry creates duplicate local payments and Stripe PaymentIntents.
3. `BUG-003`: a capture request above the authorized amount returns success and captures the payment.
4. `BUG-004`: a partial refund marks the payment fully refunded and blocks the remaining refund.
5. `BUG-005`: malformed webhook JSON has contradictory error-type documentation.

The four application defects account for 12 failing API tests. `BUG-001` affects 11 of those tests because the service exposes `client_secret` in payment lists, retrievals, capture responses, and payment reads after refunds. The over-capture and partial-refund tests also detect `BUG-003` and `BUG-004`. The fifth report is a documentation defect discovered while classifying the webhook behavior. Detailed reports are indexed in `bug-reports/README.md`.

## Remaining risks

- Stripe Dashboard-to-database reconciliation was not independently performed.
- Duplicate webhook delivery was not verified at the database level.
- The automated browser suite does not complete an interactive 3D Secure challenge.
