import type { ExamScoreRow, ExamTrackTotal } from "@/lib/examResults";
import { formatTrackTotalDisplay, getTrackTotalTone } from "@/lib/examResults";

const COHORT_RADAR_FILL = "rgba(134, 239, 172, 0.35)";
const COHORT_RADAR_STROKE = "#86efac";
const FAILED_COHORT_RADAR_FILL = "rgba(251, 146, 60, 0.35)";
const FAILED_COHORT_RADAR_STROKE = "#fb923c";

type ExamRadarChartProps = {
  scores: ExamScoreRow[];
  averageScore: number | null;
  cohortScores?: ExamScoreRow[] | null;
  cohortAverageLabel?: string | null;
  failedCohortScores?: ExamScoreRow[] | null;
  failedCohortAverageLabel?: string | null;
  trackTotals?: {
    acupuncturist: ExamTrackTotal;
    moxibustionist: ExamTrackTotal;
  } | null;
  scoreUnit?: "点" | "%";
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

function shortenSubjectLabel(label: string, count: number) {
  if (count <= 8) {
    return label;
  }

  if (label.length <= 6) {
    return label;
  }

  return label.replace(/（.+）$/, "").slice(0, 5);
}

function TrackTotalCard({ total }: { total: ExamTrackTotal }) {
  const tone = getTrackTotalTone(total.percent);
  const display = formatTrackTotalDisplay(total);
  const hasScore = total.percent !== null && total.questionTotal > 0;

  return (
    <div
      className="examRadarTrackTotalCard"
      style={{
        backgroundColor: tone.boxBackground,
        borderColor: tone.boxBorder,
      }}
    >
      <span className="examRadarTrackLabel">{total.label}</span>
      {hasScore ? (
        <div className="examRadarTrackScoreGroup">
          <strong
            className="examRadarTrackFraction"
            style={{ color: tone.textColor }}
          >
            {total.correctTotal}/{total.questionTotal}
          </strong>
          <span
            className="examRadarTrackPercent"
            style={{ color: tone.textColor }}
          >
            （{total.percent}%）
          </span>
        </div>
      ) : (
        <strong
          className="examRadarTrackValue"
          style={{ color: tone.textColor }}
        >
          {display}
        </strong>
      )}
    </div>
  );
}

export function ExamRadarChart({
  scores,
  averageScore,
  cohortScores = null,
  cohortAverageLabel = null,
  failedCohortScores = null,
  failedCohortAverageLabel = null,
  trackTotals = null,
  scoreUnit = "%",
}: ExamRadarChartProps) {
  const size = 340;
  const center = size / 2;
  const maxRadius = 118;
  const labelRadius = maxRadius + (scores.length > 10 ? 34 : 28);
  const gridLevels = [0.25, 0.5, 0.75, 1];
  const count = scores.length;
  const labelFontSize = count > 12 ? 8 : count > 8 ? 9 : 10;

  if (count === 0 && !trackTotals) {
    return (
      <div className="examRadarEmpty">
        <p>表示できる成績がありません。</p>
      </div>
    );
  }

  const polygonPoints = scores
    .map((row, index) => {
      const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
      const scoreValue = row.score ?? 0;
      const radius = (Math.max(0, Math.min(scoreValue, 100)) / 100) * maxRadius;
      const point = polarToCartesian(center, radius, angle);
      return `${point.x},${point.y}`;
    })
    .join(" ");

  const cohortScoreBySubject = new Map(
    (cohortScores ?? []).map((row) => [row.subjectName, row.score]),
  );
  const hasCohortRadar = scores.some((row) => {
    const cohortScore = cohortScoreBySubject.get(row.subjectName);
    return cohortScore !== null && cohortScore !== undefined;
  });

  const failedCohortScoreBySubject = new Map(
    (failedCohortScores ?? []).map((row) => [row.subjectName, row.score]),
  );
  const hasFailedCohortRadar = (failedCohortScores ?? []).some(
    (row) => row.score !== null && row.score !== undefined,
  );

  const cohortPolygonPoints = scores
    .map((row, index) => {
      const cohortScore = cohortScoreBySubject.get(row.subjectName);
      const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
      const radius =
        cohortScore === null || cohortScore === undefined
          ? 0
          : (Math.max(0, Math.min(cohortScore, 100)) / 100) * maxRadius;
      const point = polarToCartesian(center, radius, angle);
      return `${point.x},${point.y}`;
    })
    .join(" ");

  const failedCohortPolygonPoints = scores
    .map((row, index) => {
      const failedCohortScore = failedCohortScoreBySubject.get(row.subjectName);
      const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
      const radius =
        failedCohortScore === null || failedCohortScore === undefined
          ? 0
          : (Math.max(0, Math.min(failedCohortScore, 100)) / 100) * maxRadius;
      const point = polarToCartesian(center, radius, angle);
      return `${point.x},${point.y}`;
    })
    .join(" ");

  return (
    <div className="examRadarPanel">
      {hasCohortRadar || hasFailedCohortRadar ? (
        <div className="examRadarLegend">
          <span className="examRadarLegendItem">
            <span className="examRadarLegendSwatch examRadarLegendSwatchStudent" />
            本人
          </span>
          {hasCohortRadar ? (
            <span className="examRadarLegendItem">
              <span className="examRadarLegendSwatch examRadarLegendSwatchCohort" />
              {cohortAverageLabel ?? "クラス平均"}
            </span>
          ) : null}
          {hasFailedCohortRadar ? (
            <span className="examRadarLegendItem">
              <span className="examRadarLegendSwatch examRadarLegendSwatchFailedCohort" />
              {failedCohortAverageLabel ?? "国家試験不合格者平均"}
            </span>
          ) : null}
        </div>
      ) : null}
      {trackTotals ? (
        <div className="examRadarTrackTotals">
          <TrackTotalCard total={trackTotals.acupuncturist} />
          <TrackTotalCard total={trackTotals.moxibustionist} />
        </div>
      ) : null}

      {count === 0 ? (
        <div className="examRadarEmpty">
          <p>レーダーチャートに表示できる科目がありません。</p>
        </div>
      ) : (
        <div className="examRadarChartWrap">
          <svg
            className="examRadarChart"
            viewBox={`0 0 ${size} ${size}`}
            role="img"
            aria-label={
              averageScore === null
                ? `科目別成績レーダーチャート`
                : `科目別成績レーダーチャート。平均 ${averageScore}${scoreUnit}`
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

            {[0, 25, 50, 75, 100].map((value) => {
              const y = center - (value / 100) * maxRadius;
              return (
                <text
                  key={value}
                  x={center + 6}
                  y={y + 3}
                  className="examRadarScaleLabel"
                  fontSize={8}
                >
                  {value}
                </text>
              );
            })}

            {scores.map((row, index) => {
              const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
              const axisEnd = polarToCartesian(center, maxRadius, angle);
              const labelPoint = polarToCartesian(center, labelRadius, angle);
              const dataPoint = polarToCartesian(
                center,
                (Math.max(0, Math.min(row.score ?? 0, 100)) / 100) * maxRadius,
                angle,
              );
              const cohortScore = cohortScoreBySubject.get(row.subjectName);
              const cohortPoint =
                cohortScore !== null && cohortScore !== undefined
                  ? polarToCartesian(
                      center,
                      (Math.max(0, Math.min(cohortScore, 100)) / 100) * maxRadius,
                      angle,
                    )
                  : null;
              const failedCohortScore = failedCohortScoreBySubject.get(row.subjectName);
              const failedCohortPoint =
                failedCohortScore !== null && failedCohortScore !== undefined
                  ? polarToCartesian(
                      center,
                      (Math.max(0, Math.min(failedCohortScore, 100)) / 100) * maxRadius,
                      angle,
                    )
                  : null;

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
                  {failedCohortPoint ? (
                    <polygon
                      points={`${failedCohortPoint.x},${failedCohortPoint.y - 4} ${failedCohortPoint.x - 4},${failedCohortPoint.y + 3} ${failedCohortPoint.x + 4},${failedCohortPoint.y + 3}`}
                      fill={FAILED_COHORT_RADAR_STROKE}
                      stroke="#ffffff"
                      strokeWidth={1}
                    />
                  ) : null}
                  {cohortPoint ? (
                    <rect
                      x={cohortPoint.x - 3}
                      y={cohortPoint.y - 3}
                      width={6}
                      height={6}
                      fill={COHORT_RADAR_STROKE}
                      stroke="#ffffff"
                      strokeWidth={1}
                      rx={1}
                    />
                  ) : null}
                  <circle
                    cx={dataPoint.x}
                    cy={dataPoint.y}
                    r={3}
                    fill="#2563eb"
                    stroke="#ffffff"
                    strokeWidth={1}
                  />
                  <text
                    x={labelPoint.x}
                    y={labelPoint.y}
                    className="examRadarLabel"
                    fontSize={labelFontSize}
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {shortenSubjectLabel(row.subjectName, count)}
                  </text>
                </g>
              );
            })}

            {hasFailedCohortRadar ? (
              <polygon
                points={failedCohortPolygonPoints}
                fill={FAILED_COHORT_RADAR_FILL}
                stroke={FAILED_COHORT_RADAR_STROKE}
                strokeWidth={1.5}
                strokeDasharray="2 2"
              />
            ) : null}

            {hasCohortRadar ? (
              <polygon
                points={cohortPolygonPoints}
                fill={COHORT_RADAR_FILL}
                stroke={COHORT_RADAR_STROKE}
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
            ) : null}

            <polygon
              points={polygonPoints}
              fill="rgba(59, 130, 246, 0.35)"
              stroke="#2563eb"
              strokeWidth={1.5}
            />

            {!trackTotals && averageScore !== null ? (
              <text
                x={center}
                y={center}
                className="examRadarAverage"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {`平均 ${averageScore}${scoreUnit}`}
              </text>
            ) : null}
          </svg>
        </div>
      )}
    </div>
  );
}
