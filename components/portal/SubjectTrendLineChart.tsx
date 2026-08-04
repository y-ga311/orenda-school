"use client";

import { formatSubjectTrendCohortAverageLabel, type SubjectTrendPoint } from "@/lib/subjectTrend";
import { ChartLegendToggleButton, useChartLegendToggle } from "@/lib/chartLegendToggle";

const REGULAR_COLOR = "#2563eb";
const MOCK_COLOR = "#ea580c";
const STUDENT_LINE_COLOR = "#94a3b8";
const COHORT_AVERAGE_LINE_COLOR = "#86efac";
const FAILED_COHORT_AVERAGE_LINE_COLOR = "#fb923c";
const PASSED_COHORT_AVERAGE_LINE_COLOR = "#a78bfa";

function formatAxisLabel(point: SubjectTrendPoint) {
  if (point.examDateLabel) {
    return point.examDateLabel.replace(/年/g, "/").replace(/月/g, "/").replace(/日/g, "");
  }
  return point.sessionLabel.replace("（定期）", "").replace("（模擬）", "").replace("/", "");
}

function buildConnectedPath(
  points: SubjectTrendPoint[],
  toX: (index: number) => number,
  toY: (value: number) => number,
  getValue: (point: SubjectTrendPoint) => number | null = (point) => point.chartValue,
  options: { skipNotTaken?: boolean } = {},
) {
  const segments: string[] = [];
  let currentSegment: string[] = [];

  points.forEach((point, index) => {
    const value = getValue(point);
    if (value === null || (options.skipNotTaken !== false && point.notTaken)) {
      if (currentSegment.length > 0) {
        segments.push(currentSegment.join(" "));
        currentSegment = [];
      }
      return;
    }

    const x = toX(index);
    const y = toY(value);
    if (currentSegment.length === 0) {
      currentSegment.push(`M${x},${y}`);
    } else {
      currentSegment.push(`L${x},${y}`);
    }
  });

  if (currentSegment.length > 0) {
    segments.push(currentSegment.join(" "));
  }

  return segments;
}

export function SubjectTrendLineChart({
  points,
  cohortAverageLabel,
  failedCohortAverageLabel,
  passedCohortAverageLabel,
}: {
  points: SubjectTrendPoint[];
  cohortAverageLabel: string | null;
  failedCohortAverageLabel: string | null;
  passedCohortAverageLabel: string | null;
}) {
  const { isVisible, toggle } = useChartLegendToggle();
  const showRegular = isVisible("regular");
  const showMock = isVisible("mock");
  const showStudent = isVisible("student");
  const showCohort = isVisible("cohort");
  const showPassed = isVisible("passed");
  const showFailed = isVisible("failed");

  const chartPoints = points.filter((point) => !point.notTaken && point.chartValue !== null);
  const pointSpacing = 72;
  const width = Math.max(720, chartPoints.length * pointSpacing);
  const height = 300;
  const padding = { top: 24, right: 24, bottom: 72, left: 44 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  if (chartPoints.length === 0) {
    return (
      <div className="subjectTrendChartEmpty">
        <p>表示できる推移データがありません。</p>
      </div>
    );
  }

  const xStep = points.length > 1 ? chartWidth / (points.length - 1) : 0;
  const toX = (index: number) => padding.left + index * xStep;
  const toY = (value: number) =>
    padding.top + chartHeight - (Math.max(0, Math.min(value, 100)) / 100) * chartHeight;

  const connectedPaths = showStudent
    ? buildConnectedPath(
        points,
        toX,
        toY,
        (point) => {
          if (!showRegular && point.sourceType === "regular") {
            return null;
          }
          if (!showMock && point.sourceType === "mock") {
            return null;
          }
          return point.chartValue;
        },
        { skipNotTaken: true },
      )
    : [];
  const cohortAveragePaths = showCohort
    ? buildConnectedPath(points, toX, toY, (point) => point.cohortAverage, {
        skipNotTaken: false,
      })
    : [];
  const failedCohortAveragePaths = showFailed
    ? buildConnectedPath(points, toX, toY, (point) => point.failedCohortAverage, {
        skipNotTaken: false,
      })
    : [];
  const passedCohortAveragePaths = showPassed
    ? buildConnectedPath(points, toX, toY, (point) => point.passedCohortAverage, {
        skipNotTaken: false,
      })
    : [];
  const hasCohortAverage = points.some((point) => point.cohortAverage !== null);
  const hasFailedCohortAverage = points.some((point) => point.failedCohortAverage !== null);
  const hasPassedCohortAverage = points.some((point) => point.passedCohortAverage !== null);

  return (
    <div className="subjectTrendChartWrap">
      <div className="subjectTrendLegend">
        <ChartLegendToggleButton
          seriesKey="regular"
          isVisible={isVisible}
          onToggle={toggle}
          className="subjectTrendLegendItem chartLegendToggleButton"
        >
          <span className="subjectTrendLegendDot" style={{ backgroundColor: REGULAR_COLOR }} />
          定期（点）
        </ChartLegendToggleButton>
        <ChartLegendToggleButton
          seriesKey="mock"
          isVisible={isVisible}
          onToggle={toggle}
          className="subjectTrendLegendItem chartLegendToggleButton"
        >
          <span className="subjectTrendLegendDot" style={{ backgroundColor: MOCK_COLOR }} />
          模擬（%）
        </ChartLegendToggleButton>
        <ChartLegendToggleButton
          seriesKey="student"
          isVisible={isVisible}
          onToggle={toggle}
          className="subjectTrendLegendItem chartLegendToggleButton"
        >
          <span
            className="subjectTrendLegendLine subjectTrendLegendLineStudent"
            aria-hidden="true"
          />
          本人
        </ChartLegendToggleButton>
        {hasCohortAverage ? (
          <ChartLegendToggleButton
            seriesKey="cohort"
            isVisible={isVisible}
            onToggle={toggle}
            className="subjectTrendLegendItem chartLegendToggleButton"
          >
            <span
              className="subjectTrendLegendLine subjectTrendLegendLineCohort"
              aria-hidden="true"
            />
            {cohortAverageLabel ?? "クラスメイト平均"}
          </ChartLegendToggleButton>
        ) : null}
        {hasPassedCohortAverage ? (
          <ChartLegendToggleButton
            seriesKey="passed"
            isVisible={isVisible}
            onToggle={toggle}
            className="subjectTrendLegendItem chartLegendToggleButton"
          >
            <span
              className="subjectTrendLegendLine subjectTrendLegendLinePassedCohort"
              aria-hidden="true"
            />
            {passedCohortAverageLabel ?? "国家試験合格者平均"}
          </ChartLegendToggleButton>
        ) : null}
        {hasFailedCohortAverage ? (
          <ChartLegendToggleButton
            seriesKey="failed"
            isVisible={isVisible}
            onToggle={toggle}
            className="subjectTrendLegendItem chartLegendToggleButton"
          >
            <span
              className="subjectTrendLegendLine subjectTrendLegendLineFailedCohort"
              aria-hidden="true"
            />
            {failedCohortAverageLabel ?? "国家試験不合格者平均"}
          </ChartLegendToggleButton>
        ) : null}
      </div>
      <svg
        className="subjectTrendChart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="科目別成績推移グラフ（日程順）"
      >
        {[0, 25, 50, 75, 100].map((value) => {
          const y = toY(value);
          return (
            <g key={value}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#e2e8f0"
                strokeWidth={1}
              />
              <text x={8} y={y + 4} className="subjectTrendChartScale" fontSize={11}>
                {value}
              </text>
            </g>
          );
        })}

        <line
          x1={padding.left}
          y1={toY(60)}
          x2={width - padding.right}
          y2={toY(60)}
          stroke="#dc2626"
          strokeWidth={1}
        />
        <text
          x={width - padding.right + 4}
          y={toY(60) + 4}
          className="subjectTrendChartPassLineLabel"
          fontSize={10}
        >
          60
        </text>

        {connectedPaths.map((path, index) => (
          <path
            key={`trend-line-${index}`}
            d={path}
            fill="none"
            stroke={STUDENT_LINE_COLOR}
            strokeWidth={1.5}
          />
        ))}

        {cohortAveragePaths.map((path, index) => (
          <path
            key={`cohort-line-${index}`}
            d={path}
            fill="none"
            stroke={COHORT_AVERAGE_LINE_COLOR}
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        ))}

        {passedCohortAveragePaths.map((path, index) => (
          <path
            key={`passed-cohort-line-${index}`}
            d={path}
            fill="none"
            stroke={PASSED_COHORT_AVERAGE_LINE_COLOR}
            strokeWidth={1.5}
            strokeDasharray="6 3"
          />
        ))}

        {failedCohortAveragePaths.map((path, index) => (
          <path
            key={`failed-cohort-line-${index}`}
            d={path}
            fill="none"
            stroke={FAILED_COHORT_AVERAGE_LINE_COLOR}
            strokeWidth={1.5}
            strokeDasharray="2 2"
          />
        ))}

        {points.map((point, index) => {
          if (point.notTaken || point.chartValue === null) {
            return null;
          }

          const isStudentPointVisible =
            showStudent &&
            (showRegular || point.sourceType !== "regular") &&
            (showMock || point.sourceType !== "mock");
          const hasVisibleOverlay =
            (showCohort && point.cohortAverage !== null) ||
            (showPassed && point.passedCohortAverage !== null) ||
            (showFailed && point.failedCohortAverage !== null);

          if (!isStudentPointVisible && !hasVisibleOverlay) {
            return null;
          }

          const x = toX(index);
          const y = toY(point.chartValue);
          const color = point.sourceType === "regular" ? REGULAR_COLOR : MOCK_COLOR;
          const axisLabel = formatAxisLabel(point);
          const radius = point.sourceType === "regular" ? 6.5 : 5.5;
          const cohortY = point.cohortAverage !== null ? toY(point.cohortAverage) : null;
          const failedCohortY =
            point.failedCohortAverage !== null ? toY(point.failedCohortAverage) : null;
          const passedCohortY =
            point.passedCohortAverage !== null ? toY(point.passedCohortAverage) : null;

          return (
            <g key={point.sessionKey}>
              {showPassed && passedCohortY !== null ? (
                <circle
                  cx={x}
                  cy={passedCohortY}
                  r={4}
                  fill="none"
                  stroke={PASSED_COHORT_AVERAGE_LINE_COLOR}
                  strokeWidth={2}
                >
                  <title>
                    {passedCohortAverageLabel ?? "国家試験合格者平均"}:{" "}
                    {formatSubjectTrendCohortAverageLabel(
                      point.passedCohortAverage!,
                      point.sourceType,
                    )}
                  </title>
                </circle>
              ) : null}
              {showFailed && failedCohortY !== null ? (
                <polygon
                  points={`${x - 4},${failedCohortY + 4} ${x + 4},${failedCohortY + 4} ${x},${failedCohortY - 4}`}
                  fill={FAILED_COHORT_AVERAGE_LINE_COLOR}
                  stroke="#ffffff"
                  strokeWidth={1.5}
                >
                  <title>
                    {failedCohortAverageLabel ?? "国家試験不合格者平均"}:{" "}
                    {formatSubjectTrendCohortAverageLabel(
                      point.failedCohortAverage!,
                      point.sourceType,
                    )}
                  </title>
                </polygon>
              ) : null}
              {showCohort && cohortY !== null ? (
                <rect
                  x={x - 4}
                  y={cohortY - 4}
                  width={8}
                  height={8}
                  fill={COHORT_AVERAGE_LINE_COLOR}
                  stroke="#ffffff"
                  strokeWidth={1.5}
                  rx={1}
                >
                  <title>
                    {cohortAverageLabel ?? "同期平均"}:{" "}
                    {formatSubjectTrendCohortAverageLabel(point.cohortAverage!, point.sourceType)}
                  </title>
                </rect>
              ) : null}
              {isStudentPointVisible ? (
                <circle cx={x} cy={y} r={radius} fill={color} stroke="#ffffff" strokeWidth={2} />
              ) : null}
              <text
                x={x}
                y={height - 42}
                textAnchor="middle"
                className="subjectTrendChartAxisLabel"
                fontSize={9}
              >
                {axisLabel.length > 10 ? `${axisLabel.slice(0, 10)}…` : axisLabel}
              </text>
              <text
                x={x}
                y={height - 28}
                textAnchor="middle"
                className="subjectTrendChartAxisSubLabel"
                fontSize={8}
              >
                {point.sourceType === "regular" ? "定期" : "模擬"}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
