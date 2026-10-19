# BUG-004 - Partial refund marks payment fully refunded

**Summary:** A partial refund changes the payment status to `refunded` and blocks a refund of the remaining balance.

**Severity:** High

**Pre-conditions:**

- Merchant Payment Service 1.0 is running with valid Stripe test-mode credentials.
- A captured payment for 7,001 cents exists in `succeeded` status.

**Steps to Reproduce:**

1. Refund 2,000 cents with `POST /api/payments/{id}/refund`.
2. Confirm the refund response is HTTP 200 and its amount is 2,000 cents.
3. Retrieve the payment.
4. Attempt to refund the remaining 5,001 cents.

**Expected Result:** After step 3, the payment remains `succeeded` because 5,001 cents still need to be refunded. Step 4 succeeds and changes the payment to `refunded`.

**Actual Result:** The first partial refund changes the payment to `refunded`. The second refund returns HTTP 400 `invalid_state` with `Payment cannot be refunded (status: refunded)`.

**Evidence:**

- The first refund request for 2,000 cents returns HTTP 200 with `amount: 2000`.
- A follow-up payment retrieval returns `status: "refunded"` while 5,001 cents remain refundable.
- The request for the remaining 5,001 cents returns HTTP 400 with `type: "invalid_state"` and `message: "Payment cannot be refunded (status: refunded)"`. The partial-refund test in `tests/api/stripe.spec.ts` records these assertions.

**Severity Justification:** The service stores the wrong financial state and blocks the documented way to return the remaining customer funds. Support teams must handle the missing refund outside the normal API flow, and reconciliation records will not match the intended refund amount.
