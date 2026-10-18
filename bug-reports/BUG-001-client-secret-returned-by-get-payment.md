# BUG-001 — Payment read endpoints expose `client_secret`

**Summary:** `GET /api/payments/{id}` and `GET /api/payments` return the Stripe PaymentIntent `client_secret`, although the contract permits that field only in the payment-creation response.

**Severity:** High

**Preconditions:**

- Merchant Payment Service 1.0 is running with valid Stripe test-mode credentials.
- A successful payment exists.

**Steps to Reproduce:**

1. Send `POST /api/payments` with `amount: 5001`, `payment_method: "pm_card_visa"`, and `currency: "usd"`.
2. Record the returned payment `id`.
3. Send `GET /api/payments/{id}`.
4. Inspect the response properties.
5. Send `GET /api/payments` and inspect the matching item in `payments`.

**Expected Result:** The retrieval response matches the `Payment` contract and does not contain `client_secret`. `API.md` and `openapi.yaml` state that `client_secret` is returned only by payment creation.

**Actual Result:** Both read responses are HTTP 200 and include a populated `client_secret` property.

**Evidence:** The automated tests `creates and persists a successful Visa payment` and `lists payments using documented defaults` failed because the read models contained `client_secret`. The actual values were redacted from this report.

**Severity Justification:** A client secret is a payment-operation credential intended only for the checkout client that initiated the payment. Returning it from general read endpoints expands its exposure and violates the documented response contract. The list endpoint makes the scope especially broad. The issue is high severity because disclosure could permit unintended client-side operations if API responses are exposed.
