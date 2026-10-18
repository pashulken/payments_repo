# BUG-003 - Capture above the authorized amount is accepted

**Summary:** The capture endpoint accepts an amount above the authorization and changes the payment status to `succeeded`.

**Severity:** High

**Pre-conditions:**

- Merchant Payment Service 1.0 is running with valid Stripe test-mode credentials.
- A manual-capture payment for 6,003 cents exists in `requires_capture` status.

**Steps to Reproduce:**

1. Create a payment with `amount: 6003`, `payment_method: "pm_card_visa"`, and `capture_method: "manual"`.
2. Verify that its status is `requires_capture`.
3. Send `POST /api/payments/{id}/capture` with `{"amount":6004}`.
4. Retrieve the payment with `GET /api/payments/{id}`.

**Expected Result:** The API returns HTTP 400 and leaves the payment in `requires_capture` with an amount of 6,003 cents. The contract does not allow a capture above the authorized amount.

**Actual Result:** The API returns HTTP 200 and changes the payment to `succeeded`. The stored amount remains 6,003 cents, so the service ignores the requested amount but captures the authorization.

**Evidence:** The over-capture test received HTTP 200 instead of 400. A follow-up request returned `succeeded` instead of `requires_capture`.

**Severity Justification:** The service captures funds after receiving an invalid amount. Clients cannot rely on the documented validation, and they cannot restore the authorization after the state change.
