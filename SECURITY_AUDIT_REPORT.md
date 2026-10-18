# Security Audit Report

## Scope and Evidence

This audit covers the supplied one-day application log, API response samples, and SSL Labs scan:

- `lessons/lesson10-security/test-data/application.log`
- `lessons/lesson10-security/test-data/api-responses.json`
- `lessons/lesson10-security/test-data/ssl-scan-result.md`

The assignment refers to `api-responses.md`, but the project contains `api-responses.json`. This report uses the available JSON response sample. Source files were not modified. Sensitive values are redacted in the evidence below.

## Section A - Security Audit Checklist

### 1. Application.log

#### 1.1. Full PAN is not present in logs

Result: FAIL

Comment/Evidence: `application.log` lines 14, 24, 25, and 59 each contain a 16-digit PAN. The card numbers are not copied into this report.

#### 1.2. CVV/CVC values are not present in logs

Result: N/A

Comment/Evidence: The supplied one-day `application.log` file contains no `cvv` or `cvc` fields. This sample cannot confirm that other requests, error paths, or archived logs never contain those values.

#### 1.3. Card expiration dates are not logged in sensitive contexts

Result: FAIL

Comment/Evidence: `application.log` lines 24 and 25 contain expiration dates in DEBUG CSV rows. Each row also contains a full PAN, customer identifier, payment amount, and transaction status.

#### 1.4. Passwords and authentication credentials are not exposed in logs

Result: FAIL

Comment/Evidence: `application.log` line 50 records a Stripe webhook signing secret in a DEBUG message. Anyone with access to the log could use the secret to create webhook signatures. The value is redacted from this report.

#### 1.5. Card masking is implemented correctly where used

Result: FAIL

Comment/Evidence: `application.log` line 31 uses the expected `****9903` format. Lines 14, 24, 25, and 59 contain full PANs, so the service does not apply masking consistently.

### 2. API Responses

#### 2.1. Full PAN is not included in API response bodies

Result: FAIL

Comment/Evidence: Response 3 in `api-responses.json` returns full PANs in `orders[0].card_number`, `orders[1].card_number`, and `orders[2].card_number` on lines 54, 62, and 70. The values are redacted from this report.

#### 2.2. CVV/CVC values are not included in API response bodies

Result: N/A

Comment/Evidence: Responses 1 through 7 in `api-responses.json` contain no `cvv` or `cvc` fields. These examples do not cover every endpoint or error path, so they cannot confirm that CVV/CVC values are never returned.

#### 2.3. Only last4 is exposed when returning a masked card number

Result: FAIL

Comment/Evidence: Responses 1, 2, 4, and 6 use the `card_last4` field. Response 3 returns full values in `orders[*].card_number` on lines 54, 62, and 70, which breaks the last-four-digits rule.

#### 2.4. Card expiration dates are not returned by sensitive endpoints

Result: FAIL

Comment/Evidence: Response 3 in `api-responses.json` returns expiration dates in `orders[0].card_exp`, `orders[1].card_exp`, and `orders[2].card_exp` on lines 55, 63, and 71. The admin export does not need these values to identify a payment card.

#### 2.5. Error responses do not expose sensitive card information

Result: N/A

Comment/Evidence: Response 5 in `api-responses.json`, lines 98 through 105, contains no PAN, CVV/CVC, or expiration date. It is the only error example provided, so it cannot confirm the behavior of every error response. Its `error.details` field still exposes database credentials and internal system details.

### 3. SSL/TLS Configuration

#### 3.1. TLS 1.0 and TLS 1.1 are disabled

Result: FAIL

Comment/Evidence: The Protocol Support table in `ssl-scan-result.md` shows TLS 1.0 as supported on line 32. TLS 1.1 is disabled on line 33, but the check fails because TLS 1.0 remains enabled.

#### 3.2. Weak cipher suites are not supported (RC4, 3DES, MD5)

Result: FAIL

Comment/Evidence: `ssl-scan-result.md` line 47 lists `TLS_RSA_WITH_RC4_128_SHA`. The Known Vulnerabilities table on line 81 also states that the server supports RC4.

#### 3.3. The HSTS header is present and configured correctly

Result: FAIL

Comment/Evidence: `ssl-scan-result.md` line 55 shows `Strict-Transport-Security: max-age=86400`. The policy lasts only one day and does not include `includeSubDomains`, which gives a payment service weak downgrade protection.

#### 3.4. Forward Secrecy is fully supported

Result: FAIL

Comment/Evidence: `ssl-scan-result.md` lines 65 through 67 show Forward Secrecy support for modern browsers but not for all browsers. Lines 45 through 47 also list static RSA key-exchange suites that do not provide Forward Secrecy.

#### 3.5. The overall SSL Labs grade is A or A+

Result: FAIL

Comment/Evidence: `ssl-scan-result.md` line 8 reports an overall grade of C, below the required A or A+ rating.

### 4. General Security Observations

#### 4.1. API error responses do not expose unnecessary technical details

Result: FAIL

Comment/Evidence: Response 5 in `api-responses.json` exposes a SQL query, database username and password, internal hostname, port, and database name in `error.details` on line 103. The credential and connection string are not copied into this report.

#### 4.2. Admin endpoints do not expose card data in an unprotected format

Result: FAIL

Comment/Evidence: Response 3 for `GET /admin/orders/export` returns full PANs in `orders[*].card_number` and expiration dates in `orders[*].card_exp` on lines 54 through 71. Calling the endpoint internal does not protect the data in its response.

#### 4.3. Webhook payloads do not expose sensitive card information

Result: N/A

Comment/Evidence: Response 7 in `api-responses.json`, lines 142 through 157, contains invoice, subscription, amount, currency, and status fields but no card data. Only one webhook event type is shown, so the file cannot confirm that every webhook payload is free of card data.

## Section B - Security Findings

### F-01. Full PANs exposed in application logs

Location: `application.log` lines 14, 24, 25, and 59

Severity: P0

Description: The service writes full PANs to its logs. The DEBUG CSV rows also pair PANs with expiration dates, while the database error entry includes a PAN inside a SQL statement. Anyone with log access can retrieve cardholder data, and log aggregation may copy it into other systems.

Recommendation: Remove PAN and expiration fields from every log message and SQL diagnostic. Apply centralized redaction before writing logs, disable sensitive request and body logging, restrict log access, and remove exposed values from retained logs under the incident response and data retention procedures.

### F-02. Full PANs returned by the admin export

Location: `api-responses.json`, Response 3, `orders[*].card_number` and `orders[*].card_exp`, lines 54 through 71

Severity: P0

Description: The admin export returns full PANs and expiration dates for three orders. The endpoint is internal, but it still exposes cardholder data and expands the systems covered by PCI DSS controls.

Recommendation: Remove `card_number` and `card_exp` from the export. Return only `card_brand` and `card_last4` when users need to identify a payment card. Limit access to authorized roles and log every export request.

### F-03. Webhook signing secret written to logs

Location: `application.log` line 50

Severity: P1

Description: A DEBUG message contains a Stripe webhook signing secret. Anyone who can read the log could use that secret to create valid-looking webhook signatures and send forged events to the service.

Recommendation: Revoke and rotate the exposed secret. Remove secrets from log parameters, add automatic secret redaction, disable DEBUG logging in production, and scan retained logs for other credentials.

### F-04. Database credentials exposed in a public error response

Location: `api-responses.json`, Response 5, `error.details`, line 103

Severity: P1

Description: The error response returns a SQL query, database credentials, an internal hostname, the database port, and the database name. An attacker could use the credentials to attempt database access and use the infrastructure details to plan further attacks.

Recommendation: Rotate the exposed database password. Replace `error.details` with a safe message and request ID. Keep SQL and connection diagnostics in access-controlled server logs after removing credentials.

### F-05. Obsolete TLS protocol and cipher support

Location: `ssl-scan-result.md` lines 32, 45 through 47, 65 through 67, and 81

Severity: P1

Description: The server enables TLS 1.0 and RC4, offers RSA key-exchange suites without Forward Secrecy, and does not provide Forward Secrecy for all clients. Payment traffic can fall back to weak or obsolete cryptography.

Recommendation: Disable TLS 1.0 and RC4. Remove static RSA key-exchange suites, require TLS 1.2 or newer with ECDHE and AEAD ciphers, enable TLS 1.3, and run the external scan again.

### F-06. Expired TLS certificate

Location: `ssl-scan-result.md` lines 3, 18, and 19

Severity: P1

Description: The scan ran on 2024-03-18, but the certificate expired on 2023-09-18. Clients cannot establish a normally trusted TLS connection. This can cause outages or encourage users to bypass certificate warnings.

Recommendation: Replace the certificate, verify the full certificate chain, automate renewal, and alert the operations team before future expiration dates.

### F-07. Weak HSTS policy

Location: `ssl-scan-result.md` line 55

Severity: P1

Description: The HSTS header uses a one-day `max-age` and does not cover subdomains. Browsers lose downgrade protection shortly after the policy expires.

Recommendation: Use a long-lived policy such as `max-age=31536000; includeSubDomains` after confirming that every subdomain supports HTTPS. Consider preload only after the domain meets the preload requirements.

### F-08. Content Security Policy missing

Location: `ssl-scan-result.md` line 58

Severity: P2

Description: The server does not return a Content-Security-Policy header. Without this browser-side control, injected scripts or content have fewer restrictions.

Recommendation: Define a restrictive Content-Security-Policy for browser responses. Start in report-only mode, review the reported violations, and enforce the policy after testing.

## Section C - Audit Summary

| Metric | Count |
|---|---:|
| Total checklist items | 18 |
| OK results | 0 |
| FAIL results | 14 |
| N/A results | 4 |
| Total security findings | 8 |
| P0 findings | 2 |
| P1 findings | 5 |
| P2 findings | 1 |

The highest-priority issues are the full PAN exposure in logs and the admin export. The service should treat both as cardholder-data exposure, remove the data from output paths, restrict access, and follow the applicable incident-response process. Credential rotation and TLS remediation should follow immediately. The N/A results reflect evidence limits: the supplied samples contain no CVV/CVC or card data in the sampled error and webhook payloads, but they cannot prove safe behavior across all production paths.
