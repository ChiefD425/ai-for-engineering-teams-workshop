'use client';

import { useState } from 'react';
import type { HealthFactorBreakdown, HealthScoreResult, RiskLevel } from '@/lib/healthCalculator';

/**
 * All state this widget renders is supplied by `CustomerHealthMonitoring`; the
 * widget itself neither calculates nor fetches. Exactly one of `loading`,
 * `error`, and `healthResult` drives the output, checked in that order.
 */
export interface CustomerHealthDisplayProps {
  /** Computed by the container; `null` when no customer is selected. */
  healthResult?: HealthScoreResult | null;
  /** True while the container resolves inputs for a newly selected customer. */
  loading?: boolean;
  /** Set when the container's calculation failed; the score is unavailable. */
  error?: string | null;
}

type RiskPresentation = {
  /** Human-readable band name, always rendered as text beside the color. */
  label: string;
  /** Tailwind classes for the score badge. Shades clear WCAG AA against white. */
  badge: string;
  /** Tailwind classes for the color-coded dot. */
  dot: string;
};

/**
 * Single source of truth for score presentation in this widget, keyed on the
 * same thresholds `CustomerCard` uses: red 0-30, yellow 31-70, green 71-100.
 * Driven by the already-classified `RiskLevel` so the color and the calculator's
 * risk band cannot drift apart.
 */
const RISK_PRESENTATION: Record<RiskLevel, RiskPresentation> = {
  critical: { label: 'Critical', badge: 'bg-red-100 text-red-800', dot: 'bg-red-600' },
  warning: { label: 'Warning', badge: 'bg-yellow-100 text-yellow-800', dot: 'bg-yellow-700' },
  healthy: { label: 'Healthy', badge: 'bg-green-100 text-green-800', dot: 'bg-green-700' },
};

/** Display names for the four factors, in the order the breakdown lists them. */
const FACTOR_LABELS: Record<HealthFactorBreakdown['factor'], string> = {
  payment: 'Payment history',
  engagement: 'Engagement',
  contract: 'Contract status',
  support: 'Support satisfaction',
};

function WidgetShell({ children }: { children: React.ReactNode }) {
  return (
    <section
      aria-labelledby="customer-health-heading"
      className="w-full min-w-0 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
    >
      <h2 id="customer-health-heading" className="text-sm font-semibold text-gray-900">
        Customer Health
      </h2>
      {children}
    </section>
  );
}

/**
 * Renders a customer's health score and its factor breakdown.
 *
 * Purely presentational: the score arrives as a prop from
 * `CustomerHealthMonitoring`, which owns the mapping and calls the calculator
 * once per selection, so this widget and the alert rules can never disagree
 * about the number.
 */
export function CustomerHealthDisplay({
  healthResult,
  loading = false,
  error = null,
}: CustomerHealthDisplayProps) {
  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return (
      <WidgetShell>
        <div aria-busy="true" aria-live="polite" className="mt-3 flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700"
          />
          <p className="text-sm text-gray-700">Calculating health score…</p>
        </div>
      </WidgetShell>
    );
  }

  if (error) {
    return (
      <WidgetShell>
        <p role="alert" className="mt-3 text-sm text-red-800">
          Health score unavailable. {error}
        </p>
      </WidgetShell>
    );
  }

  if (!healthResult) {
    return (
      <WidgetShell>
        <p className="mt-3 text-sm text-gray-600">
          Select a customer to see their health score.
        </p>
      </WidgetShell>
    );
  }

  const { score, riskLevel, breakdown } = healthResult;
  const risk = RISK_PRESENTATION[riskLevel];

  return (
    <WidgetShell>
      <div className="mt-3 flex items-center gap-3">
        <span aria-hidden="true" className={`h-3 w-3 shrink-0 rounded-full ${risk.dot}`} />
        <span className={`rounded-full px-3 py-1 text-2xl font-semibold ${risk.badge}`}>
          {score}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">{risk.label}</p>
          <p className="text-xs text-gray-600">out of 100</p>
        </div>
        <span className="sr-only">{`Health score ${score} of 100 (${risk.label})`}</span>
      </div>

      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="customer-health-breakdown"
        onClick={() => setExpanded((isExpanded) => !isExpanded)}
        className="mt-4 rounded text-sm font-medium text-blue-800 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
      >
        {expanded ? 'Hide factor breakdown' : 'Show factor breakdown'}
      </button>

      {expanded && (
        <ul id="customer-health-breakdown" className="mt-3 flex flex-col gap-2 border-t border-gray-200 pt-3">
          {breakdown.map((factor) => (
            <li key={factor.factor} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 text-gray-700">
                {FACTOR_LABELS[factor.factor]}
                <span className="ml-1 text-xs text-gray-500">
                  {`${Math.round(factor.weight * 100)}% weight`}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="font-medium text-gray-900">{factor.score}</span>
                {factor.estimated && (
                  <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs italic text-gray-700">
                    No data — estimated
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </WidgetShell>
  );
}
