import type { ReactNode } from "react";

type Tone = "teal" | "ember" | "amber" | "violet" | "muted";

export default function StatusPill({
  tone,
  children,
  pulse = false,
}: {
  tone: Tone;
  children: ReactNode;
  pulse?: boolean;
}) {
  return (
    <span className={`pill pill-${tone === "muted" ? "" : tone}`}>
      <span className="dot" style={pulse ? { animation: "pulse-dot 1.6s ease-in-out infinite" } : undefined} />
      {children}
    </span>
  );
}
