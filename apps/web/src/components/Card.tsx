import type { ReactNode } from "react";

export function Card({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`document-section ${className}`}>
      {(title || action) ? (
        <header className="section-heading">
          <div>
            {title ? <h2 className="section-title">{title}</h2> : null}
            {subtitle ? <p className="section-subtitle">{subtitle}</p> : null}
          </div>
          {action}
        </header>
      ) : null}
      <div>{children}</div>
    </section>
  );
}

export function MetricBar({ value, tone = "accent" }: { value: number; tone?: "accent" | "ok" | "warn" | "bad" }) {
  const tones: Record<string, string> = {
    accent: "bg-accent",
    ok: "bg-ok",
    warn: "bg-warn",
    bad: "bg-bad",
  };
  return (
    <div className="h-1 w-full overflow-hidden rounded-sm bg-ink-800">
      <div className={`h-full rounded-sm ${tones[tone]}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
