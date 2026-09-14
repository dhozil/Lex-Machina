import { useMemo } from "react";

export type NodeState = "healthy" | "halted" | "pending" | "idle";

export interface ConstellationNode {
  id: string;
  state: NodeState;
  label?: string;
}

interface Props {
  nodes: ConstellationNode[];
  size?: number;
  className?: string;
}

const CX = 200;
const CY = 200;
const R = 132;

function nodePos(i: number, count: number) {
  const angle = (i / Math.max(count, 1)) * Math.PI * 2 - Math.PI / 2;
  return {
    x: CX + R * Math.cos(angle),
    y: CY + R * Math.sin(angle),
  };
}

const COLORS: Record<NodeState, string> = {
  healthy: "var(--teal)",
  halted: "var(--ember)",
  pending: "var(--amber)",
  idle: "var(--faint)",
};

/**
 * The signature element: a living "governance constellation".
 * A central Governor node governs the protocol nodes around it, connected by
 * thin lines with a pulse that travels between them. State is reflected in the
 * node colour — teal for healthy, ember for halted.
 */
export default function Constellation({ nodes, size = 420, className }: Props) {
  const positions = useMemo(() => nodes.map((_, i) => nodePos(i, nodes.length)), [nodes]);
  const corePulse = nodes.some((n) => n.state === "pending");

  return (
    <svg
      viewBox="0 0 400 400"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="A governance constellation: a central governor node governing protocol nodes"
      style={{ maxWidth: "100%", height: "auto", display: "block" }}
    >
      {/* connection lines */}
      {positions.map((p, i) => (
        <line
          key={i}
          className="constellation-line"
          x1={CX}
          y1={CY}
          x2={p.x}
          y2={p.y}
          stroke={COLORS[nodes[i].state]}
          strokeOpacity={0.28}
          strokeWidth={1}
        />
      ))}

      {/* traveling pulses (decorative) */}
      {!corePulse &&
        positions.map((_, i) => (
          <circle
            key={`pulse-${i}`}
            r={3}
            fill={COLORS[nodes[i].state]}
            className="constellation-pulse"
            style={{ animationDelay: `${(i / Math.max(nodes.length, 1)) * 2.4}s` }}
          />
        ))}

      {/* protocol nodes */}
      {positions.map((p, i) => {
        const s = nodes[i].state;
        const c = COLORS[s];
        return (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r={11}
              fill="none"
              stroke={c}
              strokeOpacity={0.5}
              strokeWidth={1}
              className="node-ring"
            />
            <circle cx={p.x} cy={p.y} r={9} fill={c} opacity={0.16} />
            <circle cx={p.x} cy={p.y} r={5} fill={c} />
            {nodes[i].label && (
              <text
                x={p.x}
                y={p.y + 22}
                textAnchor="middle"
                fill="var(--muted)"
                fontSize={8}
                fontFamily="var(--font-mono)"
              >
                {nodes[i].label}
              </text>
            )}
          </g>
        );
      })}

      {/* governor core — the golden seal */}
      <g>
        <circle cx={CX} cy={CY} r={58} fill="none" stroke="var(--brass)" strokeOpacity={0.28} strokeWidth={1} strokeDasharray="2 6" className="constellation-line" />
        <circle cx={CX} cy={CY} r={44} fill="none" stroke="var(--brass)" strokeOpacity={0.4} strokeWidth={1} />
        <circle cx={CX} cy={CY} r={30} fill="var(--brass-bright)" opacity={0.14} className={corePulse ? "core-pulse" : undefined} />
        <circle cx={CX} cy={CY} r={18} fill="var(--panel)" stroke="var(--brass)" strokeWidth={1.6} />
        <circle cx={CX} cy={CY} r={7} fill="var(--brass-bright)" />
        <text
          x={CX}
          y={CY - 42}
          textAnchor="middle"
          fill="var(--text)"
          fontSize={11}
          fontWeight={600}
          fontFamily="var(--font-display)"
        >
          GOVERNOR
        </text>
        <text
          x={CX}
          y={CY + 46}
          textAnchor="middle"
          fill="var(--faint)"
          fontSize={8}
          fontFamily="var(--font-mono)"
        >
          self-governing core
        </text>
      </g>
    </svg>
  );
}
