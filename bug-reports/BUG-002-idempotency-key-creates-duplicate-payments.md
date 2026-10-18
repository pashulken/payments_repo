# BUG-002 - Idempotency retry creates duplicate payments

**Summary:** Sending the same payment request twice with one `idempotency_key` creates two local payments and two Stripe PaymentIntents.

**Severity:** High

**Pre-conditions:**

- Merchant Payment Service 1.0 is running with valid Stripe test-mode credentials.
- Use a new idempotency key that has not been sent before.

**Steps to Reproduce:**

1. Send `POST /api/payments` with `amount: 5005`, `payment_method: "pm_card_visa"`, and a unique `idempotency_key`.
2. Record the response.
3. Repeat the exact request with the same `idempotency_key`.
4. Compare the local `id` and `stripe_pi_id` in both HTTP 201 responses.

**Expected Result:** The retry returns the original payment. Both responses contain the same local `id` and `stripe_pi_id`.

**Actual Result:** The retry returns a different local `id` and `stripe_pi_id`, even though both responses contain the same idempotency key.

**Evidence:** The idempotency test received two UUIDs and two Stripe PaymentIntent IDs for one key. This report omits the identifiers because the mismatch is the relevant evidence.

**Severity Justification:** Payment clients retry requests after timeouts and network errors. Without idempotency at the application and Stripe request layers, one purchase can charge the customer twice and create reconciliation errors.
