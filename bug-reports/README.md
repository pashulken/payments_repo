# Confirmed Defects

The following defects were reproduced against `ghcr.io/yyushchenko/merchant-api:1.0` on 17 October 2026 with Stripe test-mode credentials.

| ID | Severity | Summary | Automated coverage |
|---|---|---|---|
| [BUG-001](BUG-001-client-secret-returned-by-get-payment.md) | High | Payment read endpoints expose `client_secret` | `core.spec.ts` list contract and `stripe.spec.ts` persistence |
| [BUG-002](BUG-002-idempotency-key-creates-duplicate-payments.md) | High | Retrying with one idempotency key creates duplicate payments | `stripe.spec.ts` - idempotency retry |
| [BUG-003](BUG-003-over-capture-is-accepted.md) | High | Capture above the authorized amount succeeds | `stripe.spec.ts` - over-capture |
| [BUG-004](BUG-004-partial-refund-marks-payment-fully-refunded.md) | High | Partial refund marks the payment fully refunded | `stripe.spec.ts` - partial and remaining refund |
| [BUG-005](BUG-005-malformed-webhook-error-type-is-inconsistent.md) | Low | Webhook error type contradicts the general API error table | `core.spec.ts` - malformed webhook JSON |

All failed assertions remain enabled. No expectation was relaxed to make the suite pass.
