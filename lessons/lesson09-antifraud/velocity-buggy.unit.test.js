const {
  checkVelocity,
  DEFAULT_VELOCITY_POLICY,
} = require('./velocity-buggy');

const NOW = 1_800_000_000_000;

const POLICY = Object.freeze({
  ...DEFAULT_VELOCITY_POLICY,
  maxTransactions: 5,
  reviewAtTransactions: 4,
  maxTotalAmount: 1_000_000,
  challengeAmount: 500_000,
  historyTimeoutMs: 20,
  historyFailureDecision: 'review',
});

function transaction(overrides = {}) {
  return {
    id: 'tx-1',
    cardId: 'card-a',
    amount: 100,
    ip: '203.0.113.10',
    email: 'buyer@example.test',
    timestamp: NOW - 1_000,
    ...overrides,
  };
}

function databaseWith(rows) {
  const getTransactions = jest.fn(async ({ since, matchAny }) =>
    rows.filter(
      (row) =>
        row.timestamp >= since &&
        (row.cardId === matchAny.cardId ||
          row.ip === matchAny.ip ||
          row.email === matchAny.email)
    )
  );

  return { getTransactions };
}

describe('checkVelocity', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test('BASE-001 approves a low-value first attempt', async () => {
    const result = await checkVelocity(
      'card-a',
      100,
      '203.0.113.10',
      'buyer@example.test',
      databaseWith([]),
      POLICY
    );

    expect(result).toEqual({ decision: 'approve' });
  });

  test('VC-001 blocks attempts spread across different cards from the same IP', async () => {
    const rows = Array.from({ length: 5 }, (_, index) =>
      transaction({
        id: `tx-${index}`,
        cardId: `stolen-card-${index}`,
        email: `buyer-${index}@example.test`,
      })
    );

    const result = await checkVelocity(
      'new-stolen-card',
      100,
      '203.0.113.10',
      'new-buyer@example.test',
      databaseWith(rows),
      POLICY
    );

    expect(result).toEqual({ decision: 'block', reason: 'velocity_ip_exceeded' });
  });

  test('VC-002 blocks attempts spread across cards and IPs for the same email', async () => {
    const rows = Array.from({ length: 5 }, (_, index) =>
      transaction({
        id: `tx-${index}`,
        cardId: `stolen-card-${index}`,
        ip: `203.0.113.${index + 1}`,
      })
    );

    const result = await checkVelocity(
      'new-stolen-card',
      100,
      '203.0.113.99',
      'buyer@example.test',
      databaseWith(rows),
      POLICY
    );

    expect(result).toEqual({ decision: 'block', reason: 'velocity_email_exceeded' });
  });

  test('VC-003 blocks cumulative value above the configured amount limit', async () => {
    const rows = [
      transaction({ id: 'tx-1', amount: 400_000 }),
      transaction({ id: 'tx-2', amount: 400_000 }),
    ];

    const result = await checkVelocity(
      'card-a',
      300_000,
      '203.0.113.10',
      'buyer@example.test',
      databaseWith(rows),
      POLICY
    );

    expect(result).toEqual({
      decision: 'block',
      reason: 'velocity_card_amount_exceeded',
    });
  });

  test('VC-004 allows an amount exactly at the configured cumulative limit', async () => {
    const rows = [transaction({ amount: 400_000 })];

    const result = await checkVelocity(
      'card-a',
      600_000,
      '203.0.113.10',
      'buyer@example.test',
      databaseWith(rows),
      { ...POLICY, challengeAmount: 2_000_000 }
    );

    expect(result).toEqual({ decision: 'approve' });
  });

  test('VC-005 requests 3DS for a high-value transaction below the block limit', async () => {
    const result = await checkVelocity(
      'card-a',
      600_000,
      '203.0.113.10',
      'buyer@example.test',
      databaseWith([]),
      POLICY
    );

    expect(result).toEqual({ decision: 'challenge_3ds', reason: 'high_amount_3ds' });
  });

  test('VC-006 routes a near-limit attempt to manual review', async () => {
    const rows = Array.from({ length: 3 }, (_, index) =>
      transaction({ id: `tx-${index}` })
    );

    const result = await checkVelocity(
      'card-a',
      100,
      '203.0.113.10',
      'buyer@example.test',
      databaseWith(rows),
      POLICY
    );

    expect(result).toEqual({ decision: 'review', reason: 'velocity_card_near_limit' });
  });

  test('VC-007 returns the fail-safe decision when history retrieval fails', async () => {
    const database = {
      getTransactions: jest.fn().mockRejectedValue(new Error('database unavailable')),
    };

    const result = await checkVelocity(
      'card-a',
      100,
      '203.0.113.10',
      'buyer@example.test',
      database,
      POLICY
    );

    expect(result).toEqual({
      decision: 'review',
      reason: 'velocity_history_unavailable',
    });
  });

  test('VC-008 returns the fail-safe decision when history retrieval times out', async () => {
    jest.useFakeTimers();
    const database = {
      getTransactions: jest.fn().mockImplementation(() => new Promise(() => undefined)),
    };

    const resultPromise = checkVelocity(
      'card-a',
      100,
      '203.0.113.10',
      'buyer@example.test',
      database,
      POLICY
    );
    await jest.advanceTimersByTimeAsync(POLICY.historyTimeoutMs);

    await expect(resultPromise).resolves.toEqual({
      decision: 'review',
      reason: 'velocity_history_unavailable',
    });
  });

  test('VC-009 blocks the sixth attempt when five matching transactions already exist', async () => {
    const rows = Array.from({ length: 5 }, (_, index) =>
      transaction({ id: `tx-${index}` })
    );

    const result = await checkVelocity(
      'card-a',
      100,
      '203.0.113.10',
      'buyer@example.test',
      databaseWith(rows),
      POLICY
    );

    expect(result).toEqual({ decision: 'block', reason: 'velocity_card_exceeded' });
  });

  test('WIN-001 ignores matching transactions outside the configured window', async () => {
    const oldRows = Array.from({ length: 6 }, (_, index) =>
      transaction({
        id: `tx-${index}`,
        timestamp: NOW - DEFAULT_VELOCITY_POLICY.windowMs - 1,
      })
    );

    const result = await checkVelocity(
      'card-a',
      100,
      '203.0.113.10',
      'buyer@example.test',
      databaseWith(oldRows),
      POLICY
    );

    expect(result).toEqual({ decision: 'approve' });
  });
});
