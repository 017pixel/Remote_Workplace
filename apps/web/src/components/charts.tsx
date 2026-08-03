/**
 * Diagramm-Bausteine des Dashboards.
 *
 * Alle Diagramme skalieren über `preserveAspectRatio="none"` auf die volle
 * Breite ihres Containers. Damit die Linien dabei nicht verzerren, tragen sie
 * `vector-effect="non-scaling-stroke"`; Beschriftungen stehen deshalb als
 * HTML neben dem SVG und nie darin.
 */

const VIEW_WIDTH = 1000;

export type ChartTone = "accent" | "ok" | "warn" | "bad" | "muted";

const toneColors: Record<ChartTone, string> = {
  accent: "var(--color-accent)",
  ok: "var(--color-ok)",
  warn: "var(--color-warn)",
  bad: "var(--color-bad)",
  muted: "var(--color-faint)",
};

interface Bounds {
  min: number;
  max: number;
}

function bounds(values: readonly number[], fixed?: Bounds): Bounds {
  if (fixed) return fixed;
  const max = Math.max(...values);
  const min = Math.min(...values);
  if (max === min) return { min: min - 1, max: max + 1 };
  const padding = (max - min) * 0.15;
  return { min: min - padding, max: max + padding };
}

function toPath(values: readonly number[], height: number, range: Bounds): string {
  const span = range.max - range.min || 1;
  return values
    .map((value, index) => {
      const x = values.length === 1 ? VIEW_WIDTH : (index / (values.length - 1)) * VIEW_WIDTH;
      const y = height - ((value - range.min) / span) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${Math.max(0, Math.min(height, y)).toFixed(2)}`;
    })
    .join(" ");
}

export function Sparkline({
  values,
  tone = "accent",
  height = 34,
  bounds: fixedBounds,
  className = "",
}: {
  values: readonly number[];
  tone?: ChartTone;
  height?: number;
  bounds?: Bounds;
  className?: string;
}) {
  if (values.length < 2) return <div className={`chart-placeholder ${className}`} style={{ height }} aria-hidden />;

  const range = bounds(values, fixedBounds);
  const line = toPath(values, height, range);
  const area = `${line} L${VIEW_WIDTH},${height} L0,${height} Z`;
  const color = toneColors[tone];

  return (
    <svg
      className={`chart-svg ${className}`}
      viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
      preserveAspectRatio="none"
      style={{ height }}
      aria-hidden
    >
      <path d={area} fill={color} opacity=".07" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export interface ChartSeries {
  id: string;
  label: string;
  values: readonly number[];
  tone: ChartTone;
  /** Formatierter Momentanwert für die Legende. */
  readout: string;
}

/**
 * Mehrreihiges Verlaufsdiagramm mit waagerechtem Raster. Die Achsen­beschriftung
 * liegt als HTML unter dem SVG, damit sie beim Strecken lesbar bleibt.
 */
export function TrendChart({
  series,
  height = 132,
  bounds: fixedBounds,
  axisLabels,
  scaleHint,
  emptyHint = "Messpunkte werden gesammelt",
  gridLines = 4,
}: {
  series: readonly ChartSeries[];
  height?: number;
  bounds?: Bounds;
  axisLabels?: readonly string[];
  scaleHint?: string;
  emptyHint?: string;
  gridLines?: number;
}) {
  const hasData = series.some((item) => item.values.length >= 2);
  const allValues = series.flatMap((item) => [...item.values]);
  const range = bounds(allValues.length ? allValues : [0, 1], fixedBounds);

  return (
    <figure className="chart">
      <figcaption className="chart-legend">
        {series.map((item) => (
          <span key={item.id} className="chart-legend-item">
            <i className={`chart-swatch is-${item.tone}`} aria-hidden />
            {item.label}
            <strong>{item.readout}</strong>
          </span>
        ))}
      </figcaption>
      <div className="chart-plot" style={{ height }}>
        <svg className="chart-svg" viewBox={`0 0 ${VIEW_WIDTH} ${height}`} preserveAspectRatio="none" style={{ height }} aria-hidden>
          {Array.from({ length: gridLines + 1 }, (_, index) => {
            const y = (index / gridLines) * height;
            return (
              <line
                key={index}
                x1="0"
                x2={VIEW_WIDTH}
                y1={y}
                y2={y}
                stroke="var(--color-line)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
          {hasData
            ? series.map((item) =>
                item.values.length < 2 ? null : (
                  <g key={item.id}>
                    <path
                      d={`${toPath(item.values, height, range)} L${VIEW_WIDTH},${height} L0,${height} Z`}
                      fill={toneColors[item.tone]}
                      opacity=".08"
                    />
                    <path
                      d={toPath(item.values, height, range)}
                      fill="none"
                      stroke={toneColors[item.tone]}
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                ),
              )
            : null}
        </svg>
        {hasData ? null : <p className="chart-empty">{emptyHint}</p>}
        {hasData && scaleHint ? <span className="chart-scale">{scaleHint}</span> : null}
      </div>
      {axisLabels?.length ? (
        <div className="chart-axis">
          {axisLabels.map((label, index) => (
            <span key={`${label}-${index}`}>{label}</span>
          ))}
        </div>
      ) : null}
    </figure>
  );
}

/** Schmaler Füllstandsbalken für begrenzte Werte (CPU, RAM, Speicher, Limits). */
export function Meter({ value, tone = "accent", label }: { value: number; tone?: ChartTone; label?: string }) {
  const clamped = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
  return (
    <div
      className="meter"
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <span className={`meter-fill is-${tone}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

/** Wählt die Warnstufe eines prozentualen Wertes. */
export function loadTone(percent: number, warn = 70, bad = 88): ChartTone {
  if (percent >= bad) return "bad";
  if (percent >= warn) return "warn";
  return "ok";
}
