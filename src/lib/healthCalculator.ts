/**
 * Customer health scoring.
 *
 * Pure, framework-free library that turns four categories of raw risk-factor
 * data into an explainable 0-100 health score. No React, no I/O, no dependency
 * on the `Customer` shape — mapping a customer onto these inputs is the caller's
 * job (see `customer-health-monitoring-spec.md`).
 */

/** Weight each factor contributes to the overall score. Sums to 1. */
export const FACTOR_WEIGHTS = {
  payment: 0.4,
  engagement: 0.3,
  contract: 0.2,
  support: 0.1,
} as const;

/** Sub-score assigned to a factor whose input is absent: neutral, not zero. */
export const NEUTRAL_SCORE = 50;

/** Highest overall score still classified `critical`. */
export const CRITICAL_MAX_SCORE = 30;

/** Highest overall score still classified `warning`. */
export const WARNING_MAX_SCORE = 70;

/** Lowest valid value of `SupportInput.satisfactionScore`, inclusive. */
export const SATISFACTION_MIN = 1;

/** Highest valid value of `SupportInput.satisfactionScore`, inclusive. */
export const SATISFACTION_MAX = 5;

/** Risk band derived from the overall score. */
export type RiskLevel = 'critical' | 'warning' | 'healthy';

/** The four scored factors. */
export type HealthFactorName = 'payment' | 'engagement' | 'contract' | 'support';

/**
 * Payment behaviour. All fields are required when the factor is supplied at all;
 * omit the whole factor to score it neutral.
 */
export interface PaymentHistoryInput {
  /** Whole days since the most recent payment cleared. Non-negative. */
  daysSinceLastPayment: number;
  /** Mean days late across recent invoices. Non-negative; 0 means always on time. */
  averagePaymentDelayDays: number;
  /** Currently overdue balance, in account currency. Non-negative. */
  overdueAmount: number;
}

/** Product engagement over the trailing month. */
export interface EngagementInput {
  /** Logins in the trailing 30 days. Non-negative. */
  loginsPerMonth: number;
  /** Distinct features used in the trailing 30 days. Non-negative. */
  featureUsageCount: number;
  /** Support tickets opened in the trailing 30 days. Non-negative. */
  supportTicketCount: number;
}

/** Contract position. */
export interface ContractInput {
  /**
   * Days until the contract renews. This is the one signed field in the whole
   * input surface: negative means the renewal date has already passed, which is
   * a real customer state and scores as the worst possible runway, not a
   * validation error. Every other numeric field here rejects negatives.
   */
  daysUntilRenewal: number;
  /** Annual contract value, in account currency. Non-negative. */
  contractValue: number;
  /** Whether the customer upgraded within the trailing 90 days. */
  hasRecentUpgrade: boolean;
}

/** Support experience. */
export interface SupportInput {
  /** Mean hours to resolve a ticket. Non-negative. */
  averageResolutionTimeHours: number;
  /** Mean CSAT rating, on a 1-5 scale inclusive. */
  satisfactionScore: number;
  /** Tickets escalated in the trailing 90 days. Non-negative. */
  escalationCount: number;
}

/**
 * The four factor inputs. Any factor may be omitted, in which case it scores
 * `NEUTRAL_SCORE` and is flagged `estimated` in the breakdown.
 */
export interface RiskFactorInputs {
  payment?: PaymentHistoryInput;
  engagement?: EngagementInput;
  contract?: ContractInput;
  support?: SupportInput;
}

/** One factor's contribution to the overall score. */
export interface HealthFactorBreakdown {
  factor: HealthFactorName;
  /** Integer 0-100. Higher is healthier. */
  score: number;
  /** Share of the overall score this factor carries, as a fraction of 1. */
  weight: number;
  /** True when the factor's input was absent and the score is a neutral stand-in. */
  estimated: boolean;
}

/** Result of a full health calculation. */
export interface HealthScoreResult {
  /** Integer 0-100, the weighted sum of the factor sub-scores. */
  score: number;
  riskLevel: RiskLevel;
  breakdown: HealthFactorBreakdown[];
}

/**
 * Thrown when an input field is not a usable number. Carries the offending
 * field path; never the value itself or any customer-identifying data.
 */
export class HealthScoreValidationError extends Error {
  readonly field: string;

  constructor(field: string, reason: string) {
    super(`Invalid health score input for "${field}": ${reason}.`);
    this.name = 'HealthScoreValidationError';
    this.field = field;
  }
}

/** Clamp to 0-100 and round, so every sub-score is a comparable integer. */
function toScore(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)));
}

/**
 * Linear decay: `best` scores 100, `worst` scores 0, values between interpolate.
 * Monotonically non-increasing in `value` whenever `worst > best`.
 */
function decayingScore(value: number, best: number, worst: number): number {
  const ratio = (value - best) / (worst - best);
  return 100 - Math.min(1, Math.max(0, ratio)) * 100;
}

/**
 * Linear growth saturating at `target`: 0 scores 0, `target` and above score 100.
 * Monotonically non-decreasing in `value`.
 */
function saturatingScore(value: number, target: number): number {
  return Math.min(1, Math.max(0, value / target)) * 100;
}

/**
 * Input fields fall into exactly two validation classes, and every field belongs
 * to one of them deliberately:
 *
 * - **Magnitudes** — counts, currency amounts, and *elapsed* durations. A
 *   negative value is not a real state, it is bad data, so it is rejected by
 *   `assertMagnitude`. This covers every numeric field except the one below.
 * - **Signed offsets** — a distance from today that may fall on either side of
 *   it. Only `ContractInput.daysUntilRenewal` is one: a lapsed contract is a
 *   real, and unusually important, customer state. It is validated by
 *   `assertSignedOffset`, which rejects `NaN` and infinities but permits
 *   negatives, and the scoring function floors it at 0 rather than throwing.
 *
 * Rejecting negative `daysUntilRenewal` would throw a validation error for
 * precisely the customers most at risk of churn, blanking their score instead of
 * reporting it — so the asymmetry is the point, not an oversight.
 */
function assertNumeric(value: number, field: string): void {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new HealthScoreValidationError(field, 'must be a number');
  }
  if (!Number.isFinite(value)) {
    throw new HealthScoreValidationError(field, 'must be finite');
  }
}

/**
 * A distance from today that may be negative (already past). Rejects only
 * non-numeric and infinite values. See the validation-classes note above.
 */
function assertSignedOffset(value: number, field: string): void {
  assertNumeric(value, field);
}

/** A count, amount, or elapsed duration: negatives are bad data, not a state. */
function assertMagnitude(value: number, field: string): void {
  assertNumeric(value, field);
  if (value < 0) {
    throw new HealthScoreValidationError(field, 'must be zero or greater');
  }
}

/** A value confined to a documented scale, e.g. 1-5 CSAT. */
function assertInRange(value: number, field: string, min: number, max: number): void {
  assertNumeric(value, field);
  if (value < min || value > max) {
    throw new HealthScoreValidationError(field, `must be between ${min} and ${max} inclusive`);
  }
}

/**
 * Payment sub-score (40% of overall).
 *
 * Formula: `0.4 x recency + 0.4 x punctuality + 0.2 x arrears`, where
 * - recency decays linearly from 100 at 0 days since last payment to 0 at 90 days,
 * - punctuality decays from 100 at no average delay to 0 at 30 days late,
 * - arrears decays from 100 at nothing overdue to 0 at 10,000 outstanding.
 *
 * Rationale: recency and punctuality are the two independent signals of whether
 * a customer is still paying and paying on time, so they share the bulk of the
 * weight. The overdue balance is a consequence of those two rather than a third
 * independent signal, so it is weighted lower and normalized against a fixed
 * ceiling rather than contract size — a large overdue balance is a bad sign
 * regardless of how big the account is.
 */
export function scorePaymentHistory(input: PaymentHistoryInput): number {
  assertMagnitude(input.daysSinceLastPayment, 'payment.daysSinceLastPayment');
  assertMagnitude(input.averagePaymentDelayDays, 'payment.averagePaymentDelayDays');
  assertMagnitude(input.overdueAmount, 'payment.overdueAmount');

  const recency = decayingScore(input.daysSinceLastPayment, 0, 90);
  const punctuality = decayingScore(input.averagePaymentDelayDays, 0, 30);
  const arrears = decayingScore(input.overdueAmount, 0, 10_000);

  return toScore(0.4 * recency + 0.4 * punctuality + 0.2 * arrears);
}

/**
 * Engagement sub-score (30% of overall).
 *
 * Formula: `0.5 x loginActivity + 0.3 x featureBreadth + 0.2 x ticketQuiet`, where
 * - loginActivity grows linearly to 100 at 20 logins/month and saturates there,
 * - featureBreadth grows linearly to 100 at 10 distinct features and saturates,
 * - ticketQuiet decays from 100 at no tickets to 0 at 10 tickets/month.
 *
 * Rationale: logins are the broadest proxy for whether the product is part of the
 * customer's routine, so they lead. Feature breadth distinguishes shallow from
 * embedded usage. Ticket volume is included per the requirements as an inverse
 * signal — heavy ticketing indicates friction — but weighted least, since tickets
 * also correlate with an *engaged* customer and the support factor already scores
 * the quality of those interactions.
 */
export function scoreEngagement(input: EngagementInput): number {
  assertMagnitude(input.loginsPerMonth, 'engagement.loginsPerMonth');
  assertMagnitude(input.featureUsageCount, 'engagement.featureUsageCount');
  assertMagnitude(input.supportTicketCount, 'engagement.supportTicketCount');

  const loginActivity = saturatingScore(input.loginsPerMonth, 20);
  const featureBreadth = saturatingScore(input.featureUsageCount, 10);
  const ticketQuiet = decayingScore(input.supportTicketCount, 0, 10);

  return toScore(0.5 * loginActivity + 0.3 * featureBreadth + 0.2 * ticketQuiet);
}

/**
 * Contract sub-score (20% of overall).
 *
 * Formula: `0.6 x renewalRunway + 0.2 x accountValue + 0.2 x upgradeMomentum`, where
 * - renewalRunway grows from 0 at renewal day to 100 at 180 days out and
 *   saturates there; a negative `daysUntilRenewal` (contract already lapsed) is
 *   floored at 0 rather than rejected, since that is a real customer state,
 * - accountValue grows linearly to 100 at 100,000 annual value and saturates,
 * - upgradeMomentum is 100 with a recent upgrade, 0 without.
 *
 * Rationale: runway dominates because an imminent renewal is the moment churn
 * actually happens — 180 days is roughly the point beyond which renewal risk
 * stops being actionable this quarter. Value and upgrade momentum are secondary
 * commitment signals: a larger, recently-expanded account is a customer investing
 * in the product, but neither compensates for a renewal that is about to lapse.
 */
export function scoreContract(input: ContractInput): number {
  assertSignedOffset(input.daysUntilRenewal, 'contract.daysUntilRenewal');
  assertMagnitude(input.contractValue, 'contract.contractValue');
  if (typeof input.hasRecentUpgrade !== 'boolean') {
    throw new HealthScoreValidationError('contract.hasRecentUpgrade', 'must be a boolean');
  }

  const renewalRunway = saturatingScore(input.daysUntilRenewal, 180);
  const accountValue = saturatingScore(input.contractValue, 100_000);
  const upgradeMomentum = input.hasRecentUpgrade ? 100 : 0;

  return toScore(0.6 * renewalRunway + 0.2 * accountValue + 0.2 * upgradeMomentum);
}

/**
 * Support sub-score (10% of overall).
 *
 * Formula: `0.5 x satisfaction + 0.3 x responsiveness + 0.2 x stability`, where
 * - satisfaction maps the 1-5 CSAT scale linearly onto 0-100,
 * - responsiveness decays from 100 at instant resolution to 0 at 72 hours,
 * - stability decays from 100 at no escalations to 0 at 5 escalations.
 *
 * Rationale: the customer's own rating is the most direct measure of the support
 * experience, so it leads. Resolution time is the operational driver behind that
 * rating, and escalations capture the tail of cases that went badly even when the
 * average looks acceptable.
 */
export function scoreSupport(input: SupportInput): number {
  assertMagnitude(input.averageResolutionTimeHours, 'support.averageResolutionTimeHours');
  assertInRange(
    input.satisfactionScore,
    'support.satisfactionScore',
    SATISFACTION_MIN,
    SATISFACTION_MAX,
  );
  assertMagnitude(input.escalationCount, 'support.escalationCount');

  const satisfaction =
    ((input.satisfactionScore - SATISFACTION_MIN) / (SATISFACTION_MAX - SATISFACTION_MIN)) * 100;
  const responsiveness = decayingScore(input.averageResolutionTimeHours, 0, 72);
  const stability = decayingScore(input.escalationCount, 0, 5);

  return toScore(0.5 * satisfaction + 0.3 * responsiveness + 0.2 * stability);
}

/**
 * Classify an overall score: critical 0-30, warning 31-70, healthy 71-100.
 * Boundaries are inclusive at the top of each band.
 */
export function classifyRiskLevel(score: number): RiskLevel {
  if (score <= CRITICAL_MAX_SCORE) {
    return 'critical';
  }
  if (score <= WARNING_MAX_SCORE) {
    return 'warning';
  }
  return 'healthy';
}

/**
 * Calculate a customer's overall health score from the four risk factors.
 *
 * Formula: `round(0.4 x payment + 0.3 x engagement + 0.2 x contract + 0.1 x support)`,
 * computed from the already-rounded sub-scores so the overall number always
 * reconciles with the breakdown the user sees.
 *
 * An omitted factor scores `NEUTRAL_SCORE` and is flagged `estimated`, so a
 * customer with no history yet is not penalized as if their history were bad.
 * Malformed values, by contrast, throw `HealthScoreValidationError` rather than
 * producing a plausible-looking but meaningless score.
 */
export function calculateHealthScore(inputs: RiskFactorInputs): HealthScoreResult {
  const breakdown: HealthFactorBreakdown[] = [
    {
      factor: 'payment',
      score: inputs.payment ? scorePaymentHistory(inputs.payment) : NEUTRAL_SCORE,
      weight: FACTOR_WEIGHTS.payment,
      estimated: inputs.payment === undefined,
    },
    {
      factor: 'engagement',
      score: inputs.engagement ? scoreEngagement(inputs.engagement) : NEUTRAL_SCORE,
      weight: FACTOR_WEIGHTS.engagement,
      estimated: inputs.engagement === undefined,
    },
    {
      factor: 'contract',
      score: inputs.contract ? scoreContract(inputs.contract) : NEUTRAL_SCORE,
      weight: FACTOR_WEIGHTS.contract,
      estimated: inputs.contract === undefined,
    },
    {
      factor: 'support',
      score: inputs.support ? scoreSupport(inputs.support) : NEUTRAL_SCORE,
      weight: FACTOR_WEIGHTS.support,
      estimated: inputs.support === undefined,
    },
  ];

  const weightedSum = breakdown.reduce((total, entry) => total + entry.score * entry.weight, 0);
  const score = toScore(weightedSum);

  return { score, riskLevel: classifyRiskLevel(score), breakdown };
}
