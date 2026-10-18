// velocity-buggy.ts
// Заняття 9 — Домашнє завдання
// Функція для перевірки velocity правил
// Знайдіть мінімум 4 проблеми в цьому коді

export interface Transaction {
  id: string;
  cardId: string;
  // Amounts must use one currency's minor unit within a velocity window.
  amount: number;
  ip: string;
  email: string;
  timestamp: number;
}

export type VelocityDecision = 'approve' | 'review' | 'challenge_3ds' | 'block';

export interface VelocityResult {
  decision: VelocityDecision;
  reason?: string;
}

export interface VelocityDatabase {
  getTransactions(query: {
    since: number;
    matchAny: Pick<Transaction, 'cardId' | 'ip' | 'email'>;
  }): Promise<Transaction[]>;
}

export interface VelocityPolicy {
  windowMs: number;
  maxTransactions: number;
  reviewAtTransactions: number;
  maxTotalAmount: number;
  challengeAmount: number;
  historyTimeoutMs: number;
  historyFailureDecision: 'review' | 'block';
}

// Proposed defaults for this exercise, expressed in minor units. Production
// values must be approved by the merchant's fraud team before deployment.
export const DEFAULT_VELOCITY_POLICY: VelocityPolicy = {
  windowMs: 10 * 60 * 1_000,
  maxTransactions: 5,
  reviewAtTransactions: 4,
  maxTotalAmount: 1_000_000,
  challengeAmount: 500_000,
  historyTimeoutMs: 500,
  historyFailureDecision: 'review',
};

type Dimension = 'card' | 'ip' | 'email';

function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeout = setTimeout(() => reject(new Error('velocity history timeout')), timeoutMs);
  });

  return Promise.race([operation, timeoutPromise]).finally(() => clearTimeout(timeout));
}

export async function checkVelocity(
  cardId: string,
  amount: number,
  ip: string,
  email: string,
  database: VelocityDatabase,
  policy: VelocityPolicy = DEFAULT_VELOCITY_POLICY
): Promise<VelocityResult> {
  const currentTimestamp = Date.now();
  const since = currentTimestamp - policy.windowMs;
  let recentTx: Transaction[];

  try {
    recentTx = await withTimeout(
      database.getTransactions({
        since,
        matchAny: { cardId, ip, email },
      }),
      policy.historyTimeoutMs
    );
  } catch {
    return {
      decision: policy.historyFailureDecision,
      reason: 'velocity_history_unavailable',
    };
  }

  const currentAttempt: Transaction = {
    id: '__current_attempt__',
    cardId,
    amount,
    ip,
    email,
    timestamp: currentTimestamp,
  };
  const attempts = recentTx
    .filter(
      (transaction) =>
        transaction.timestamp >= since && transaction.timestamp <= currentTimestamp
    )
    .concat(currentAttempt);
  const dimensions: Array<{
    name: Dimension;
    matches: (transaction: Transaction) => boolean;
  }> = [
    { name: 'card', matches: (transaction) => transaction.cardId === cardId },
    { name: 'ip', matches: (transaction) => transaction.ip === ip },
    { name: 'email', matches: (transaction) => transaction.email === email },
  ];

  for (const dimension of dimensions) {
    if (attempts.filter(dimension.matches).length > policy.maxTransactions) {
      return { decision: 'block', reason: `velocity_${dimension.name}_exceeded` };
    }
  }

  for (const dimension of dimensions) {
    const totalAmount = attempts
      .filter(dimension.matches)
      .reduce((total, transaction) => total + transaction.amount, 0);

    if (totalAmount > policy.maxTotalAmount) {
      return { decision: 'block', reason: `velocity_${dimension.name}_amount_exceeded` };
    }
  }

  if (amount >= policy.challengeAmount) {
    return { decision: 'challenge_3ds', reason: 'high_amount_3ds' };
  }

  for (const dimension of dimensions) {
    if (attempts.filter(dimension.matches).length >= policy.reviewAtTransactions) {
      return { decision: 'review', reason: `velocity_${dimension.name}_near_limit` };
    }
  }

  return { decision: 'approve' };
}
