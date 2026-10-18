# BUG-001 - Payment responses expose `client_secret` outside creation

**Summary:** Payment retrieval, listing, and capture responses expose the Stripe PaymentIntent `client_secret`. The contract allows this field only in the payment-creation response.

**Severity:** High

**Pre-conditions:**

- Merchant Payment Service 1.0 is running with valid Stripe test-mode credentials.
- A successful payment exists.

**Steps to Reproduce:**

1. Create a successful automatic payment and record its `id`.
2. Send `GET /api/payments/{id}` and inspect the response properties.
3. Send `GET /api/payments` and inspect the matching item in `payments`.
4. Create a manual-capture payment and record its `id`.
5. Send `POST /api/payments/{id}/capture` and inspect the response properties.

**Expected Result:** Retrieval, listing, and capture responses match their documented contracts and do not contain `client_secret`. `API.md` and `openapi.yaml` allow this field only in the payment-creation response.

**Actual Result:** Retrieval, listing, and capture responses return HTTP 200 with a populated `client_secret` property.

**Severity Justification:** The checkout client uses this credential to complete payment operations. Returning it after payment creation violates the response contract and exposes it through several API operations. The list endpoint exposes a secret for each returned payment.
