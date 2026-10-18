# BUG-002 — Idempotency retry creates duplicate payments

**Summary:** Repeating an identical payment request with the same `idempotency_key` creates a second local payment and a second Stripe PaymentIntent.

**Severity:** High

**Preconditions:**

- Merchant Payment Service 1.0 is running with valid Stripe test-mode credentials.
- Use a new idempotency key that has not been sent before.

**Steps to Reproduce:**

1. Send `POST /api/payments` with `amount: 5005`, `payment_method: "pm_card_visa"`, and a unique `idempotency_key`.
2. Save the response.
3. Repeat the exact request with the same `idempotency_key`.
4. Compare the local `id` and `stripe_pi_id` in both HTTP 201 responses.

**Expected Result:** The retry returns the original payment. Both responses have the same local `id` and the same `stripe_pi_id`; no second payment is created.

**Actual Result:** The retry returns a different local `id` and a different `stripe_pi_id`, while echoing the same idempotency key.

**Evidence:** The automated idempotency test reproduced two distinct UUIDs and two distinct Stripe PaymentIntent IDs for one key. Identifiers are omitted because their difference, not their values, is the relevant evidence.

**Severity Justification:** Network retries are normal in payment systems. Ignoring idempotency at both the application and Stripe request layers can charge a customer twice for one intended purchase, creating direct financial and reconciliation risk.
