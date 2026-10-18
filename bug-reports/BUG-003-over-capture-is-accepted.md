# BUG-003 — Capture above the authorized amount is accepted

**Summary:** A manual payment can be captured by requesting more than its authorized amount; the endpoint returns success and changes the authorization to `succeeded`.

**Severity:** High

**Preconditions:**

- Merchant Payment Service 1.0 is running with valid Stripe test-mode credentials.
- A manual-capture payment for 6,003 cents exists in `requires_capture` status.

**Steps to Reproduce:**

1. Create a payment with `amount: 6003`, `payment_method: "pm_card_visa"`, and `capture_method: "manual"`.
2. Verify that its status is `requires_capture`.
3. Send `POST /api/payments/{id}/capture` with `{"amount":6004}`.
4. Retrieve the payment with `GET /api/payments/{id}`.

**Expected Result:** The capture request returns HTTP 400 and leaves the payment in `requires_capture` with amount 6,003 cents. The contract explicitly says the capture amount may not exceed the authorized amount.

**Actual Result:** The capture request returns HTTP 200. The persisted payment changes to `succeeded`; its amount remains 6,003 cents, indicating that the invalid requested amount was not honored but the authorization was captured anyway.

**Evidence:** The automated over-capture test observed HTTP 200 instead of 400 and `succeeded` instead of `requires_capture` after retrieval.

**Severity Justification:** An invalid financial instruction causes an irreversible state transition instead of a safe rejection. Clients cannot rely on validation and may capture funds after presenting an amount the API contract forbids.
