# BUG-005 — Malformed webhook error type is inconsistent in the API documentation

**Summary:** The general API error table classifies malformed JSON as `invalid_request`, while the webhook endpoint table classifies the same malformed body as `validation_error`.

**Severity:** Low

**Preconditions:** Access to the supplied `course-project/API.md` contract.

**Steps to Reproduce:**

1. Read the common error table in `API.md`.
2. Note that malformed JSON is documented as HTTP 400 `invalid_request`.
3. Read the response table for `POST /api/webhooks`.
4. Note that `Invalid JSON body` is documented as HTTP 400 `validation_error`.
5. Send a correctly signed malformed JSON payload such as `{bad` to `/api/webhooks`.

**Expected Result:** One unambiguous error type is documented consistently for malformed webhook JSON.

**Actual Result:** The two contract sections disagree. The running service follows the endpoint-specific table and returns `validation_error`.

**Evidence:** `API.md` common errors and `POST /api/webhooks` responses contain the conflicting classifications; the automated webhook test confirms the runtime response.

**Severity Justification:** No payment state is corrupted, but consumers and automated contract tests can implement the wrong expectation. The endpoint-specific behavior can be inferred, so the impact is limited to integration clarity and maintenance.
