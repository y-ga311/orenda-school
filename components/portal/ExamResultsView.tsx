"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ExamDetailHeader,
  ExamStudentDetailContent,
} from "@/components/portal/ExamStudentDetailContent";
import { PortalLoadingOverlay } from "@/components/portal/PortalLoadingOverlay";
import type { StudentRow } from "@/components/portal/LearningTimeView";
import {
  EXAM_TYPE_CONFIG,
  calculateAverageScore,
  calculateExamTrackTotals,
  isTakenExamScore,
  type ExamScoreRow,
  type ExamSessionOption,
  type ExamType,
} from "@/lib/examResults";
import { usesTestScoresTable } from "@/lib/testScores";
import type { ExamPassRateAnalysis } from "@/lib/passRateAnalysis";

type ExamResultsViewProps = {
  examType: ExamType;
  students: StudentRow[];
};

type ExamResultsData = {
  examType: ExamType;
  scoreFormat?: "points" | "percent";
  sessions: ExamSessionOption[];
  selectedSessionKey: string | null;
  sectionTitle: string | null;
  testDate?: string | null;
  scores: ExamScoreRow[];
  averageScore: number | null;
  tableMissing?: boolean;
  masterTableMissing?: boolean;
  resultsTableMissing?: boolean;
  questionCountsMissing?: boolean;
  cohortRadarScores?: ExamScoreRow[];
  cohortAverageLabel?: string | null;
  failedCohortRadarScores?: ExamScoreRow[];
  failedCohortAverageLabel?: string | null;
  passedCohortRadarScores?: ExamScoreRow[];
  passedCohortAverageLabel?: string | null;
  passRateAnalysis?: ExamPassRateAnalysis | null;
};

function getExamResultsErrorMessage(status: number, message?: string) {
  if (status === 401) {
    return "ログインが必要です。";
  }
  if (status === 400) {
    return "学生が選択されていません。";
  }
  if (status === 500) {
    return message ?? "試験成績の取得中にエラーが発生しました。";
  }
  return message ?? "試験成績の取得に失敗しました。";
}

export function ExamResultsView({ examType, students }: ExamResultsViewProps) {
  const examConfig = EXAM_TYPE_CONFIG[examType];
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [classFilter, setClassFilter] = useState("all");
  const [selectedGakuseiId, setSelectedGakuseiId] = useState(
    students[0]?.gakusei_id ?? "",
  );
  const [activeSessionKey, setActiveSessionKey] = useState<string | null>(null);
  const [data, setData] = useState<ExamResultsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);

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
    setActiveSessionKey(null);
    setIsFullscreenOpen(false);
  }, [selectedGakuseiId, examType]);

  useEffect(() => {
    if (!isFullscreenOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFullscreenOpen(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullscreenOpen]);

  const openFullscreen = () => {
    setIsFullscreenOpen(true);
  };

  const usesTestScoreFormat = usesTestScoresTable(examType);
  const usesPointScoreFormat = !usesTestScoreFormat;

  useEffect(() => {
    if (!selectedGakuseiId) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadExamResults() {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams({
        examType,
        gakuseiId: selectedGakuseiId,
      });
      if (activeSessionKey) {
        params.set("sessionKey", activeSessionKey);
      }

      try {
        const response = await fetch(`/api/exam-results?${params.toString()}`);
        const payload = (await response.json()) as ExamResultsData & {
          message?: string;
        };

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setError(getExamResultsErrorMessage(response.status, payload.message));
          setData(null);
          return;
        }

        setData(payload);
      } catch {
        if (!cancelled) {
          setError("試験成績の取得に失敗しました。");
          setData(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadExamResults();

    return () => {
      cancelled = true;
    };
  }, [examType, selectedGakuseiId, activeSessionKey]);

  const scores = data?.scores ?? [];
  const radarScores = useMemo(
    () => (usesTestScoreFormat ? scores.filter(isTakenExamScore) : scores),
    [scores, usesTestScoreFormat],
  );
  const radarAverageScore = useMemo(
    () => calculateAverageScore(radarScores),
    [radarScores],
  );
  const radarCohortScores = useMemo(() => {
    if (!data?.cohortRadarScores) {
      return null;
    }

    const cohortBySubject = new Map(
      data.cohortRadarScores.map((row) => [row.subjectName, row]),
    );

    return radarScores.map((row) => {
      const cohortRow = cohortBySubject.get(row.subjectName);
      return {
        subjectName: row.subjectName,
        score: cohortRow?.score ?? null,
        notTaken: cohortRow?.score === null || cohortRow?.score === undefined,
      };
    });
  }, [data?.cohortRadarScores, radarScores]);
  const radarFailedCohortScores = useMemo(() => {
    if (!data?.failedCohortRadarScores) {
      return null;
    }

    const failedCohortBySubject = new Map(
      data.failedCohortRadarScores.map((row) => [row.subjectName, row]),
    );

    return radarScores.map((row) => {
      const failedCohortRow = failedCohortBySubject.get(row.subjectName);
      return {
        subjectName: row.subjectName,
        score: failedCohortRow?.score ?? null,
        notTaken:
          failedCohortRow?.score === null || failedCohortRow?.score === undefined,
      };
    });
  }, [data?.failedCohortRadarScores, radarScores]);
  const radarPassedCohortScores = useMemo(() => {
    if (!data?.passedCohortRadarScores) {
      return null;
    }

    const passedCohortBySubject = new Map(
      data.passedCohortRadarScores.map((row) => [row.subjectName, row]),
    );

    return radarScores.map((row) => {
      const passedCohortRow = passedCohortBySubject.get(row.subjectName);
      return {
        subjectName: row.subjectName,
        score: passedCohortRow?.score ?? null,
        notTaken:
          passedCohortRow?.score === null || passedCohortRow?.score === undefined,
      };
    });
  }, [data?.passedCohortRadarScores, radarScores]);
  const trackTotals = useMemo(
    () => (usesTestScoreFormat ? calculateExamTrackTotals(scores) : null),
    [scores, usesTestScoreFormat],
  );
  const sessions = data?.sessions ?? [];
  const hasTakenScores = scores.some(isTakenExamScore);
  const sectionTitle = data?.sectionTitle;
  const testDate = data?.testDate;
  const currentSessionKey =
    activeSessionKey ?? data?.selectedSessionKey ?? sessions[0]?.sessionKey ?? "";

  const detailContentProps = {
    examType,
    examLabel: examConfig.label,
    sectionTitle,
    isLoading,
    usesPointScoreFormat,
    usesTestScoreFormat,
    scores,
    hasTakenScores,
    radarScores,
    radarAverageScore,
    radarCohortScores,
    cohortAverageLabel: data?.cohortAverageLabel ?? null,
    radarFailedCohortScores,
    failedCohortAverageLabel: data?.failedCohortAverageLabel ?? null,
    radarPassedCohortScores,
    passedCohortAverageLabel: data?.passedCohortAverageLabel ?? null,
    trackTotals,
    passRateAnalysis: data?.passRateAnalysis,
    tableMissing: data?.tableMissing,
  };

  const headerProps = selectedStudent
    ? {
        studentName: selectedStudent.name,
        studentClass: selectedStudent.class ?? null,
        examLabel: examConfig.label,
        testDate,
        sessions,
        currentSessionKey,
        onSessionChange: setActiveSessionKey,
      }
    : null;

  const fullscreenOverlay =
    isFullscreenOpen && selectedStudent && headerProps && typeof document !== "undefined"
      ? createPortal(
          <div className="examDetailFullscreen" role="dialog" aria-modal="true">
            <div className="examDetailFullscreenInner">
              <PortalLoadingOverlay active={isLoading} />
              <ExamDetailHeader
                {...headerProps}
                isFullscreen
                onCloseFullscreen={() => setIsFullscreenOpen(false)}
              />
              {error ? <p className="loginError">{error}</p> : null}
              <div className="examDetailFullscreenBody">
                <ExamStudentDetailContent
                  {...detailContentProps}
                  layout="fullscreen"
                />
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="learningTimePage">
      {fullscreenOverlay}
      <header className="learningTimeHeader">
        <div>
          <h1 className="learningTimeTitle">{examConfig.label}</h1>
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
                  <div
                    key={student.gakusei_id}
                    className={`examStudentRow${isSelected ? " examStudentRowSelected" : ""}`}
                  >
                    <button
                      type="button"
                      className="examStudentRowMain"
                      onClick={() => setSelectedGakuseiId(student.gakusei_id)}
                    >
                      <span className="learningTimeStudentRowText">{student.name}</span>
                    </button>
                    <button
                      type="button"
                      className="learningTimeStudentRowBtn"
                      onClick={() => {
                        setSelectedGakuseiId(student.gakusei_id);
                        setIsFullscreenOpen(true);
                      }}
                    >
                      詳細
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="learningTimeDetail examDetailPanel">
          <PortalLoadingOverlay active={isLoading} />
          {!selectedStudent ? (
            <div className="learningTimeEmptyPanel">学生を選択してください。</div>
          ) : (
            <>
              <ExamDetailHeader
                {...headerProps!}
                onOpenFullscreen={openFullscreen}
              />

              {error ? <p className="loginError">{error}</p> : null}

              {data?.masterTableMissing ? (
                <p className="examScoreNotice">
                  定期試験マスタ（regular_exam_terms）を読み込めませんでした。
                  docs/sql/create-regular-exam-tables.sql と seed-regular-exam-subjects.sql
                  を実行し、Supabase でスキーマを再読み込みしてください。
                </p>
              ) : null}
              {data?.resultsTableMissing ? (
                <p className="examScoreNotice">
                  成績テーブル（student_exam_results）が未作成です。
                  docs/sql/create-student-exam-results-table.sql を実行してください。
                </p>
              ) : null}

              <ExamStudentDetailContent
                {...detailContentProps}
                layout="compact"
                onOpenFullscreen={openFullscreen}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
