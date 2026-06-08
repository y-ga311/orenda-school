"use client";

import { useEffect, useMemo, useState } from "react";
import { formatJapanTime } from "@/lib/japanDate";
import {
  buildStudyPieChartLabel,
  buildStudyPieGradient,
  formatStudyMinutes,
  getJstYearMonth,
  recordPeriodOptions,
  type StudyRecordData,
} from "@/lib/studyRecordDisplay";
import type { StudyPeriod } from "@/lib/studyRecords";

export type StudentRow = {
  gakusei_id: string;
  name: string;
  class: string | null;
};

type LearningTimeViewProps = {
  students: StudentRow[];
};

function getStudyRecordsErrorMessage(status: number, message?: string) {
  if (status === 401) {
    return "ログインが必要です。";
  }
  if (status === 400) {
    return "学生が選択されていません。";
  }
  if (status === 500) {
    return message ?? "学習記録の取得中にエラーが発生しました。";
  }
  return message ?? "学習記録の取得に失敗しました。";
}

function formatTimeRange(studiedAt: string, durationMinutes: number) {
  const start = formatJapanTime(studiedAt);
  const endDate = new Date(new Date(studiedAt).getTime() + durationMinutes * 60_000);
  const end = formatJapanTime(endDate.toISOString());
  return `${start}–${end}`;
}

function getLogTitle(period: StudyPeriod) {
  if (period === "month") {
    const { year, month } = getJstYearMonth();
    return `学習ログ（${year}年${month}月）`;
  }

  const option =
    recordPeriodOptions.find((item) => item.id === period) ?? recordPeriodOptions[2];
  return `学習ログ（${option.label}）`;
}

export function LearningTimeView({ students }: LearningTimeViewProps) {
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [classFilter, setClassFilter] = useState("all");
  const [selectedGakuseiId, setSelectedGakuseiId] = useState(
    students[0]?.gakusei_id ?? "",
  );
  const [period, setPeriod] = useState<StudyPeriod>("month");
  const [data, setData] = useState<StudyRecordData | null>(null);
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

  const selectedStudent =
    students.find((student) => student.gakusei_id === selectedGakuseiId) ?? null;

  useEffect(() => {
    if (!selectedGakuseiId) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const { year, month } = getJstYearMonth();
    const params = new URLSearchParams({
      studentId: selectedGakuseiId,
      period,
      year: String(year),
      month: String(month),
    });

    fetch(`/api/study-records?${params.toString()}`)
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | (StudyRecordData & { message?: string })
          | null;

        if (!response.ok) {
          const message = getStudyRecordsErrorMessage(
            response.status,
            payload?.message,
          );
          console.error("[study-records]", response.status, payload);
          throw new Error(message);
        }

        if (!cancelled && payload) {
          setData(payload);
        }
      })
      .catch((fetchError: Error) => {
        if (!cancelled) {
          setError(fetchError.message);
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [period, selectedGakuseiId]);

  const periodSummary = data?.periodSummary ?? {
    averageMinutes: 0,
    studiedDays: 0,
    totalMinutes: 0,
  };
  const subjectBreakdown = data?.subjectBreakdown ?? [];
  const subjectTotals = data?.subjectTotals ?? [];
  const sessionLog = data?.sessionLog ?? [];
  const studyPieGradient = buildStudyPieGradient(subjectBreakdown);
  const logTitle = getLogTitle(period);

  return (
    <div className="learningTimePage">
      <header className="learningTimeHeader">
        <div>
          <h1 className="learningTimeTitle">学習時間</h1>
          <p className="learningTimeSubtitle">個人別の学習時間を確認できます</p>
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
              <span className="learningTimeSelectLabel">クラス</span>
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
                    <span className="learningTimeStudentRowText">
                      {student.name} | {student.class ?? "クラス未設定"}
                    </span>
                    <span className="learningTimeStudentRowBtn">詳細</span>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="learningTimeDetail">
          {!selectedStudent ? (
            <div className="learningTimeEmptyPanel">学生を選択してください。</div>
          ) : (
            <>
              <div className="learningTimeDetailHeader">
                <div>
                  <h2 className="learningTimeDetailName">{selectedStudent.name}</h2>
                  <p className="learningTimeDetailMeta">
                    {selectedStudent.class ?? "クラス未設定"} · 学習時間
                  </p>
                </div>
              </div>

              <div className="learningTimePeriodTabs" aria-label="表示する期間">
                {recordPeriodOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`learningTimePeriodTab${period === option.id ? " learningTimePeriodTabActive" : ""}`}
                    onClick={() => setPeriod(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {error ? <p className="loginError">{error}</p> : null}

              <div className="learningTimeSummaryRow">
                <div className="learningTimeSummaryCard">
                  <span className="learningTimeSummaryLabel">合計時間</span>
                  <strong className="learningTimeSummaryValue">
                    {isLoading
                      ? "..."
                      : formatStudyMinutes(periodSummary.totalMinutes)}
                  </strong>
                </div>
                <div className="learningTimeSummaryCard">
                  <span className="learningTimeSummaryLabel">学習日数</span>
                  <strong className="learningTimeSummaryValue">
                    {isLoading ? "..." : `${periodSummary.studiedDays}日`}
                  </strong>
                </div>
                <div className="learningTimeSummaryCard">
                  <span className="learningTimeSummaryLabel">平均 / 日</span>
                  <strong className="learningTimeSummaryValue">
                    {isLoading
                      ? "..."
                      : formatStudyMinutes(periodSummary.averageMinutes)}
                  </strong>
                </div>
              </div>

              <div className="learningTimeDetailBody">
                <section className="learningTimeLogSection" aria-label="学習ログ">
                  <h3 className="learningTimeSectionTitle">{logTitle}</h3>
                  <div className="learningTimeLogList">
                    {isLoading ? (
                      <p className="learningTimeEmpty">読み込み中...</p>
                    ) : sessionLog.length === 0 ? (
                      <p className="learningTimeEmpty">学習ログがありません。</p>
                    ) : (
                      sessionLog.map((day) => (
                        <div key={day.dateKey} className="learningTimeLogDay">
                          <div className="learningTimeLogDayTitle">{day.dateLabel}</div>
                          {day.sessions.map((session, index) => (
                            <div
                              key={`${day.dateKey}-${session.studiedAt}-${index}`}
                              className="learningTimeLogItem"
                            >
                              <div className="learningTimeLogItemLeft">
                                <span className="learningTimeLogTime">
                                  {formatTimeRange(
                                    session.studiedAt,
                                    session.durationMinutes,
                                  )}
                                </span>
                                <span
                                  className="learningTimeSubjectBadge"
                                  style={{
                                    backgroundColor: session.tagBackground,
                                    color: session.tagColor,
                                  }}
                                >
                                  {session.subjectName}
                                </span>
                              </div>
                              <span className="learningTimeLogDuration">
                                {formatStudyMinutes(session.durationMinutes)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <div className="learningTimeBottomRow">
                  <section className="learningTimePieSection" aria-label="時間配分">
                    <h3 className="learningTimeSectionTitle">時間配分</h3>
                    <div className="learningTimePiePanel">
                      {subjectBreakdown.length ? (
                        <>
                          <div
                            className="learningTimePieChart"
                            style={{ background: studyPieGradient }}
                            role="img"
                            aria-label={`科目別の時間配分: ${buildStudyPieChartLabel(subjectBreakdown)}`}
                          />
                          <ul className="learningTimePieLegendCompact" aria-label="科目別の内訳">
                            {subjectBreakdown.map((subject) => (
                              <li key={subject.subjectName}>
                                <span
                                  className="learningTimeLegendSwatch"
                                  style={{ backgroundColor: subject.color }}
                                />
                                {subject.subjectName}
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : (
                        <p className="learningTimeEmptyText">
                          選択期間の学習時間を登録すると配分が表示されます。
                        </p>
                      )}
                    </div>
                  </section>

                  <section className="learningTimeSubjectTotals" aria-label="科目別合計">
                    <h3 className="learningTimeSectionTitle">科目別合計</h3>
                    <div className="learningTimeSubjectTotalsList">
                      {isLoading ? (
                        <p className="learningTimeEmpty">読み込み中...</p>
                      ) : subjectTotals.length === 0 ? (
                        <p className="learningTimeEmpty">データがありません。</p>
                      ) : (
                        subjectTotals.map((subject) => (
                          <div
                            key={subject.subjectName}
                            className="learningTimeSubjectTotalRow"
                          >
                            <span>{subject.subjectName}</span>
                            <strong>{formatStudyMinutes(subject.minutes)}</strong>
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
