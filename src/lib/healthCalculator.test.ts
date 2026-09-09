import { describe, expect, it } from 'vitest';
import {
  CRITICAL_MAX_SCORE,
  FACTOR_WEIGHTS,
  HealthScoreValidationError,
  NEUTRAL_SCORE,
  WARNING_MAX_SCORE,
  calculateHealthScore,
  classifyRiskLevel,
  scoreContract,
  scoreEngagement,
  scorePaymentHistory,
  scoreSupport,
  type ContractInput,
  type EngagementInput,
  type PaymentHistoryInput,
  type RiskFactorInputs,
  type SupportInput,
} from './healthCalculator';

const healthyPayment: PaymentHistoryInput = {
  daysSinceLastPayment: 5,
  averagePaymentDelayDays: 0,
  overdueAmount: 0,
};
const healthyEngagement: EngagementInput = {
  loginsPerMonth: 25,
  featureUsageCount: 12,
  supportTicketCount: 0,
};
const healthyContract: ContractInput = {
  daysUntilRenewal: 200,
  contractValue: 120_000,
  hasRecentUpgrade: true,
};
const healthySupport: SupportInput = {
  averageResolutionTimeHours: 2,
  satisfactionScore: 5,
  escalationCount: 0,
};

const failingPayment: PaymentHistoryInput = {
  daysSinceLastPayment: 120,
  averagePaymentDelayDays: 45,
  overdueAmount: 25_000,
};
const failingEngagement: EngagementInput = {
  loginsPerMonth: 0,
  featureUsageCount: 0,
  supportTicketCount: 15,
};
const failingContract: ContractInput = {
  daysUntilRenewal: -10,
  contractValue: 0,
  hasRecentUpgrade: false,
};
const failingSupport: SupportInput = {
  averageResolutionTimeHours: 96,
  satisfactionScore: 1,
  escalationCount: 8,
};

describe('per-factor scoring', () => {
  it('returns 0-100 for the best and worst realistic inputs', () => {
    for (const score of [
      scorePaymentHistory(healthyPayment),
      scorePaymentHistory(failingPayment),
      scoreEngagement(healthyEngagement),
      scoreEngagement(failingEngagement),
      scoreContract(healthyContract),
      scoreContract(failingContract),
      scoreSupport(healthySupport),
      scoreSupport(failingSupport),
    ]) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
      expect(Number.isInteger(score)).toBe(true);
    }
  });

  it('scores a perfect customer at 100 and a fully failing one at 0 per factor', () => {
    expect(scorePaymentHistory({ ...healthyPayment, daysSinceLastPayment: 0 })).toBe(100);
    expect(scorePaymentHistory(failingPayment)).toBe(0);
    expect(scoreEngagement(healthyEngagement)).toBe(100);
    expect(scoreEngagement(failingEngagement)).toBe(0);
    expect(scoreContract(healthyContract)).toBe(100);
    expect(scoreContract(failingContract)).toBe(0);
    expect(scoreSupport({ ...healthySupport, averageResolutionTimeHours: 0 })).toBe(100);
    expect(scoreSupport(failingSupport)).toBe(0);
  });

  it('is monotonic: worsening any single input never raises the sub-score', () => {
    const worsen = <T,>(base: T, field: keyof T, values: number[], score: (input: T) => number) => {
      let previous = score(base);
      for (const value of values) {
        const current = score({ ...base, [field]: value });
        expect(current).toBeLessThanOrEqual(previous);
        previous = current;
      }
    };

    worsen(healthyPayment, 'daysSinceLastPayment', [10, 30, 60, 90, 200], scorePaymentHistory);
    worsen(healthyPayment, 'averagePaymentDelayDays', [1, 10, 30, 60], scorePaymentHistory);
    worsen(healthyPayment, 'overdueAmount', [100, 5_000, 10_000, 99_999], scorePaymentHistory);

    worsen(healthyEngagement, 'loginsPerMonth', [20, 10, 5, 0], scoreEngagement);
    worsen(healthyEngagement, 'featureUsageCount', [10, 4, 1, 0], scoreEngagement);
    worsen(healthyEngagement, 'supportTicketCount', [1, 5, 10, 50], scoreEngagement);

    worsen(healthyContract, 'daysUntilRenewal', [180, 90, 30, 0, -50], scoreContract);
    worsen(healthyContract, 'contractValue', [100_000, 50_000, 1_000, 0], scoreContract);

    worsen(healthySupport, 'satisfactionScore', [4, 3, 2, 1], scoreSupport);
    worsen(healthySupport, 'averageResolutionTimeHours', [12, 48, 72, 200], scoreSupport);
    worsen(healthySupport, 'escalationCount', [1, 3, 5, 20], scoreSupport);

    expect(scoreContract({ ...healthyContract, hasRecentUpgrade: false })).toBeLessThanOrEqual(
      scoreContract(healthyContract),
    );
  });

  it('is pure: repeated calls agree and inputs are not mutated', () => {
    const input: RiskFactorInputs = {
      payment: { ...healthyPayment },
      engagement: { ...healthyEngagement },
      contract: { ...healthyContract },
      support: { ...healthySupport },
    };
    const snapshot = structuredClone(input);

    expect(calculateHealthScore(input)).toEqual(calculateHealthScore(input));
    expect(input).toEqual(snapshot);
  });
});

describe('weighted combination', () => {
  it('weights payment 40, engagement 30, contract 20, support 10 percent', () => {
    expect(FACTOR_WEIGHTS).toEqual({ payment: 0.4, engagement: 0.3, contract: 0.2, support: 0.1 });
    expect(Object.values(FACTOR_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it('overall score equals the weighted sum of the reported sub-scores', () => {
    const scenarios: RiskFactorInputs[] = [
      { payment: healthyPayment, engagement: healthyEngagement, contract: healthyContract, support: healthySupport },
      { payment: failingPayment, engagement: failingEngagement, contract: failingContract, support: failingSupport },
      { payment: healthyPayment, engagement: failingEngagement, contract: healthyContract, support: failingSupport },
      { payment: failingPayment, engagement: healthyEngagement, contract: failingContract, support: healthySupport },
    ];

    for (const scenario of scenarios) {
      const result = calculateHealthScore(scenario);
      const expected = Math.round(
        result.breakdown.reduce((total, factor) => total + factor.score * factor.weight, 0),
      );
      expect(result.score).toBe(expected);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(Number.isInteger(result.score)).toBe(true);
    }
  });

  it('matches a hand-computed expected value', () => {
    // payment 100, engagement 100, contract 100, support 100 -> 100
    const best = calculateHealthScore({
      payment: { daysSinceLastPayment: 0, averagePaymentDelayDays: 0, overdueAmount: 0 },
      engagement: healthyEngagement,
      contract: healthyContract,
      support: healthySupport,
    });
    expect(best.score).toBe(100);
    expect(best.riskLevel).toBe('healthy');

    const worst = calculateHealthScore({
      payment: failingPayment,
      engagement: failingEngagement,
      contract: failingContract,
      support: failingSupport,
    });
    expect(worst.score).toBe(0);
    expect(worst.riskLevel).toBe('critical');

    // 0.4*100 + 0.3*0 + 0.2*100 + 0.1*0 = 60
    const mixed = calculateHealthScore({
      payment: { daysSinceLastPayment: 0, averagePaymentDelayDays: 0, overdueAmount: 0 },
      engagement: failingEngagement,
      contract: healthyContract,
      support: failingSupport,
    });
    expect(mixed.score).toBe(60);
  });
});

describe('risk level boundaries', () => {
  it('classifies every band boundary inclusively', () => {
    expect(classifyRiskLevel(0)).toBe('critical');
    expect(classifyRiskLevel(CRITICAL_MAX_SCORE)).toBe('critical');
    expect(classifyRiskLevel(CRITICAL_MAX_SCORE + 1)).toBe('warning');
    expect(classifyRiskLevel(WARNING_MAX_SCORE)).toBe('warning');
    expect(classifyRiskLevel(WARNING_MAX_SCORE + 1)).toBe('healthy');
    expect(classifyRiskLevel(100)).toBe('healthy');
  });

  it('maps the documented boundary values 0, 30, 31, 70, 71, 100', () => {
    const expectations: Array<[number, string]> = [
      [0, 'critical'],
      [30, 'critical'],
      [31, 'warning'],
      [70, 'warning'],
      [71, 'healthy'],
      [100, 'healthy'],
    ];
    for (const [score, level] of expectations) {
      expect(classifyRiskLevel(score)).toBe(level);
    }
  });

  it('classifies a calculated result on the same thresholds it reports', () => {
    const result = calculateHealthScore({});
    expect(result.score).toBe(NEUTRAL_SCORE);
    expect(result.riskLevel).toBe(classifyRiskLevel(result.score));
  });
});

describe('input validation', () => {
  const cases: Array<[string, () => unknown, string]> = [
    ['NaN days since payment', () => scorePaymentHistory({ ...healthyPayment, daysSinceLastPayment: NaN }), 'payment.daysSinceLastPayment'],
    ['infinite overdue amount', () => scorePaymentHistory({ ...healthyPayment, overdueAmount: Infinity }), 'payment.overdueAmount'],
    ['negative payment delay', () => scorePaymentHistory({ ...healthyPayment, averagePaymentDelayDays: -1 }), 'payment.averagePaymentDelayDays'],
    ['negative logins', () => scoreEngagement({ ...healthyEngagement, loginsPerMonth: -5 }), 'engagement.loginsPerMonth'],
    ['NaN feature usage', () => scoreEngagement({ ...healthyEngagement, featureUsageCount: NaN }), 'engagement.featureUsageCount'],
    ['negative ticket count', () => scoreEngagement({ ...healthyEngagement, supportTicketCount: -2 }), 'engagement.supportTicketCount'],
    ['infinite renewal days', () => scoreContract({ ...healthyContract, daysUntilRenewal: -Infinity }), 'contract.daysUntilRenewal'],
    ['negative contract value', () => scoreContract({ ...healthyContract, contractValue: -1 }), 'contract.contractValue'],
    ['satisfaction above scale', () => scoreSupport({ ...healthySupport, satisfactionScore: 6 }), 'support.satisfactionScore'],
    ['satisfaction below scale', () => scoreSupport({ ...healthySupport, satisfactionScore: 0 }), 'support.satisfactionScore'],
    ['negative resolution time', () => scoreSupport({ ...healthySupport, averageResolutionTimeHours: -3 }), 'support.averageResolutionTimeHours'],
    ['negative escalations', () => scoreSupport({ ...healthySupport, escalationCount: -1 }), 'support.escalationCount'],
  ];

  it.each(cases)('rejects %s and names the field', (_label, run, field) => {
    expect(run).toThrow(HealthScoreValidationError);
    try {
      run();
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(HealthScoreValidationError);
      expect(error).toBeInstanceOf(Error);
      expect((error as HealthScoreValidationError).field).toBe(field);
      expect((error as Error).message).toContain(field);
    }
  });

  it('propagates validation failures out of calculateHealthScore without returning a score', () => {
    expect(() =>
      calculateHealthScore({ payment: { ...healthyPayment, overdueAmount: -1 } }),
    ).toThrow(HealthScoreValidationError);
  });

  it('leaks no raw values or customer identifiers in the message', () => {
    try {
      scorePaymentHistory({ ...healthyPayment, overdueAmount: -98765 });
      expect.unreachable('should have thrown');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toContain('98765');
      expect(message).toBe('Invalid health score input for "payment.overdueAmount": must be zero or greater.');
    }
  });

  it('treats daysUntilRenewal as the one signed field: negatives score, they do not throw', () => {
    // Non-numeric and infinite are still rejected.
    expect(() => scoreContract({ ...healthyContract, daysUntilRenewal: NaN })).toThrow(
      HealthScoreValidationError,
    );
    expect(() => scoreContract({ ...healthyContract, daysUntilRenewal: -Infinity })).toThrow(
      HealthScoreValidationError,
    );

    // A lapsed contract is a real state: it floors the runway term at 0 and
    // scores the same as renewal day itself, rather than blanking the score.
    const atRenewal = scoreContract({ ...healthyContract, daysUntilRenewal: 0 });
    expect(scoreContract({ ...healthyContract, daysUntilRenewal: -1 })).toBe(atRenewal);
    expect(scoreContract({ ...healthyContract, daysUntilRenewal: -400 })).toBe(atRenewal);

    // And it reaches the calculator intact, so a churn-risk customer still gets a score.
    const lapsed = calculateHealthScore({
      payment: healthyPayment,
      engagement: healthyEngagement,
      contract: { ...failingContract, daysUntilRenewal: -90 },
      support: healthySupport,
    });
    expect(lapsed.score).toBeGreaterThanOrEqual(0);
    expect(lapsed.breakdown.find((f) => f.factor === 'contract')?.estimated).toBe(false);
  });

  it('rejects negatives on every other numeric field', () => {
    expect(() => scorePaymentHistory({ ...healthyPayment, daysSinceLastPayment: -1 })).toThrow(
      HealthScoreValidationError,
    );
    expect(() => scoreContract({ ...healthyContract, contractValue: -1 })).toThrow(
      HealthScoreValidationError,
    );
    expect(() => scoreEngagement({ ...healthyEngagement, loginsPerMonth: -1 })).toThrow(
      HealthScoreValidationError,
    );
    expect(() => scoreSupport({ ...healthySupport, escalationCount: -1 })).toThrow(
      HealthScoreValidationError,
    );
  });
});

describe('missing-data fallback', () => {
  it('scores an absent factor neutral and flags it estimated', () => {
    const result = calculateHealthScore({ engagement: healthyEngagement });
    const byFactor = Object.fromEntries(result.breakdown.map((f) => [f.factor, f]));

    expect(byFactor.payment.score).toBe(NEUTRAL_SCORE);
    expect(byFactor.payment.estimated).toBe(true);
    expect(byFactor.contract.estimated).toBe(true);
    expect(byFactor.support.estimated).toBe(true);
    expect(byFactor.engagement.estimated).toBe(false);
    expect(byFactor.engagement.score).toBe(100);
  });

  it('reports all four factors with their weights in the breakdown', () => {
    const result = calculateHealthScore({});
    expect(result.breakdown.map((f) => f.factor)).toEqual([
      'payment',
      'engagement',
      'contract',
      'support',
    ]);
    expect(result.breakdown.map((f) => f.weight)).toEqual([0.4, 0.3, 0.2, 0.1]);
    expect(result.breakdown.every((f) => f.estimated)).toBe(true);
  });

  it('places a brand-new customer in warning, not critical', () => {
    const brandNew = calculateHealthScore({
      engagement: { loginsPerMonth: 0, featureUsageCount: 0, supportTicketCount: 0 },
    });
    expect(brandNew.riskLevel).toBe('warning');

    const brandNewWithContract = calculateHealthScore({
      engagement: { loginsPerMonth: 0, featureUsageCount: 0, supportTicketCount: 0 },
      contract: { daysUntilRenewal: 365, contractValue: 5_000, hasRecentUpgrade: false },
    });
    expect(brandNewWithContract.riskLevel).toBe('warning');

    const noDataAtAll = calculateHealthScore({});
    expect(noDataAtAll.riskLevel).toBe('warning');
  });
});

describe('realistic scenarios', () => {
  it('separates a thriving account from a churning one', () => {
    const thriving = calculateHealthScore({
      payment: { daysSinceLastPayment: 12, averagePaymentDelayDays: 1, overdueAmount: 0 },
      engagement: { loginsPerMonth: 18, featureUsageCount: 7, supportTicketCount: 1 },
      contract: { daysUntilRenewal: 240, contractValue: 60_000, hasRecentUpgrade: true },
      support: { averageResolutionTimeHours: 6, satisfactionScore: 4.5, escalationCount: 0 },
    });
    expect(thriving.riskLevel).toBe('healthy');

    const churning = calculateHealthScore({
      payment: { daysSinceLastPayment: 75, averagePaymentDelayDays: 22, overdueAmount: 8_000 },
      engagement: { loginsPerMonth: 1, featureUsageCount: 1, supportTicketCount: 9 },
      contract: { daysUntilRenewal: 20, contractValue: 8_000, hasRecentUpgrade: false },
      support: { averageResolutionTimeHours: 60, satisfactionScore: 1.5, escalationCount: 4 },
    });
    expect(churning.riskLevel).toBe('critical');

    const wobbling = calculateHealthScore({
      payment: { daysSinceLastPayment: 30, averagePaymentDelayDays: 8, overdueAmount: 1_500 },
      engagement: { loginsPerMonth: 6, featureUsageCount: 3, supportTicketCount: 4 },
      contract: { daysUntilRenewal: 60, contractValue: 25_000, hasRecentUpgrade: false },
      support: { averageResolutionTimeHours: 30, satisfactionScore: 3, escalationCount: 1 },
    });
    expect(wobbling.riskLevel).toBe('warning');

    expect(thriving.score).toBeGreaterThan(wobbling.score);
    expect(wobbling.score).toBeGreaterThan(churning.score);
  });
});
