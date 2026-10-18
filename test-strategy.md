# Merchant Payment Service Test Strategy

## What We Test and Why

The test suite covers the public REST API first because it is the stable boundary for payment creation, retrieval, capture, refunds, webhooks, and service health. Browser tests cover the customer checkout path and payment history as a smaller end-to-end layer. The service is treated as a black box: expected behavior comes from `course-project/API.md` and `course-project/openapi.yaml`, while internal implementation details are not assumed.

Financial state transitions receive the highest priority. The main paths are automatic card payment, manual authorization and capture, full and partial refunds, card declines, 3D Secure initiation, retrieval, pagination, webhook input validation, and payment idempotency. Validation tests run without valid Stripe credentials; operations that create financial objects are explicitly tagged `@stripe` and require Stripe test-mode keys.

## Types of Testing

- **API testing:** Playwright's `APIRequestContext` verifies status codes, response bodies, validation rules, pagination, filtering, and payment state transitions.
- **Negative testing:** Invalid bodies, amounts, currencies, capture methods, identifiers, malformed JSON, invalid operation state, declines, over-capture, and over-refund scenarios verify safe rejection.
- **Integration testing:** The `@stripe` suite exercises the black-box service, PostgreSQL-backed state, and Stripe test mode together. It is not reported as mocked coverage.
- **Contract testing:** Reusable JSON Schemas derived from the local OpenAPI file validate health, payment, list, capture, refund, and error responses.
- **End-to-end testing:** Playwright Page Objects automate the documented checkout and payment-history UI using `data-testid` selectors plus Stripe's hosted card frame.
- **CI testing:** GitHub Actions starts the local Docker stack with non-secret placeholder test keys and runs credential-free API checks on every push and pull request. Stripe-backed tests remain a deliberate local/manual CI extension because this repository's version `1.0` package has no documented WireMock override.

## Risk Coverage

| Risk | Coverage |
|---|---|
| Duplicate charging | A repeated create request with the same documented idempotency key must return the same service and Stripe IDs. |
| Incorrect amounts | Creation, partial capture, full refund, partial refund, and remaining-balance assertions check cent values. Zero, negative, fractional, string, below-minimum, over-capture, and over-refund inputs are rejected where applicable. |
| Failed payment handling | Generic decline and insufficient-funds responses must return HTTP 402 with Stripe card error details. |
| Incorrect capture | Manual authorization, full capture, partial capture, repeated capture, and capture above the authorization are covered. |
| Incorrect or duplicate refunds | Full and partial refunds, refunding an uncaptured authorization, and exceeding the remaining refundable balance are covered. The API documents no refund idempotency key, so retry safety remains an explicit residual risk. |
| Webhook problems | Malformed and missing-type events are rejected; a correctly signed unsupported event is accepted without invoking a payment transition. Database-level duplicate-delivery verification remains pending. |
| Inconsistent status | Payment retrieval after create, capture, partial refund, and full refund verifies documented status transitions. |
| Contract violations | AJV validates reusable schemas against representative success and error responses. |

## Out of Scope

Real-money or production Stripe processing, exhaustive PCI/security testing, destructive database reset testing, high-volume performance testing, browser automation of 3D Secure challenges, and backend unit testing are out of scope. The backend source is unavailable. Direct Stripe Dashboard reconciliation and database-level webhook deduplication were not executed and remain follow-up risks rather than claimed coverage.
