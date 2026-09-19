interface ChangeLineProps {
  current: unknown;
  previous: unknown;
  comparisonLabel: string;
  /** Green up / red down. Neutral tiles (Buying, Expenses) stay muted. */
  colored?: boolean;
}

export function ChangeLine({ current, previous, comparisonLabel, colored }: ChangeLineProps) {
  const now = Number(current || 0);
  const before = Number(previous || 0);

  if (before === 0) {
    if (now === 0) return null;
    return <p className="text-xs text-muted-foreground mt-1">new vs {comparisonLabel}</p>;
  }

  const pct = ((now - before) / Math.abs(before)) * 100;
  const up = pct >= 0;
  const arrow = up ? "▲" : "▼";
  const colorClass = colored
    ? up
      ? "metric-positive"
      : "metric-negative"
    : "text-muted-foreground";

  return (
    <p className={`text-xs mt-1 ${colorClass}`}>
      {arrow} {Math.abs(Math.round(pct))}% vs {comparisonLabel}
    </p>
  );
}
