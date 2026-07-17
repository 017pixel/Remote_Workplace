import type { ReactNode } from "react";

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Lädt"
      className={`inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink-600 border-t-accent ${className}`}
    />
  );
}

const stateStyles: Record<string, string> = {
  active: "bg-ok border-ok/40",
  inactive: "bg-ink-600 border-ink-500",
  error: "bg-bad border-bad/40",
  unknown: "bg-warn border-warn/40",
  checking: "bg-accent border-accent/40 animate-pulse",
};

export function StateDot({ state, pulse = false }: { state: string; pulse?: boolean }) {
  const style = stateStyles[state] ?? stateStyles.unknown!;
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full border ${style} ${pulse && state === "checking" ? "" : ""}`}
      aria-hidden
    />
  );
}

export function Badge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "ok" | "warn" | "bad" | "accent";
}) {
  const tones: Record<string, string> = {
    default: "bg-ink-800 text-muted border-ink-700",
    ok: "bg-ok-soft text-ok border-ok/30",
    warn: "bg-warn-soft text-warn border-warn/30",
    bad: "bg-bad-soft text-bad border-bad/30",
    accent: "bg-accent-soft text-accent border-accent-line",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium leading-none ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
