"use client";

import { useEffect, useMemo, useState } from "react";
import { ExamRadarChart } from "@/components/portal/ExamRadarChart";
import type { StudentRow } from "@/components/portal/LearningTimeView";
import {
  EXAM_TYPE_CONFIG,
  formatScore,
  getScoreTone,
  type ExamScoreRow,
  type ExamSessionOption,
  type ExamType,
} from "@/lib/examResults";

type ExamResultsViewProps = {
  examType: ExamType;
  students: StudentRow[];
};

type ExamResultsData = {
  examType: ExamType;
  sessions: ExamSessionOption[];
  selectedSessionKey: string | null;
  sectionTitle: string | null;
  scores: ExamScoreRow[];
  averageScore: number | null;
  tableMissing?: boolean;
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
  }, [selectedGakuseiId, examType]);

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
  const sessions = data?.sessions ?? [];
  const sectionTitle = data?.sectionTitle;
  const averageScore = data?.averageScore ?? null;
  const currentSessionKey =
    activeSessionKey ?? data?.selectedSessionKey ?? sessions[0]?.sessionKey ?? "";

  return (
    <div className="learningTimePage">
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

        <section className="learningTimeDetail examDetailPanel">
          {!selectedStudent ? (
            <div className="learningTimeEmptyPanel">学生を選択してください。</div>
          ) : (
            <>
              <div className="examDetailHeader">
                <div>
                  <h2 className="examDetailName">{selectedStudent.name}</h2>
                  <p className="examDetailMeta">
                    {selectedStudent.class ?? "クラス未設定"} · {examConfig.label}
                  </p>
                </div>
                {sessions.length > 0 ? (
                  <label className="examSessionSelectWrap">
                    <select
                      className="examSessionSelect"
                      value={currentSessionKey}
                      onChange={(event) => setActiveSessionKey(event.target.value)}
                      aria-label="試験回次"
                    >
                      {sessions.map((session) => (
                        <option key={session.sessionKey} value={session.sessionKey}>
                          {session.sessionLabel}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>

              {error ? <p className="loginError">{error}</p> : null}

              <div className="examDetailBody">
                <section className="examScoreSection">
                  <h3 className="examScoreSectionTitle">
                    {isLoading
                      ? "読み込み中..."
                      : (sectionTitle ?? `${examConfig.label}成績`)}
                  </h3>

                  <div className="examScoreListWrap">
                    {isLoading ? (
                      <p className="learningTimeEmpty">読み込み中...</p>
                    ) : data?.tableMissing ? (
                      <p className="learningTimeEmpty">
                        試験成績テーブルが未作成です。SQL
                        マイグレーション後にデータを登録してください。
                      </p>
                    ) : scores.length === 0 ? (
                      <p className="learningTimeEmpty">
                        この試験の成績データがありません。
                      </p>
                    ) : (
                      <div className="examScoreList">
                        {scores.map((row) => {
                          const tone = getScoreTone(row.score);
                          return (
                            <div key={row.subjectName} className="examScoreRow">
                              <span className="examScoreSubject">
                                {row.subjectName}
                              </span>
                              <span
                                className="examScoreValue"
                                style={{
                                  backgroundColor: tone.boxBackground,
                                  borderColor: tone.boxBorder,
                                  color: tone.textColor,
                                }}
                              >
                                {formatScore(row.score)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <p className="examScoreHint">
                    一覧は縦スクロールで閲覧する想定です。
                  </p>
                </section>

                <section className="examRadarSection">
                  {isLoading ? (
                    <p className="learningTimeEmpty">読み込み中...</p>
                  ) : (
                    <ExamRadarChart scores={scores} averageScore={averageScore} />
                  )}
                </section>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
