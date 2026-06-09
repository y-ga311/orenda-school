import type { ExamScoreRow } from "@/lib/examResults";

type ExamRadarChartProps = {
  scores: ExamScoreRow[];
  averageScore: number | null;
};

function polarToCartesian(
  center: number,
  radius: number,
  angleRadians: number,
) {
  return {
    x: center + radius * Math.cos(angleRadians),
    y: center + radius * Math.sin(angleRadians),
  };
}

export function ExamRadarChart({ scores, averageScore }: ExamRadarChartProps) {
  const size = 340;
  const center = size / 2;
  const maxRadius = 118;
  const labelRadius = maxRadius + 28;
  const gridLevels = [0.25, 0.5, 0.75, 1];
  const count = scores.length;

  if (count === 0) {
    return (
      <div className="examRadarEmpty">
        <p>表示できる成績がありません。</p>
      </div>
    );
  }

  const polygonPoints = scores
    .map((row, index) => {
      const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
      const radius = (Math.max(0, Math.min(row.score, 100)) / 100) * maxRadius;
      const point = polarToCartesian(center, radius, angle);
      return `${point.x},${point.y}`;
    })
    .join(" ");

  return (
    <div className="examRadarChartWrap">
      <svg
        className="examRadarChart"
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={
          averageScore === null
            ? "科目別成績レーダーチャート"
            : `科目別成績レーダーチャート。平均 ${averageScore} 点`
        }
      >
        {gridLevels.map((level) => (
          <circle
            key={level}
            cx={center}
            cy={center}
            r={maxRadius * level}
            className="examRadarGridRing"
            fill="none"
            stroke="#cbd5e1"
            strokeWidth={1}
          />
        ))}

        <line
          x1={center}
          y1={center - maxRadius}
          x2={center}
          y2={center + maxRadius}
          stroke="#94a3b8"
          strokeWidth={1.5}
        />
        <line
          x1={center - maxRadius}
          y1={center}
          x2={center + maxRadius}
          y2={center}
          stroke="#94a3b8"
          strokeWidth={1.5}
        />

        {scores.map((row, index) => {
          const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
          const axisEnd = polarToCartesian(center, maxRadius, angle);
          const labelPoint = polarToCartesian(center, labelRadius, angle);

          return (
            <g key={row.subjectName}>
              <line
                x1={center}
                y1={center}
                x2={axisEnd.x}
                y2={axisEnd.y}
                stroke="#94a3b8"
                strokeWidth={1}
              />
              <text
                x={labelPoint.x}
                y={labelPoint.y}
                className="examRadarLabel"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {row.subjectName}
              </text>
            </g>
          );
        })}

        <polygon
          points={polygonPoints}
          fill="rgba(59, 130, 246, 0.35)"
          stroke="#2563eb"
          strokeWidth={1.5}
        />

        {averageScore !== null ? (
          <text
            x={center}
            y={center}
            className="examRadarAverage"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {`平均 ${averageScore}`}
          </text>
        ) : null}
      </svg>
    </div>
  );
}
