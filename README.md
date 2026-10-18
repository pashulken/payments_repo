# Merchant Payment Service QA

Playwright and TypeScript tests for the Docker-based Merchant Payment Service. The tests treat the service as a black box and use [`course-project/API.md`](course-project/API.md) and [`course-project/openapi.yaml`](course-project/openapi.yaml) as the contract.

## Test coverage

- 24 core API tests for health, configuration, listing, validation, error handling, and webhooks.
- 16 Stripe test-mode API tests for successful and declined payments, 3D Secure, idempotency, capture, and refunds.
- 2 browser tests for successful checkout and card-decline handling.
- 7 JSON Schemas for response validation.
- Page Objects for the checkout, success, and payments pages.

The current suite contains 42 tests. The latest full run finished with 37 passed and 5 failed. Those failures map to four application defects; two tests expose the same `client_secret` leak. See [`test-results.md`](test-results.md) and [`bug-reports/`](bug-reports/) for the evidence.

## Project files

```text
course-project/          Docker Compose service and API documentation
tests/api/               Core and Stripe API tests
tests/e2e/               Browser tests
tests/helpers/           API, contract, type, and webhook helpers
tests/pages/             Playwright Page Objects
tests/schemas/           JSON Schemas
bug-reports/             Confirmed defect reports
.github/workflows/       GitHub Actions workflow
test-strategy.md         Test approach and risk coverage
test-results.md          Latest execution results
RUNBOOK.md               Detailed setup and handoff guide
```

## Requirements

- Docker Desktop using Linux containers.
- Node.js 20 or newer.
- Stripe secret and publishable keys from test mode.

Use keys beginning with `sk_test_` and `pk_test_`. Keep them in `course-project/.env`; Git ignores that file.

## Setup

Run these commands from the repository root in PowerShell:

```powershell
npm ci
npx playwright install chromium
Copy-Item course-project/.env.example course-project/.env
```

Open `course-project/.env` and replace the placeholders with your Stripe test keys. Then start the service:

```powershell
docker compose --env-file course-project/.env --file course-project/docker-compose.yml up -d
docker compose --env-file course-project/.env --file course-project/docker-compose.yml ps
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

The health response should contain `"status":"ok"` and `"db":"connected"`. Open the checkout page at `http://localhost:3000/checkout`.

## Run the tests

Type-check the Playwright project:

```powershell
npm run typecheck:course
```

Run the 24 tests that do not create Stripe objects:

```powershell
npm run test:course:ci
```

Run all 42 API and browser tests with Stripe test mode enabled:

```powershell
$env:RUN_STRIPE_TESTS = 'true'
npm run test:course
```

The full suite returns a non-zero exit code while the confirmed service defects remain open. Do not weaken those assertions to obtain a green result.

Open the HTML report:

```powershell
npm run test:course:report
```

Set `COURSE_API_BASE_URL` if the service uses a URL other than `http://127.0.0.1:3000`.

## Confirmed defects

The test run confirmed four service defects:

- Payment read endpoints expose Stripe `client_secret` values.
- Retrying with one idempotency key creates duplicate payments.
- A capture request above the authorized amount succeeds.
- A partial refund marks the payment fully refunded and blocks the remaining refund.

The fifth report covers a contradiction in the documented error type for malformed webhook JSON. Each report includes reproduction steps, expected and observed results, evidence, and severity reasoning.

## Continuous integration

GitHub Actions runs TypeScript validation and the 24 credential-free API tests on pushes and pull requests. Stripe-backed tests stay out of CI because the workflow has no Stripe account credentials.

## Stop the service

```powershell
docker compose --env-file course-project/.env --file course-project/docker-compose.yml down
```

This command keeps the PostgreSQL volume. Use `down -v` only when you want to delete the local payment data.

For a step-by-step handoff, troubleshooting notes, and sign-off checks, see [`RUNBOOK.md`](RUNBOOK.md).
