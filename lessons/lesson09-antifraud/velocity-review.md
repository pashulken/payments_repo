# Velocity Checker Code Review

## Scope and current behavior

The original `checkVelocity` implementation queried transaction history for the
last ten minutes using only `cardId`. It blocked only when the returned history
contained more than five records and otherwise approved the payment. The current
attempt was not added to the history. The `amount`, `ip`, and `email` parameters
were accepted but never used. The result type allowed only `approve` and `block`,
and database rejection or a never-settling database request was not handled.

The original file was also not directly testable: it did not export
`checkVelocity`, and it referenced an undeclared `db`. The first Jest red run
therefore failed with TypeScript error `TS2306: velocity-buggy.ts is not a
module`. This was corrected by exporting the public seam and injecting a small
`VelocityDatabase` interface.

## Policy assumptions used by the corrected implementation

These values are proposed exercise defaults, not asserted production rules:

- The existing count rule remains a maximum of five attempts in ten minutes.
- Database history excludes the current pre-Stripe attempt; the checker adds it
  before evaluating limits.
- The database query's `matchAny` contract returns transactions matching the
  card, IP, or email. A production query needs corresponding indexed predicates.
- Amounts are comparable minor-unit values in one currency. If the merchant is
  multi-currency, currency must be added and amounts normalized before summing.
- The proposed rolling amount limit is `1_000_000` (for example, $10,000.00),
  the 3DS threshold is `500_000` (for example, $5,000.00),
  and manual review starts at four attempts. Fraud/risk owners must approve or
  replace these values.
- History retrieval has a proposed 500 ms timeout. Failure defaults to `review`,
  which is fail-safe only if the caller does not send `review` transactions to
  Stripe. A stricter merchant can configure `block`.
- Device fingerprinting remains out of scope because neither the original API nor
  its transaction model supplies a trustworthy device identifier.

## Standards

No repository coding-style document or lint configuration was found. The only
hard technical issue in the original file was compatibility with the strict
TypeScript project: undeclared ambient `db` access and a non-module file prevented
normal import and isolated mocking. The README identifies homework files as
intentionally broken, so this was expected exercise baseline behavior rather
than an accidental style violation.

Judgement-call smells in the original code were primitive/data-clump parameters
(`cardId`, `amount`, `ip`, and `email`) and the mysterious ambient `db` dependency.
The fix keeps the four parameters for compatibility and only adds an explicit
database contract and policy object; it does not introduce a service hierarchy.

## Spec

### Problem 1: Card-only velocity can be bypassed

**What is wrong:**  
The original query was `db.getTransactions({ cardId, since })`, and the function
checked only the returned count. Five attempts using different cards but the same
IP or email appeared unrelated. A card-testing bot could submit five stolen cards
from `203.0.113.10` and then use a sixth card without triggering the per-card
limit.

**Business Risk:**  
Card testing and stolen-card fraud can reach Stripe, increasing authorization
costs, chargebacks, scheme monitoring exposure, and investigation work.

Test Case

**ID:** VC-001  
**Title:** Block cross-card IP velocity  
**Pre-conditions:** Five recent transactions with different cards and emails
share the current IP.  
**Steps:** Submit a sixth attempt with a new card and the same IP.  
**Input:** Five historical rows plus a current amount of `100`.  
**Expected result:** `block / velocity_ip_exceeded`.  
**Actual result:** The original file could not run under Jest because it was not
a module. The original query would return no history for the new card, so its
code path would return `approve`.

Test Case

**ID:** VC-002  
**Title:** Block cross-card email velocity  
**Pre-conditions:** Five recent transactions with different cards and IPs share
the current email.  
**Steps:** Submit a sixth attempt with a new card and IP but the same email.  
**Input:** Five historical rows plus a current amount of `100`.  
**Expected result:** `block / velocity_email_exceeded`.  
**Actual result:** The original query used only the new card ID, so its code path
would return `approve`.

**Fixed Code:**

```ts
recentTx = await database.getTransactions({
  since,
  matchAny: { cardId, ip, email },
});

const dimensions = [
  { name: 'card', matches: (tx: Transaction) => tx.cardId === cardId },
  { name: 'ip', matches: (tx: Transaction) => tx.ip === ip },
  { name: 'email', matches: (tx: Transaction) => tx.email === email },
];
```

### Problem 2: Rolling transaction amount is ignored

**What is wrong:**  
`amount` existed on the function and `Transaction`, but the original function
never read it. Assuming minor units, two previous attempts of `400_000` plus a
current attempt of `300_000` produced a rolling value of `1_100_000` ($11,000.00
in a two-decimal currency). The function treated them like any three attempts.

**Business Risk:**  
A small number of high-value fraudulent payments can bypass a count-only rule,
causing larger losses and chargebacks than low-value card testing.

<!-- page-break -->

Test Case

**ID:** VC-003  
**Title:** Block cumulative amount above policy  
**Pre-conditions:** The rolling amount limit is `1_000_000`, and two recent
matching transactions have amounts of `400_000` each.  
**Steps:** Submit another matching transaction.  
**Input:** Current amount `300_000`.  
**Expected result:** `block / velocity_card_amount_exceeded`.  
**Actual result:** The original code would return `approve` because it checked
the count of two historical transactions and ignored their amounts.

Test Case

**ID:** VC-004  
**Title:** Allow the exact cumulative amount limit  
**Pre-conditions:** One recent matching transaction has an amount of `400_000`,
and the rolling amount limit is `1_000_000`.  
**Steps:** Submit another matching transaction.  
**Input:** Current amount `600_000`.  
**Expected result:** `approve`.  
**Actual result:** The original code would also return `approve`, but only because
it ignored amounts. This regression test proves that the fixed comparison allows
the configured maximum and blocks values above it.

**Fixed Code:**

```ts
const totalAmount = attempts
  .filter(dimension.matches)
  .reduce((total, transaction) => total + transaction.amount, 0);

if (totalAmount > policy.maxTotalAmount) {
  return { decision: 'block', reason: `velocity_${dimension.name}_amount_exceeded` };
}
```

### Problem 3: No intermediate risk decisions

**What is wrong:**  
The original result union allowed only `approve` and `block`. The function could
not route elevated-risk transactions to manual review or 3DS.

**Business Risk:**  
Binary handling accepts avoidable fraud or increases false declines and lost
revenue. Risk analysts also lose the chance to investigate borderline attempts.

Test Case

**ID:** VC-005  
**Title:** Require 3DS for a high-value transaction  
**Pre-conditions:** The 3DS threshold is `500_000`, and the hard rolling limit is
`1_000_000`.  
**Steps:** Submit a first transaction above the 3DS threshold.  
**Input:** Current amount `600_000`.  
**Expected result:** `challenge_3ds / high_amount_3ds`.  
**Actual result:** The original result type did not support `challenge_3ds`, and
the original code path would return `approve`.

Test Case

**ID:** VC-006  
**Title:** Route near-limit velocity to manual review  
**Pre-conditions:** Three recent matching transactions exist, and the review
threshold is four attempts including the current attempt.  
**Steps:** Submit the fourth matching attempt.  
**Input:** Three historical rows plus a current amount of `100`.  
**Expected result:** `review / velocity_card_near_limit`.  
**Actual result:** The original result type did not support `review`, and the
original code path would return `approve`.

**Fixed Code:**

```ts
type VelocityDecision = 'approve' | 'review' | 'challenge_3ds' | 'block';

if (amount >= policy.challengeAmount) {
  return { decision: 'challenge_3ds', reason: 'high_amount_3ds' };
}

for (const dimension of dimensions) {
  if (attempts.filter(dimension.matches).length >= policy.reviewAtTransactions) {
    return { decision: 'review', reason: `velocity_${dimension.name}_near_limit` };
  }
}
```

### Problem 4: Database failure and timeout are uncontrolled

**What is wrong:**  
The original direct `await db.getTransactions(...)` had no `try/catch` and no
deadline. A rejection escaped the checker. A database request that never settled
left the fraud decision pending. The caller could fail the checkout or convert
the error to approval because the checker supplied no failure decision.

**Business Risk:**  
A database incident can stop legitimate checkout traffic, create unbounded
latency, or let fraud through if upstream code treats checker errors as approval.

Test Case

**ID:** VC-007  
**Title:** Apply the fail-safe policy after a database rejection  
**Pre-conditions:** The history failure decision is `review`.  
**Steps:** Mock `getTransactions` to reject, then submit a transaction.  
**Input:** Database error `database unavailable`.  
**Expected result:** `review / velocity_history_unavailable`.  
**Actual result:** The original function would reject without returning an
antifraud decision.

Test Case

**ID:** VC-008  
**Title:** Apply the fail-safe policy after a database timeout  
**Pre-conditions:** The history timeout is 20 ms in the test, and the failure
decision is `review`.  
**Steps:** Return a promise that never settles and advance the fake timer to the
configured timeout.  
**Input:** A never-resolving database promise.  
**Expected result:** `review / velocity_history_unavailable`.  
**Actual result:** The original function had no timeout and would return no
decision while the database promise remained pending.

**Fixed Code:**

```ts
try {
  recentTx = await withTimeout(
    database.getTransactions({ since, matchAny: { cardId, ip, email } }),
    policy.historyTimeoutMs
  );
} catch {
  return {
    decision: policy.historyFailureDecision,
    reason: 'velocity_history_unavailable',
  };
}
```

### Problem 5: Sixth attempt is approved

**What is wrong:**  
The original condition was `recentTx.length > 5`. The checker runs before the
current attempt goes to Stripe and retrieves historical transactions. Five
previous rows make the sixth attempt evaluate as `5 > 5`, which is false, so the
function approves it.

**Business Risk:**  
Attackers receive one extra attempt per card and time window, increasing
card-testing throughput and weakening the configured fraud limit.

Test Case

**ID:** VC-009  
**Title:** Block the sixth attempt  
**Pre-conditions:** Five recent matching card transactions exist.  
**Steps:** Submit one more matching attempt.  
**Input:** Five historical rows plus a current amount of `100`.  
**Expected result:** `block / velocity_card_exceeded`.  
**Actual result:** The original condition evaluated `5 > 5` as false and returned
`approve`.

**Fixed Code:**

```ts
const attempts = recentTx.concat(currentAttempt);

if (attempts.filter(dimension.matches).length > policy.maxTransactions) {
  return { decision: 'block', reason: `velocity_${dimension.name}_exceeded` };
}
```

## Corrected implementation summary

The corrected `velocity-buggy.ts` now:

1. Exports its public function and types and receives the database boundary as a
   dependency.
2. Retrieves history matching any current card, IP, or email and evaluates each
   dimension independently.
3. Adds the in-flight attempt before count and rolling-value evaluation.
4. Supports `approve`, `review`, `challenge_3ds`, and `block`.
5. Converts database rejection or timeout into a configurable fail-safe result.

The velocity implementation, its JavaScript unit test, and the Jest scripts were
updated. Device fingerprinting was not fabricated because no device input exists.

## Review summary

- Standards axis: one original compile/testability issue, now fixed. Worst issue:
  undeclared ambient database access under strict TypeScript.
- Spec axis: five confirmed defects, all covered by executable tests and fixed.
  Worst issue: database/history failure had no explicit safe decision and could
  turn an infrastructure incident into checkout failure or fraud bypass.

## Automated tests

**Location:** `lessons/lesson09-antifraud/velocity-buggy.unit.test.js`

**How to run:** Open a terminal in the repository root (`D:\QA-PAYMENTS-main`),
install dependencies once with `npm install`, then run `npm run test:velocity`.
The dedicated script runs only this suite and uses Jest's serial mode for
predictable local output.

**Test design:** The suite uses JavaScript and Jest, fixed time, isolated database
mocks, reusable data builders, descriptive case IDs, explicit expected results,
and cleanup after every test. Each test exercises one observable behavior and
does not call a real database or external payment service.

| Test | Expected | Actual | Status |
|---|---|---|---|
| Approves a low-value first attempt | `approve` | `approve` | Pass |
| Blocks different cards from the same IP | `block / velocity_ip_exceeded` | Same | Pass |
| Blocks different cards/IPs using the same email | `block / velocity_email_exceeded` | Same | Pass |
| Blocks rolling amount above the limit | `block / velocity_card_amount_exceeded` | Same | Pass |
| Allows rolling amount exactly at the limit | `approve` | `approve` | Pass |
| Requests 3DS for high value below hard limit | `challenge_3ds / high_amount_3ds` | Same | Pass |
| Routes near-limit velocity to review | `review / velocity_card_near_limit` | Same | Pass |
| Handles database rejection | `review / velocity_history_unavailable` | Same | Pass |
| Handles database timeout | `review / velocity_history_unavailable` | Same | Pass |
| Blocks sixth attempt after five historical attempts | `block / velocity_card_exceeded` | Same | Pass |
| Ignores records older than the window | `approve` | `approve` | Pass |

## Automated test code

The following executable JavaScript/Jest suite implements the test cases above.
It is the complete source of `velocity-buggy.unit.test.js`.

<!-- include-test-code -->

## Test execution

Initial red command:

```text
npm run test:unit -- --runInBand
```

Result against the original implementation: the new suite did not compile with
`TS2306: velocity-buggy.ts is not a module`. The existing Lesson 1 suite still
passed 23 tests.

Install dependencies once:

```text
npm install
```

Run only the velocity suite:

```text
npm run test:velocity
```

Result: 1 suite passed, 11 tests passed, 0 failed.

Full unit command:

```text
npm run test:unit -- --runInBand
```

Result: 2 suites passed, 34 tests passed, 0 failed.
