# Merchant Payment Service Test Results

**Execution date:** 2026-10-17  
**Environment:** Windows, Node.js 24, Docker CLI 29.3.1

## Result

The complete 42-test Playwright suite was executed against the running Docker service with valid Stripe test-mode credentials. On the final consolidated rerun, 37 tests passed and 5 failed. The five failures map to four confirmed application defects because `BUG-001` is detected by both individual retrieval and list-contract tests. Both browser journeys passed; every failing assertion remains enabled.

| Check | Result |
|---|---|
| TypeScript compilation | Passed (`npm run typecheck:course`) |
| JSON Schema compilation | Passed: 7 schemas registered and compiled by AJV |
| Playwright test discovery | Passed: 42 tests found in 3 files |
| Stripe test credential check | Passed: read-only Stripe API request returned HTTP 200 |
| Playwright Chromium installation | Passed: Chromium and headless shell installed for Playwright 1.64.1 |
| Docker service health | Passed: API and PostgreSQL containers healthy; `/api/health` returned HTTP 200 with `db: connected` |
| Credential-free API tests | Passed: 24/24 in the dedicated run; 23/24 in the final rerun after defective records existed |
| Complete API suite | Final consolidated API result: 35 passed, 5 failed out of 40 |
| Stripe sandbox API tests | 12 passed, 4 failed out of 16 |
| Browser E2E tests | Passed: 2/2 |
| Existing lesson unit tests | Passed: 34 |
| Existing lesson contract tests | Passed: 14 |
| Existing lesson integration tests | Skipped as designed: 14 (WireMock URL not configured) |

## Confirmed defects

1. `BUG-001`: payment retrieval exposes `client_secret`.
2. `BUG-002`: an idempotent retry creates duplicate local payments and Stripe PaymentIntents.
3. `BUG-003`: a capture request above the authorized amount returns success and captures the payment.
4. `BUG-004`: a partial refund marks the payment fully refunded and blocks the remaining refund.
5. `BUG-005`: malformed webhook JSON has contradictory error-type documentation.

The four application defects account for five failing API tests because `BUG-001` affects both list and single-payment reads. The fifth report is a documentation defect discovered while classifying the webhook behavior. Detailed reports are indexed in `bug-reports/README.md`.

## Remaining risks

- Stripe Dashboard-to-database reconciliation was not independently performed.
- Duplicate webhook delivery was not verified at the database level.
- The automated browser suite does not complete an interactive 3D Secure challenge.
- GitHub Actions cannot be confirmed until the repository is pushed and the workflow runs remotely.
