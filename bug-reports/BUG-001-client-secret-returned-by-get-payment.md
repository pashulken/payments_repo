# BUG-001 - Payment read endpoints expose `client_secret`

**Summary:** `GET /api/payments/{id}` and `GET /api/payments` expose the Stripe PaymentIntent `client_secret`. The contract allows this field only in the payment-creation response.

**Severity:** High

**Pre-conditions:**

- Merchant Payment Service 1.0 is running with valid Stripe test-mode credentials.
- A successful payment exists.

**Steps to Reproduce:**

1. Send `POST /api/payments` with `amount: 5001`, `payment_method: "pm_card_visa"`, and `currency: "usd"`.
2. Record the returned payment `id`.
3. Send `GET /api/payments/{id}`.
4. Inspect the response properties.
5. Send `GET /api/payments` and inspect the matching item in `payments`.

**Expected Result:** Read responses match the `Payment` contract and do not contain `client_secret`. `API.md` and `openapi.yaml` allow this field only in the payment-creation response.

**Actual Result:** Both endpoints return HTTP 200 with a populated `client_secret` property.

**Severity Justification:** The checkout client uses this credential to complete payment operations. Returning it from read endpoints violates the response contract and exposes it to anyone who can read payment data. The list endpoint exposes a secret for each returned payment.
