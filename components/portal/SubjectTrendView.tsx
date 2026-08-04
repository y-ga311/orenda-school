"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { PortalLoadingOverlay } from "@/components/portal/PortalLoadingOverlay";
import {
  buildSubjectTrendNotices,
  SubjectTrendDetailContent,
  SubjectTrendHeader,
} from "@/components/portal/SubjectTrendDetailContent";
import type { StudentRow } from "@/components/portal/LearningTimeView";
import { type SubjectTrendData } from "@/lib/subjectTrend";
import type { SubjectTrendAnalysis } from "@/lib/subjectTrendAnalysis";

type SubjectTrendViewProps = {
  students: StudentRow[];
};

type SubjectTrendResponse = SubjectTrendData & {
  subjectOptions: string[];
  selectedSubjectName: string;
  subjectAnalysis?: SubjectTrendAnalysis;
  message?: string;
};

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
  const notices = useMemo(() => buildSubjectTrendNotices(data), [data]);

  const selectStudent = (gakuseiId: string) => {
    setSelectedGakuseiId(gakuseiId);
    setIsFullscreenOpen(true);
  };

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

  const fullscreenOverlay =
    isFullscreenOpen && selectedStudent && typeof document !== "undefined"
      ? createPortal(
          <div className="examDetailFullscreen" role="dialog" aria-modal="true">
            <div className="examDetailFullscreenInner">
              <PortalLoadingOverlay active={isLoading} />
              <SubjectTrendHeader
                studentName={selectedStudent.name}
                studentClass={selectedStudent.class ?? null}
                subjectOptions={subjectOptions}
                currentSubject={currentSubject}
                onSubjectChange={setSubjectName}
                isFullscreen
                onCloseFullscreen={() => setIsFullscreenOpen(false)}
              />
              {error ? <p className="loginError">{error}</p> : null}
              <div className="examDetailFullscreenBody">
                <SubjectTrendDetailContent
                  subjectName={currentSubject}
                  points={data?.points ?? []}
                  cohortAverageLabel={data?.cohortAverageLabel ?? null}
                  failedCohortAverageLabel={data?.failedCohortAverageLabel ?? null}
                  passedCohortAverageLabel={data?.passedCohortAverageLabel ?? null}
                  subjectAnalysis={data?.subjectAnalysis}
                  isLoading={isLoading}
                  notices={notices}
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
                  <div
                    key={student.gakusei_id}
                    className={`examStudentRow${isSelected ? " examStudentRowSelected" : ""}`}
                  >
                    <button
                      type="button"
                      className="examStudentRowMain"
                      onClick={() => selectStudent(student.gakusei_id)}
                    >
                      <span className="learningTimeStudentRowText">{student.name}</span>
                    </button>
                    <button
                      type="button"
                      className="learningTimeStudentRowBtn"
                      onClick={() => selectStudent(student.gakusei_id)}
                    >
                      詳細
                    </button>
                  </div>
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
              <SubjectTrendHeader
                studentName={selectedStudent.name}
                studentClass={selectedStudent.class ?? null}
                subjectOptions={subjectOptions}
                currentSubject={currentSubject}
                onSubjectChange={setSubjectName}
                onOpenFullscreen={openFullscreen}
              />

              {error ? <p className="loginError">{error}</p> : null}

              {notices.map((notice) => (
                <p key={notice} className="examScoreNotice">
                  {notice}
                </p>
              ))}

              <p className="examScoreHint">
                氏名または「詳細」で全画面表示します。上段に推移グラフ、中央に科目別 ABCD
                分析、下段に試験一覧が表示されます。
              </p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
