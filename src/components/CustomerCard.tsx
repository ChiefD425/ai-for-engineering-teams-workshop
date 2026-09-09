'use client';

import type { Customer } from '@/data/mock-customers';

export interface CustomerCardProps {
  customer: Customer;
  selected?: boolean;
  onSelect?: (customerId: string) => void;
}

type HealthLevel = {
  /**
   * Tailwind classes tinting the whole card body and its border from the health
   * score. Uses the `-50`/`-200` shades so the tint stays light enough for the
   * card's text and the health dot to keep their AA contrast ratios.
   */
  card: string;
  /**
   * Tailwind classes for the color-coded health dot. Shades are chosen to clear
   * WCAG AA 3:1 against the tinted card background, per `accessibility-spec.md`.
   */
  dot: string;
  /** Tailwind classes for the health score badge */
  badge: string;
  label: string;
};

/**
 * Single source of truth for the health-score thresholds:
 * red 0-30, yellow 31-70, green 71-100. Scores outside 0-100 are
 * clamped so every value maps to a defined color.
 */
function getHealthLevel(healthScore: number): HealthLevel {
  const score = Math.min(100, Math.max(0, healthScore));

  if (score <= 30) {
    return {
      card: 'border-red-200 bg-red-50',
      dot: 'bg-red-600',
      badge: 'bg-red-100 text-red-800',
      label: 'Poor',
    };
  }

  if (score <= 70) {
    return {
      card: 'border-yellow-200 bg-yellow-50',
      dot: 'bg-yellow-700',
      badge: 'bg-yellow-100 text-yellow-800',
      label: 'Moderate',
    };
  }

  return {
    card: 'border-green-200 bg-green-50',
    dot: 'bg-green-700',
    badge: 'bg-green-100 text-green-800',
    label: 'Good',
  };
}

export function CustomerCard({ customer, selected = false, onSelect }: CustomerCardProps) {
  const { id, name, company, healthScore, domains } = customer;
  const health = getHealthLevel(healthScore);
  const domainList = domains ?? [];
  const isInteractive = onSelect !== undefined;

  const className = [
    'h-full w-full min-w-0 max-w-sm rounded-lg border p-4 text-left transition-colors',
    // Health score owns the card background; selection is carried by a ring so
    // both signals stay readable at the same time.
    health.card,
    selected ? 'border-blue-600 ring-2 ring-blue-600 shadow-md' : 'shadow-sm',
    isInteractive
      ? 'cursor-pointer hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700'
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <div className="flex flex-col gap-3">
      {/* Name + company + health score */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-gray-900 sm:text-lg">{name}</h3>
          <p className="truncate text-sm text-gray-700">{company}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${health.dot}`} />
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${health.badge}`}>
            {healthScore}
          </span>
          <span className="sr-only">{`Health score ${healthScore} of 100 (${health.label})`}</span>
        </div>
      </div>

      {/* Domain information */}
      {domainList.length > 0 && (
        <div className="min-w-0 border-t border-black/10 pt-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-600">
              Domains
            </span>
            {domainList.length > 1 && (
              <span className="shrink-0 text-xs text-gray-600">{domainList.length} domains</span>
            )}
          </div>
          <ul className="flex min-h-8 min-w-0 flex-wrap content-start gap-1.5">
            {domainList.map((domain) => (
              <li
                key={domain}
                className="max-w-full truncate rounded bg-white/70 px-2 py-0.5 text-xs text-gray-700"
              >
                {domain}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  if (!onSelect) {
    return <div className={className}>{content}</div>;
  }

  return (
    <button type="button" aria-pressed={selected} className={className} onClick={() => onSelect(id)}>
      {content}
    </button>
  );
}

export default CustomerCard;
