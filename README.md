# Merchant Payment Service QA

Playwright and TypeScript tests for the Docker-based Merchant Payment Service. The tests treat the service as a black box and use [`course-project/API.md`](course-project/API.md) and [`course-project/openapi.yaml`](course-project/openapi.yaml) as the contract.

## Test coverage

- 24 core API tests for health, configuration, listing, validation, error handling, and webhooks.
- 16 Stripe test-mode API tests for successful and declined payments, 3D Secure, idempotency, capture, and refunds.
- 2 browser tests for successful checkout and card-decline handling.
- 10 strict JSON Schemas for response validation.
- Page Objects for the checkout, success, and payments pages.

The current suite contains 42 tests. The latest full run against a retained database finished with 30 passed and 12 failed. The strict response contracts surface the same `client_secret` leak across each affected list, retrieval, capture, and post-refund response. The failures still map to four application defects. See [`test-results.md`](test-results.md) for the execution details and [`bug-reports/`](bug-reports/) for the defect reports.

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
- A Stripe Secret key (`SK Test`) beginning with `sk_test_`, provided separately by the project owner.
- A Stripe Publishable key (`PK Test`) beginning with `pk_test_`, provided separately by the project owner.

## Stripe test keys

The project owner will send the `SK Test` and `PK Test` values directly to the person checking the course project. The keys are not stored in this repository.

Add the provided keys before you start Docker or run the Stripe-backed tests:

1. Copy `course-project/.env.example` to `course-project/.env` as shown in the setup instructions below.
2. Open `course-project/.env`.
3. Paste the provided **Secret key** (`SK Test`) and **Publishable key** (`PK Test`) in place of the placeholder values:

```dotenv
STRIPE_SECRET_KEY=sk_test_YOUR_SECRET_KEY
STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_PUBLISHABLE_KEY
```

Do not continue while either value still contains placeholder text such as `YOUR_KEY_HERE`. Docker passes these values to the Merchant Payment Service when the API container starts. If you change a key after starting Docker, restart the containers so the service receives the new value.

Keep `course-project/.env` on your computer. Git ignores this file, and you must not commit or share your keys.

## Setup

Choose the instructions for your operating system. Run all commands from the repository root.

### Windows - PowerShell

```powershell
npm ci
npx playwright install chromium
Copy-Item course-project/.env.example course-project/.env
```

Confirm that `course-project/.env` contains your `SK Test` and `PK Test` values. Then start the service:

```powershell
docker compose --env-file course-project/.env --file course-project/docker-compose.yml up -d
docker compose --env-file course-project/.env --file course-project/docker-compose.yml ps
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

### macOS - Terminal

```bash
npm ci
npx playwright install chromium
cp course-project/.env.example course-project/.env
```

Confirm that `course-project/.env` contains your `SK Test` and `PK Test` values. Then start the service:

```bash
docker compose --env-file course-project/.env --file course-project/docker-compose.yml up -d
docker compose --env-file course-project/.env --file course-project/docker-compose.yml ps
curl http://127.0.0.1:3000/api/health
```

The health response should contain `"status":"ok"` and `"db":"connected"`. Open the checkout page at `http://localhost:3000/checkout`.

## Run the tests

Type-check the Playwright project:

```text
npm run typecheck:course
```

Run the 24 tests that do not create Stripe objects:

```text
npm run test:course:ci
```

Run the API contract tests. Without `RUN_STRIPE_TESTS=true`, Playwright runs the 24 credential-free contract tests and skips the 16 Stripe-backed contract tests:

```text
npm run test:course:contract
```

Run all 42 API and browser tests with Stripe test mode enabled:

Windows PowerShell:

```powershell
$env:RUN_STRIPE_TESTS = 'true'
npm run test:course
```

macOS Terminal:

```bash
export RUN_STRIPE_TESTS=true
npm run test:course
```

The full suite returns a non-zero exit code while the confirmed service defects remain open. Do not weaken those assertions to obtain a green result.

Open the HTML report:

```text
npm run test:course:report
```

Set `COURSE_API_BASE_URL` if the service uses a URL other than `http://127.0.0.1:3000`:

```powershell
# Windows PowerShell
$env:COURSE_API_BASE_URL = 'http://127.0.0.1:3001'
```

```bash
# macOS Terminal
export COURSE_API_BASE_URL=http://127.0.0.1:3001
```

## Confirmed defects

The test run confirmed four service defects:

- Payment responses expose Stripe `client_secret` values outside payment creation.
- Retrying with one idempotency key creates duplicate payments.
- A capture request above the authorized amount succeeds.
- A partial refund marks the payment fully refunded and blocks the remaining refund.

The fifth report covers a contradiction in the documented error type for malformed webhook JSON. Each report includes a summary, severity, pre-conditions, steps to reproduce, expected result, actual result, evidence, and severity justification.

## Continuous integration

GitHub Actions runs TypeScript validation and the 24 credential-free API tests on pushes and pull requests. Stripe-backed tests stay out of CI because the workflow has no Stripe account credentials.

## Stop the service

```powershell
docker compose --env-file course-project/.env --file course-project/docker-compose.yml down
```

This command keeps the PostgreSQL volume. Use `down -v` only when you want to delete the local payment data.

For a step-by-step handoff, troubleshooting notes, and sign-off checks, see [`RUNBOOK.md`](RUNBOOK.md).
