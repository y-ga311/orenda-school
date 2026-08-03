"use client";

import { useEffect, useMemo, useState } from "react";
import { PortalLoadingOverlay } from "@/components/portal/PortalLoadingOverlay";
import type { StudentRow } from "@/components/portal/LearningTimeView";
import {
  formatSubjectTrendCohortAverageLabel,
  type SubjectTrendData,
  type SubjectTrendPoint,
} from "@/lib/subjectTrend";

type SubjectTrendViewProps = {
  students: StudentRow[];
};

type SubjectTrendResponse = SubjectTrendData & {
  subjectOptions: string[];
  selectedSubjectName: string;
  message?: string;
};

const REGULAR_COLOR = "#2563eb";
const MOCK_COLOR = "#ea580c";
const STUDENT_LINE_COLOR = "#94a3b8";
const COHORT_AVERAGE_LINE_COLOR = "#86efac";
const FAILED_COHORT_AVERAGE_LINE_COLOR = "#fb923c";

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

function SubjectTrendLineChart({
  points,
  cohortAverageLabel,
  failedCohortAverageLabel,
}: {
  points: SubjectTrendPoint[];
  cohortAverageLabel: string | null;
  failedCohortAverageLabel: string | null;
}) {
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

  const connectedPaths = buildConnectedPath(points, toX, toY, undefined, {
    skipNotTaken: true,
  });
  const cohortAveragePaths = buildConnectedPath(
    points,
    toX,
    toY,
    (point) => point.cohortAverage,
    { skipNotTaken: false },
  );
  const failedCohortAveragePaths = buildConnectedPath(
    points,
    toX,
    toY,
    (point) => point.failedCohortAverage,
    { skipNotTaken: false },
  );
  const hasCohortAverage = points.some((point) => point.cohortAverage !== null);
  const hasFailedCohortAverage = points.some(
    (point) => point.failedCohortAverage !== null,
  );

  return (
    <div className="subjectTrendChartWrap">
      <div className="subjectTrendLegend">
        <span className="subjectTrendLegendItem">
          <span className="subjectTrendLegendDot" style={{ backgroundColor: REGULAR_COLOR }} />
          定期（点）
        </span>
        <span className="subjectTrendLegendItem">
          <span className="subjectTrendLegendDot" style={{ backgroundColor: MOCK_COLOR }} />
          模擬（%）
        </span>
        <span className="subjectTrendLegendItem">
          <span
            className="subjectTrendLegendLine subjectTrendLegendLineStudent"
            aria-hidden="true"
          />
          本人
        </span>
        {hasCohortAverage ? (
          <span className="subjectTrendLegendItem">
            <span
              className="subjectTrendLegendLine subjectTrendLegendLineCohort"
              aria-hidden="true"
            />
            {cohortAverageLabel ?? "クラスメイト平均"}
          </span>
        ) : null}
        {hasFailedCohortAverage ? (
          <span className="subjectTrendLegendItem">
            <span
              className="subjectTrendLegendLine subjectTrendLegendLineFailedCohort"
              aria-hidden="true"
            />
            {failedCohortAverageLabel ?? "国家試験不合格者平均"}
          </span>
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
          const x = toX(index);
          const y = toY(point.chartValue);
          const color = point.sourceType === "regular" ? REGULAR_COLOR : MOCK_COLOR;
          const axisLabel = formatAxisLabel(point);
          const radius = point.sourceType === "regular" ? 6.5 : 5.5;
          const cohortY =
            point.cohortAverage !== null ? toY(point.cohortAverage) : null;
          const failedCohortY =
            point.failedCohortAverage !== null ? toY(point.failedCohortAverage) : null;

          return (
            <g key={point.sessionKey}>
              {failedCohortY !== null ? (
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
              {cohortY !== null ? (
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
              <circle cx={x} cy={y} r={radius} fill={color} stroke="#ffffff" strokeWidth={2} />
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

export function SubjectTrendView({ students }: SubjectTrendViewProps) {
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [classFilter, setClassFilter] = useState("all");
  const [selectedGakuseiId, setSelectedGakuseiId] = useState(
    students[0]?.gakusei_id ?? "",
  );
  const [subjectName, setSubjectName] = useState("");
  const [data, setData] = useState<SubjectTrendResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const classFilterOptions = useMemo(() => {
    const classes = new Map<string, string>();
    let hasUnset = false;

    students.forEach((student) => {
      const trimmed = student.class?.trim();
      if (trimmed) {
        classes.set(trimmed, trimmed);
      } else {
        hasUnset = true;
      }
    });

    const options = [{ value: "all", label: "全て" }];
    [...classes.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], "ja"))
      .forEach(([value, label]) => {
        options.push({ value, label });
      });

    if (hasUnset) {
      options.push({ value: "__unset__", label: "クラス未設定" });
    }

    return options;
  }, [students]);

  const filteredStudents = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const list = students.filter((student) => {
      if (classFilter !== "all") {
        const trimmedClass = student.class?.trim();
        if (classFilter === "__unset__") {
          if (trimmedClass) {
            return false;
          }
        } else if (trimmedClass !== classFilter) {
          return false;
        }
      }

      if (!keyword) {
        return true;
      }

      return [student.name, student.gakusei_id, student.class ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });

    return list.sort((a, b) => {
      const result = a.name.localeCompare(b.name, "ja");
      return sortOrder === "asc" ? result : -result;
    });
  }, [classFilter, search, sortOrder, students]);

  const selectedStudent =
    students.find((student) => student.gakusei_id === selectedGakuseiId) ?? null;

  useEffect(() => {
    if (filteredStudents.length === 0) {
      setSelectedGakuseiId("");
      return;
    }

    const stillVisible = filteredStudents.some(
      (student) => student.gakusei_id === selectedGakuseiId,
    );
    if (!stillVisible) {
      setSelectedGakuseiId(filteredStudents[0].gakusei_id);
    }
  }, [filteredStudents, selectedGakuseiId]);

  useEffect(() => {
    setSubjectName("");
  }, [selectedGakuseiId]);

  useEffect(() => {
    if (!selectedGakuseiId) {
      setData(null);
      return;
    }

    let cancelled = false;

    async function loadTrend() {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams({
        gakuseiId: selectedGakuseiId,
      });
      if (subjectName) {
        params.set("subjectName", subjectName);
      }

      try {
        const response = await fetch(`/api/subject-trend?${params.toString()}`);
        const payload = (await response.json()) as SubjectTrendResponse;

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setError(payload.message ?? "科目別推移の取得に失敗しました。");
          setData(null);
          return;
        }

        setData(payload);
        if (!subjectName && payload.selectedSubjectName) {
          setSubjectName(payload.selectedSubjectName);
        }
      } catch {
        if (!cancelled) {
          setError("科目別推移の取得に失敗しました。");
          setData(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadTrend();

    return () => {
      cancelled = true;
    };
  }, [selectedGakuseiId, subjectName]);

  const subjectOptions = data?.subjectOptions ?? [];
  const currentSubject = subjectName || data?.selectedSubjectName || subjectOptions[0] || "";

  return (
    <div className="learningTimePage">
      <header className="learningTimeHeader">
        <div>
          <h1 className="learningTimeTitle">科目別推移</h1>
        </div>
      </header>

      <div className="learningTimeWorkspace">
        <section className="learningTimeStudentList">
          <h2 className="learningTimeCardTitle">学生一覧</h2>
          <input
            className="learningTimeSearch"
            type="search"
            placeholder="検索: 氏名 / 学籍番号 / クラス"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="learningTimeFilterRow">
            <label className="learningTimeSelectWrap">
              <span className="learningTimeSelectLabel">絞り込み</span>
              <select
                className="learningTimeSelect"
                value={classFilter}
                onChange={(event) => setClassFilter(event.target.value)}
              >
                {classFilterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="learningTimeSelectWrap">
              <span className="learningTimeSelectLabel">並び替え</span>
              <select
                className="learningTimeSelect"
                value={sortOrder}
                onChange={(event) =>
                  setSortOrder(event.target.value as "asc" | "desc")
                }
              >
                <option value="asc">氏名（昇順）</option>
                <option value="desc">氏名（降順）</option>
              </select>
            </label>
          </div>

          <div className="learningTimeStudentRows">
            {filteredStudents.length === 0 ? (
              <p className="learningTimeEmpty">該当する学生がいません。</p>
            ) : (
              filteredStudents.map((student) => {
                const isSelected = student.gakusei_id === selectedGakuseiId;
                return (
                  <button
                    key={student.gakusei_id}
                    type="button"
                    className={`learningTimeStudentRow${isSelected ? " learningTimeStudentRowSelected" : ""}`}
                    onClick={() => setSelectedGakuseiId(student.gakusei_id)}
                  >
                    <span className="learningTimeStudentRowText">{student.name}</span>
                    <span className="learningTimeStudentRowBtn">詳細</span>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="learningTimeDetail subjectTrendPanel">
          <PortalLoadingOverlay active={isLoading} />
          {!selectedStudent ? (
            <div className="learningTimeEmptyPanel">学生を選択してください。</div>
          ) : (
            <>
              <div className="subjectTrendHeader">
                <div>
                  <h2 className="examDetailName">{selectedStudent.name}</h2>
                  <p className="examDetailMeta">
                    {selectedStudent.class ?? "クラス未設定"} · 科目別推移
                  </p>
                </div>
                <div className="subjectTrendFilters">
                  <label className="examSessionSelectWrap">
                    <select
                      className="examSessionSelect"
                      value={currentSubject}
                      onChange={(event) => setSubjectName(event.target.value)}
                      aria-label="科目"
                    >
                      {subjectOptions.map((subject) => (
                        <option key={subject} value={subject}>
                          {subject}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              {error ? <p className="loginError">{error}</p> : null}

              {data?.summary.cohortMissing ? (
                <p className="examScoreNotice">
                  所属クラスから期を特定できません（例: 25期生昼間部）。定期試験の実施日を反映するにはクラス名に「25期」形式を含めてください。
                </p>
              ) : null}

              {data?.summary.hasUndatedRegularExams ? (
                <p className="examScoreNotice">
                  {data.summary.cohortLabel
                    ? `${data.summary.cohortLabel}の定期試験に実施日が未設定の学期があります。`
                    : "一部の定期試験に実施日が未設定です。"}
                  試験設定の「定期試験」タブで期ごとに実施日を設定すると日程順に並びます。
                </p>
              ) : null}

              <div className="subjectTrendSummaryRow">
                <div className="subjectTrendSummaryCard">
                  <span className="subjectTrendSummaryLabel">最新</span>
                  <strong className="subjectTrendSummaryValue">
                    {data?.summary.latestDisplay ?? "—"}
                  </strong>
                </div>
                <div className="subjectTrendSummaryCard">
                  <span className="subjectTrendSummaryLabel">前回比</span>
                  <strong className="subjectTrendSummaryValue">
                    {data?.summary.deltaDisplay ?? "—"}
                  </strong>
                </div>
                <div className="subjectTrendSummaryCard">
                  <span className="subjectTrendSummaryLabel">データ点数</span>
                  <strong className="subjectTrendSummaryValue">
                    {data?.summary.dataPointCount ?? 0}
                  </strong>
                </div>
              </div>

              <section className="subjectTrendChartSection">
                <h3 className="examScoreSectionTitle">成績推移（日程順）</h3>
                <p className="subjectTrendChartSubject">{currentSubject}</p>
                <SubjectTrendLineChart
                  points={data?.points ?? []}
                  cohortAverageLabel={data?.cohortAverageLabel ?? null}
                  failedCohortAverageLabel={data?.failedCohortAverageLabel ?? null}
                />
              </section>

              <section className="subjectTrendTableSection">
                <h3 className="examScoreSectionTitle">試験別スコア一覧</h3>
                <div className="subjectTrendTableWrap">
                  <table className="subjectTrendTable">
                    <thead>
                      <tr>
                        <th>実施日</th>
                        <th>試験</th>
                        <th>種別</th>
                        <th>成績</th>
                        <th>前回比</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.points ?? []).map((point, index, rows) => {
                        const previous = rows
                          .slice(0, index)
                          .reverse()
                          .find((item) => !item.notTaken && item.chartValue !== null);
                        const delta =
                          point.chartValue !== null &&
                          previous?.chartValue !== null &&
                          previous?.chartValue !== undefined
                            ? point.chartValue - previous.chartValue
                            : null;
                        const deltaLabel =
                          delta === null ? "—" : delta > 0 ? `+${delta}` : `${delta}`;

                        return (
                          <tr key={point.sessionKey}>
                            <td>{point.examDateLabel ?? "未設定"}</td>
                            <td>{point.sessionLabel}</td>
                            <td>{point.sourceType === "regular" ? "定期" : "模擬"}</td>
                            <td>{point.displayValue}</td>
                            <td>{deltaLabel}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
