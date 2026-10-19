# BUG-005 - Malformed webhook error type is inconsistent in the API documentation

**Summary:** The common error table classifies malformed JSON as `invalid_request`. The webhook response table calls the same error `validation_error`.

**Severity:** Low

**Pre-conditions:** Access to `course-project/API.md` and a running Merchant Payment Service 1.0 instance.

**Steps to Reproduce:**

1. Read the common error table in `API.md`.
2. Note that malformed JSON is documented as HTTP 400 `invalid_request`.
3. Read the response table for `POST /api/webhooks`.
4. Note that `Invalid JSON body` uses HTTP 400 `validation_error`.
5. Send a malformed JSON payload such as `{bad` with a valid signature to `/api/webhooks`.

**Expected Result:** Both sections document the same error type for malformed webhook JSON.

**Actual Result:** The two sections use different error types. The service follows the webhook response table and returns `validation_error`.

**Evidence:**

- The common error table in `course-project/API.md` assigns `invalid_request` to malformed JSON.
- The `POST /api/webhooks` response table assigns `validation_error` to `Invalid JSON body`.
- Sending `{bad` with a valid webhook signature returns HTTP 400 with `type: "validation_error"` and an invalid JSON message. The malformed-webhook test in `tests/api/core.spec.ts` confirms the service response.

**Severity Justification:** The issue does not change payment data, but API clients and contract tests may use the wrong error type. Teams must inspect both sections or test the service to learn which value it returns.
