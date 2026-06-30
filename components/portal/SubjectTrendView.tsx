"use client";

import { useEffect, useMemo, useState } from "react";
import { PortalLoadingOverlay } from "@/components/portal/PortalLoadingOverlay";
import type { StudentRow } from "@/components/portal/LearningTimeView";
import type { SubjectTrendData, SubjectTrendExamType } from "@/lib/subjectTrend";

type SubjectTrendViewProps = {
  students: StudentRow[];
};

type SubjectTrendResponse = SubjectTrendData & {
  subjectOptions: string[];
  selectedSubjectName: string;
  message?: string;
};

function SubjectTrendLineChart({
  points,
  scoreFormat,
}: {
  points: SubjectTrendData["points"];
  scoreFormat: "points" | "percent";
}) {
  const width = 720;
  const height = 280;
  const padding = { top: 24, right: 24, bottom: 56, left: 44 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const takenPoints = points.filter((point) => !point.notTaken && point.chartValue !== null);

  if (takenPoints.length === 0) {
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

  const linePath = points
    .map((point, index) => {
      if (point.notTaken || point.chartValue === null) {
        return null;
      }
      const command = index === 0 || points[index - 1]?.notTaken ? "M" : "L";
      return `${command}${toX(index)},${toY(point.chartValue)}`;
    })
    .filter(Boolean)
    .join(" ");

  return (
    <div className="subjectTrendChartWrap">
      <svg
        className="subjectTrendChart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${scoreFormat === "points" ? "得点" : "得点率"}推移グラフ`}
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

        {linePath ? (
          <path d={linePath} fill="none" stroke="#2563eb" strokeWidth={2.5} />
        ) : null}

        {points.map((point, index) => {
          if (point.notTaken || point.chartValue === null) {
            return null;
          }
          const x = toX(index);
          const y = toY(point.chartValue);
          return (
            <g key={point.sessionKey}>
              <circle cx={x} cy={y} r={4.5} fill="#2563eb" stroke="#ffffff" strokeWidth={1.5} />
              <text
                x={x}
                y={height - 18}
                textAnchor="middle"
                className="subjectTrendChartAxisLabel"
                fontSize={10}
              >
                {point.sessionLabel.replace("/", "")}
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
  const [examType, setExamType] = useState<SubjectTrendExamType>("regular");
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
  }, [examType, selectedGakuseiId]);

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
        examType,
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
  }, [examType, selectedGakuseiId, subjectName]);

  const subjectOptions = data?.subjectOptions ?? [];
  const currentSubject = subjectName || data?.selectedSubjectName || subjectOptions[0] || "";
  const chartTitle =
    examType === "regular" ? "定期試験スコア推移" : "模擬試験得点率推移";

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
                      value={examType}
                      onChange={(event) =>
                        setExamType(event.target.value as SubjectTrendExamType)
                      }
                      aria-label="試験種別"
                    >
                      <option value="regular">定期試験</option>
                      <option value="mock">模擬試験</option>
                    </select>
                  </label>
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

              <div className="subjectTrendSummaryRow">
                <div className="subjectTrendSummaryCard">
                  <span className="subjectTrendSummaryLabel">最新</span>
                  <strong className="subjectTrendSummaryValue">
                    {data?.summary.latestDisplay ?? "—"}
                  </strong>
                </div>
                <div className="subjectTrendSummaryCard">
                  <span className="subjectTrendSummaryLabel">前期比</span>
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
                <h3 className="examScoreSectionTitle">{chartTitle}</h3>
                <p className="subjectTrendChartSubject">{currentSubject}</p>
                <SubjectTrendLineChart
                  points={data?.points ?? []}
                  scoreFormat={data?.scoreFormat ?? (examType === "regular" ? "points" : "percent")}
                />
              </section>

              <section className="subjectTrendTableSection">
                <h3 className="examScoreSectionTitle">学期別スコア一覧</h3>
                <div className="subjectTrendTableWrap">
                  <table className="subjectTrendTable">
                    <thead>
                      <tr>
                        <th>回次</th>
                        <th>{examType === "regular" ? "得点" : "得点率"}</th>
                        <th>前期比</th>
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
                        const unit = examType === "regular" ? "点" : "%";
                        const deltaLabel =
                          delta === null
                            ? "—"
                            : delta > 0
                              ? `+${delta}${unit}`
                              : `${delta}${unit}`;

                        return (
                          <tr key={point.sessionKey}>
                            <td>{point.sessionLabel}</td>
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
