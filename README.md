# Payment Systems Testing — Course Repository

Course materials for QA Automation Engineers.

Lessons and their supporting materials are added incrementally, one at a
time, as we actually get to them in class — so what's in the repo always
runs, instead of being full of half-finished placeholders.

## Structure

```
├── lessons/                        # code, tests, homework, test data — one folder per lesson
│   ├── lesson01-failure-points/    # 4 payment failure zones + unit tests
│   ├── lesson04-wiremock/          # WireMock stubs + integration tests for PspClient
│   ├── lesson06-webhooks/
│   │   └── webhook-template/       # Express + TypeScript webhook handler (separate npm project)
│   ├── lesson08-refunds/           # refund-with-bugs.ts (homework)
│   ├── lesson09-antifraud/         # velocity-buggy.ts (homework)
│   ├── lesson10-security/
│   │   └── test-data/              # logs, API responses, SSL scan with PCI DSS violations to spot
│   ├── lesson11-test-architecture/ # test-buggy.ts (homework)
│   └── lesson12-contracts/         # JSON Schema contract tests for Stripe webhooks
│
├── demo-scripts/                   # in-class demos: curl scripts + Postman collections
│
├── .github/workflows/              # CI: unit, contract, WireMock integration, live contract tests
├── .env.example                    # copy to .env and fill in your keys
└── README.md
```

## Lessons

| # | Topic | Code / homework | Demo |
|---|---|---|---|
| 1 | Failure points | `lessons/lesson01-failure-points/` | — |
| 2 | Stripe API | — | `demo-scripts/lesson02-stripe-api.postman_collection.json` |
| 4 | WireMock | `lessons/lesson04-wiremock/` | `demo-scripts/lesson04-wiremock-stubs.sh` |
| 5 | Partial capture, alternative payment methods | — | `demo-scripts/lesson05-partial-capture.sh`<br>`demo-scripts/lesson05-alternative-payment-methods.sh` |
| 6 | Webhooks | `lessons/lesson06-webhooks/webhook-template/` | `demo-scripts/lesson06-webhook-setup.sh` |
| 7 | 3D Secure | — | `demo-scripts/lesson07-3ds.postman_collection.json` |
| 8 | Refunds | `lessons/lesson08-refunds/` | — |
| 9 | Antifraud | `lessons/lesson09-antifraud/` | `demo-scripts/lesson09-antifraud.postman_collection.json` |
| 10 | Security / PCI DSS | `lessons/lesson10-security/test-data/` | — |
| 11 | Test architecture | `lessons/lesson11-test-architecture/` | — |
| 12 | Contract testing | `lessons/lesson12-contracts/` | — |

## Getting started

```bash
# Clone the repo
git clone <url>
cd payment-testing-course

# Node 20+ (see .nvmrc)
nvm use

# Install dependencies
npm install

# Keys for the tests — .env is gitignored, never commit real keys
cp .env.example .env
# then edit .env: STRIPE_TEST_KEY=sk_test_..., WIREMOCK_URL=http://localhost:8080

# Key for the curl demo scripts
export STRIPE_KEY=sk_test_YOUR_KEY
```

## Running tests

Test type is defined by the file name suffix:

| Command | Files | Needs |
|---|---|---|
| `npm run test:unit` | `*.unit.test.ts` | nothing |
| `npm run test:contract` | `*.contract.test.ts` | nothing |
| `npm run test:integration` | `*.integration.test.ts` | WireMock + `WIREMOCK_URL` |
| `npm run test:contract:live` | `*.contract-live.test.ts` | `STRIPE_TEST_KEY` (real Stripe test mode) |
| `npm test` | all of the above | — |

Suites that need `WIREMOCK_URL` or `STRIPE_TEST_KEY` are **skipped** when the variable is not set.

Start WireMock for integration tests:

```bash
docker run -d --name wiremock -p 8080:8080 wiremock/wiremock:3.3.1
```

The webhook template is a separate project with its own dependencies:

```bash
cd lessons/lesson06-webhooks/webhook-template
npm install
npm test
```

## Stripe test cards

| Card | Scenario |
|------|----------|
| `pm_card_visa` | Successful payment |
| `pm_card_chargeDeclined` | Decline |
| `pm_card_chargeDeclinedInsufficientFunds` | Insufficient funds |
| `pm_card_threeDSecureOptional` | 3DS frictionless |
| `pm_card_threeDSecure2Required` | 3DS challenge |
| `pm_card_radarBlock` | Stripe Radar block |
| `pm_card_riskLevelHighest` | High risk score |

## Code homework

### Lesson 6 — `lessons/lesson06-webhooks/webhook-template/`
Implement a webhook handler with signature verification and idempotent processing.

### Lesson 8 — `lessons/lesson08-refunds/refund-with-bugs.ts`
A refund function with intentional bugs. Find them, write tests and fix them.

### Lesson 9 — `lessons/lesson09-antifraud/velocity-buggy.ts`
Find at least 4 problems in the `checkVelocity` function. Write tests and fix them.

### Lesson 10 — `lessons/lesson10-security/test-data/`
Find the PCI DSS violations in the logs, API responses and SSL scan result.

### Lesson 11 — `lessons/lesson11-test-architecture/test-buggy.ts`
Find at least 5 architectural problems in the test file. Refactor it.

> Homework files are **intentionally broken** — TypeScript errors in them are expected.

## Roadmap (planned, not added yet)

- `lessons/lesson13-reconciliation/test-data/` — CSVs for a reconciliation exercise

## Course project

By the end of the course you'll get a demo service with intentional bugs
(Docker Compose). The task: find the bugs, write tests, and prepare bug
reports.

## Merchant Payment Service QA project

The course-project automation is implemented with Playwright Test and TypeScript under `tests/`.
It contains credential-free API validation, Stripe sandbox payment flows, JSON Schema contract
checks, and a small Page Object Model browser suite.

### Install and start

```powershell
npm ci
Copy-Item course-project/.env.example course-project/.env
# Add Stripe TEST keys to course-project/.env, then:
docker compose --file course-project/docker-compose.yml up -d
```

Only `sk_test_...` and `pk_test_...` credentials are suitable. The `.env` file is ignored and
must never be committed. Check availability at `http://localhost:3000/api/health`.

### Run tests

```powershell
# Credential-free API checks; suitable for placeholder keys and CI
npm run test:course:ci

# Full API suite against Stripe test mode
$env:RUN_STRIPE_TESTS = 'true'
npm run test:course:api

# Browser tests (install Chromium once, then use Stripe test mode)
npx playwright install chromium
npm run test:course:e2e

# Type-check and open the most recent HTML report
npm run typecheck:course
npm run test:course:report
```

Set `COURSE_API_BASE_URL` to override `http://127.0.0.1:3000`. Financial tests are tagged
`@stripe`; the local `course-project` version `1.0` has no documented WireMock routing option,
so they are never represented as mocked Stripe coverage. CI runs the credential-free API suite
on every push and pull request and uploads the Playwright report.

Project evidence and scope are documented in `test-strategy.md`, `test-results.md`, and
`bug-reports/`. A step-by-step runner handoff is available in `RUNBOOK.md`.
