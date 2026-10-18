# BUG-004 — Partial refund marks payment fully refunded

**Summary:** A successful partial refund immediately changes the payment status to `refunded`, preventing refund of the remaining paid balance.

**Severity:** High

**Preconditions:**

- Merchant Payment Service 1.0 is running with valid Stripe test-mode credentials.
- A captured payment for 7,001 cents exists in `succeeded` status.

**Steps to Reproduce:**

1. Refund 2,000 cents with `POST /api/payments/{id}/refund`.
2. Confirm the refund response is HTTP 200 and its amount is 2,000 cents.
3. Retrieve the payment.
4. Attempt to refund the remaining 5,001 cents.

**Expected Result:** After step 3 the payment remains `succeeded`, because only 2,000 of 7,001 cents has been refunded. Step 4 succeeds, after which the payment becomes `refunded`.

**Actual Result:** After the first partial refund, the payment is already `refunded`. The remaining refund returns HTTP 400 `invalid_state` with `Payment cannot be refunded (status: refunded)`.

**Evidence:** The automated partial-refund test received a valid 2,000-cent refund, then observed `refunded` instead of `succeeded`; a subsequent refund of the exact 5,001-cent balance was rejected.

**Severity Justification:** The service records an incorrect financial state and blocks return of the remaining customer funds through the documented API. This creates customer-support, reconciliation, and regulatory risk.
