# SSL Labs Server Test — orders.demo-electronics.com

Test date: 2024-03-18
Scan engine: SSL Labs v2.2.0

---

## Overall Rating: C

---

## Certificate Information

| Field              | Value                                     |
|--------------------|-------------------------------------------|
| Subject            | orders.demo-electronics.com               |
| Issuer             | Let's Encrypt Authority X3                |
| Valid from         | 2023-06-20                                |
| Valid until        | 2023-09-18                                |
| Key size           | RSA 2048 bits                             |
| Signature algorithm| SHA256withRSA                             |
| Certificate chain  | Complete                                  |

---

## Protocol Support

| Protocol | Supported |
|----------|-----------|
| SSL 2.0  | No        |
| SSL 3.0  | No        |
| TLS 1.0  | Yes       |
| TLS 1.1  | No        |
| TLS 1.2  | Yes       |
| TLS 1.3  | No        |

---

## Cipher Suites (TLS 1.2)

| Cipher Suite                              | Key Exchange | Strength  |
|-------------------------------------------|-------------|-----------|
| TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384    | ECDH 256    | 256 bits  |
| TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256    | ECDH 256    | 128 bits  |
| TLS_RSA_WITH_AES_256_CBC_SHA256           | RSA         | 256 bits  |
| TLS_RSA_WITH_AES_128_CBC_SHA             | RSA         | 128 bits  |
| TLS_RSA_WITH_RC4_128_SHA                 | RSA         | 128 bits  |

---

## HTTP Security Headers

| Header                          | Value                      |
|---------------------------------|----------------------------|
| Strict-Transport-Security       | max-age=86400              |
| X-Content-Type-Options          | nosniff                    |
| X-Frame-Options                 | SAMEORIGIN                 |
| Content-Security-Policy         | NOT PRESENT                |
| X-XSS-Protection                | NOT PRESENT                |

---

## Forward Secrecy

| With modern browsers | With all browsers |
|---------------------|-------------------|
| Yes                 | No                |

---

## Known Vulnerabilities

| Vulnerability  | Status                |
|----------------|-----------------------|
| Heartbleed     | Not vulnerable        |
| POODLE (SSLv3) | Not vulnerable        |
| POODLE (TLS)   | Not vulnerable        |
| DROWN          | Not vulnerable        |
| ROBOT          | Potentially vulnerable|
| BEAST          | Mitigated (server-side)|
| RC4            | Server supports RC4   |
