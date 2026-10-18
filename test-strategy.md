# Merchant Payment Service Test Strategy

## Purpose

This project tests the Merchant Payment Service as a black-box application. The API documentation and OpenAPI specification define the expected behavior. The backend source code is not available.

The test suite focuses on payment operations that can affect customer funds or leave the service in an incorrect state. API tests provide most of the coverage because the REST API is the service's main interface. Browser tests cover the critical customer checkout journey.

The suite contains 42 Playwright tests:

- 24 credential-free API tests.
- 16 Stripe test-mode API tests.
- 2 browser end-to-end tests.

## What We Test and Why

### Service health and configuration

The tests confirm that the API is running, PostgreSQL is connected, and the frontend receives a Stripe test publishable key.

Configuration checks also confirm that the API does not expose a Stripe secret key.

### Payment creation

The suite covers Visa and Mastercard payments, Stripe's minimum amount, card declines, invalid customer data, 3D Secure initiation, and payment idempotency.

Payment creation receives high priority because incorrect behavior can cause duplicate charges, rejected purchases, or inconsistent payment records.

### Payment retrieval and listing

The tests cover individual payment retrieval, payment lists, default pagination, page-size limits, status filtering, result ordering, and response schemas.

Payment responses must return consistent data without exposing `client_secret` outside payment creation.

### Capture

The suite covers manual authorization, full capture, partial capture, repeated capture, and capture above the authorized amount.

Capture tests check that the service moves payments through the correct states and rejects invalid financial instructions.

### Refunds

The tests cover full refunds, partial refunds, the remaining refundable balance, over-refunds, and refund attempts before capture.

Refund testing checks that customers receive the correct amount and that the service stores the correct payment status.

### Webhooks

The suite checks malformed JSON, missing event types, and signed unsupported events. A signed unsupported event must return HTTP 200 with `{ "received": true }`.

The webhook tests cover input handling. They do not prove duplicate-event protection or database-level state handling.

### Browser checkout

The browser suite covers successful checkout, payment-history confirmation, and declined-card messaging.

These tests confirm that the main customer journey works through the UI, API, database, and Stripe test mode.

## Test Types and Why We Selected Them

### API testing

Playwright's `APIRequestContext` checks status codes, response bodies, validation rules, pagination, filtering, and payment state transitions.

API tests provide fast and stable coverage of the service's main interface. They also make it easier to inspect exact requests and responses than browser tests.

### Negative testing

Negative tests send invalid bodies, amounts, currencies, capture methods, identifiers, operation states, and malformed JSON.

Payment services must reject invalid requests without charging a customer or changing financial state. Negative tests confirm the status code, error type, schema, and relevant message.

### Integration testing

The Stripe-tagged tests exercise the Merchant Payment Service, PostgreSQL-backed state, and Stripe test mode together.

These tests cover behavior that isolated mocks cannot prove, including Stripe decline codes, PaymentIntent creation, capture, refunds, and stored payment state.

### Contract testing

AJV validates API responses against 10 reusable JSON Schemas derived from the supplied OpenAPI specification.

The schemas reject missing fields, undocumented fields, incorrect data types, and response-shape changes. Contract assertions remain soft so each test can continue checking the related payment behavior after reporting a structure violation.

### End-to-end testing

Playwright Page Objects automate the checkout and payment-history pages. The tests use stable `data-testid` selectors and Stripe's hosted card frame.

The browser suite stays small because UI tests take longer and fail for more environmental reasons than API tests. It covers the successful checkout path and the main declined-card path.

### CI testing

GitHub Actions installs dependencies, checks TypeScript, starts the Docker service, waits for the health endpoint, and runs the 24 credential-free API tests.

The CI workflow uses placeholder test keys and does not run Stripe-backed tests. A developer runs the Stripe API and browser tests with valid Stripe test-mode credentials.

## Functional Coverage

Coverage categories overlap because one test can cover more than one type of behavior.

### Happy paths

Fourteen tests cover successful or supported behavior:

- Healthy API and database state.
- Safe checkout configuration.
- Payment listing and status filtering.
- Signed unsupported webhook acknowledgement.
- Successful Visa and Mastercard payments.
- Stripe's minimum payment amount.
- 3D Secure initiation.
- Full and partial capture.
- Full and partial refund.
- Successful browser checkout and payment history.

### Negative scenarios

Twenty-six tests include negative assertions:

- Missing required payment fields.
- Invalid amount types and values.
- Unsupported currency and capture method.
- Malformed payment and webhook JSON.
- Invalid and unknown payment IDs.
- Missing webhook event type.
- Generic decline and insufficient funds.
- Invalid customer email.
- Repeated capture.
- Capture above the authorization.
- Refund above the remaining balance.
- Refund before capture.
- Declined-card handling in the browser.

### Edge cases

Twelve tests focus on boundaries or uncommon states:

- Invalid pagination values.
- Page size above 100.
- Zero, negative, fractional, and string amounts.
- Payment amounts of 49 and 50 cents.
- A payment that requires 3D Secure.
- Partial capture.
- Capture above the authorized amount.
- Partial refund and exact remaining-balance refund.

### Idempotency

One test repeats the same payment request with the same `idempotency_key`.

The test expects both responses to contain the same local payment ID and Stripe PaymentIntent ID. It also checks that the response retains the original idempotency key.

The suite does not cover concurrent requests, reuse of one key with a different payload, service restarts, refund idempotency, capture idempotency, or duplicate webhook delivery.

## Risk Coverage

| Risk | Test coverage |
|---|---|
| Duplicate charging | Repeating a payment request with the same idempotency key must return the original local payment and Stripe PaymentIntent. |
| Sensitive data exposure | Configuration responses must not contain a Stripe secret key. Payment responses must not contain `client_secret` outside creation. |
| Incorrect amounts | Tests cover valid amounts, Stripe's minimum, invalid values, partial capture, full refund, partial refund, over-capture, and over-refund. |
| Failed payment handling | Generic decline and insufficient-funds cards must return HTTP 402 with Stripe card error details. |
| Incorrect capture state | Tests cover manual authorization, full capture, partial capture, repeated capture, and capture above the authorization. |
| Incorrect refund state | Tests cover full refund, partial refund, remaining balance, over-refund, and refund before capture. |
| Incorrect payment status | Retrieval after creation, capture, partial refund, and full refund checks the stored payment status. |
| Webhook input errors | Tests reject malformed JSON and missing event types. A signed unsupported event must receive an acknowledgement. |
| Contract changes | AJV validates health, configuration, payment, list, capture, refund, webhook acknowledgement, and error responses. |
| Checkout failure | Browser tests verify successful payment history and declined-card messaging. |

## Out of Scope

The project does not cover:

- Real-money or production Stripe payments.
- Full PCI compliance or penetration testing.
- Load, stress, and performance testing.
- Destructive database reset testing.
- Backend unit testing because the service source is unavailable.
- Browser completion of an interactive 3D Secure challenge.
- Cross-browser testing beyond the configured Chromium project.
- Mobile and responsive-layout testing.

## Remaining Risks

The following risks remain after the automated test run:

- Concurrent payment requests using the same idempotency key.
- Reuse of one idempotency key with a different request body.
- Idempotency after a service restart.
- Capture and refund retry safety.
- Duplicate webhook delivery.
- Payment-state changes caused by unsupported webhook events.
- Full 3D Secure authentication.
- Stripe Dashboard-to-database reconciliation.
- Database-level webhook verification.
- High-volume behavior and race conditions.
