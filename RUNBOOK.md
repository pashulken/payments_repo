# Merchant Payment Service QA — Execution and Handoff Runbook

This runbook is for the person who will execute, investigate, and sign off the course project. It assumes Windows PowerShell; equivalent shell commands may be used on macOS or Linux.

## 1. Completion target

The repository contains 42 Playwright tests:

- 24 credential-free API tests.
- 16 Stripe test-mode API tests.
- 2 browser E2E tests.

Execution is complete only when the runner has:

1. Started the Docker stack and confirmed the API is healthy.
2. Passed TypeScript validation.
3. Run all 24 credential-free API tests.
4. Run all 16 Stripe API tests with test-mode credentials.
5. Run both browser E2E tests.
6. Investigated every failure instead of weakening assertions.
7. Added a separate report for every confirmed product defect.
8. Updated `test-results.md` with the real counts and environment.
9. Confirmed the GitHub Actions workflow runs after the branch is pushed.

## 2. Prerequisites

- Docker Desktop using Linux containers.
- Node.js 20 or newer and npm.
- A Stripe account in **test mode**.
- Stripe `sk_test_...` and `pk_test_...` keys belonging to the runner.
- Access to the repository root.

Never share Stripe keys through chat, screenshots, commits, test reports, or bug reports. Never use keys beginning with `sk_live_` or `pk_live_`.

## 3. One-time setup

From the repository root:

```powershell
npm ci
npx playwright install chromium
Copy-Item course-project/.env.example course-project/.env
```

Open `course-project/.env` locally and replace the placeholders with Stripe **test-mode** keys. The file is ignored by Git.

Validate the project before starting the service:

```powershell
npm run typecheck:course
npx playwright test --list
docker compose --file course-project/docker-compose.yml config --quiet
```

Expected result: TypeScript succeeds, 42 tests are listed, and Compose reports no configuration error.

The API suites validate responses against 10 strict JSON Schemas. Run them directly with:

```powershell
npm run test:course:contract
```

Set `RUN_STRIPE_TESTS=true` first when the contract run must include Stripe-backed payment, capture, and refund responses.

## 4. Start and verify the application

```powershell
docker compose --file course-project/docker-compose.yml up -d
docker compose --file course-project/docker-compose.yml ps
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

Do not start the tests until the health response contains:

```json
{ "status": "ok", "db": "connected" }
```

If startup fails:

```powershell
docker compose --file course-project/docker-compose.yml logs api
docker compose --file course-project/docker-compose.yml logs db
```

Check that Docker Desktop is running, ports `3000` and `5433` are free, `.env` is in `course-project`, and only test-mode Stripe keys are present.

## 5. Execute in controlled phases

### Phase A — credential-free API suite

```powershell
npm run test:course:ci
```

Expected selection: 24 tests. These cover health, frontend configuration, listing and filtering, validation, invalid identifiers, malformed JSON, and webhook validation.

### Phase B — Stripe sandbox API suite

```powershell
$env:RUN_STRIPE_TESTS = 'true'
npm run test:course:api
```

Expected selection: 40 API tests in total. The additional 16 tests create Stripe test payments and verify success, declines, minimum amounts, 3D Secure initiation, idempotency, capture, and refunds.

Only report these tests as Stripe-tested if the service was started with genuine Stripe test-mode keys.

### Phase C — browser E2E suite

```powershell
$env:RUN_STRIPE_TESTS = 'true'
npm run test:course:e2e
```

Expected selection: 2 tests covering successful checkout/payment history and a declined card message.

### Phase D — report review

```powershell
npm run test:course:report
```

For failures, retain the Playwright trace and screenshot from `test-results/` until investigation is complete. Do not commit generated reports containing sensitive data.

## 6. Failure triage and bug reporting

Classify each failure before changing code:

1. **Environment:** Docker unavailable, invalid test credentials, blocked port, network failure, or missing browser.
2. **Test issue:** selector, test data, schema, or expectation does not match the local documentation.
3. **Product defect:** behavior reproducibly contradicts `course-project/API.md` or `course-project/openapi.yaml`.

For a possible defect:

1. Reproduce it at least twice with fresh test data.
2. Preserve the exact request, status, sanitized response, relevant service logs, and payment ID.
3. Compare the result with the documented requirement.
4. Check the stored payment/refund state when database evidence is relevant.
5. Add `bug-reports/BUG-NNN-short-title.md` using the required summary, severity, pre-conditions, steps to reproduce, expected result, actual result, evidence, and severity justification.

Do not create a bug report for an environment failure, and do not change a documented expectation merely to make a failing test pass.

## 7. Record the final result

Update `test-results.md` with:

- Date, OS, Node version, Docker version, and service image.
- Total tests implemented, executed, passed, failed, and skipped.
- Separate results for credential-free API, Stripe API, and E2E suites.
- A short explanation for every failure or skip.
- Confirmed defect count and links to bug reports.
- Any remaining risks, including webhook duplicate delivery or Stripe Dashboard/database reconciliation not performed.

The sign-off must not say the project passed if any required suite was not executed.

## 8. Verify CI

Push the branch and open the **Merchant Payment Service QA** workflow. Confirm that it:

1. Installs dependencies.
2. Type-checks the Playwright project.
3. Starts the Docker application.
4. Passes the health wait.
5. Runs the 24 credential-free API tests.
6. Uploads the Playwright report.

The current CI workflow intentionally does not claim Stripe sandbox coverage because the local service version has no documented WireMock routing option and repository secrets may not be available.

## 9. Clean shutdown

```powershell
docker compose --file course-project/docker-compose.yml down
```

This retains PostgreSQL data. Use `down -v` only when a fresh database is explicitly required because it permanently deletes the local project volume.

## 10. Handoff evidence checklist

- [ ] `npm run typecheck:course` passed.
- [ ] 24 credential-free API tests executed.
- [ ] 16 Stripe API tests executed with test-mode keys.
- [ ] 2 E2E tests executed headlessly.
- [ ] Failures investigated and classified.
- [ ] Confirmed defects documented individually.
- [ ] `test-results.md` updated with actual results.
- [ ] No `.env`, secrets, database dumps, or sensitive reports staged for commit.
- [ ] GitHub Actions run reviewed.
- [ ] Final repository commands re-run from a clean checkout where practical.
