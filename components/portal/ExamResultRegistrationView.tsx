"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PortalLoadingOverlay } from "@/components/portal/PortalLoadingOverlay";
import { TEST_SCORE_SUBJECTS, type TestScoreSubjectColumn } from "@/lib/examSubjects";
import {
  buildExamResultListKey,
  downloadExamResultTemplate,
  formatCorrectRate,
  parseExamResultCsv,
  type ExamRegistrationDetail,
  type ExamRegistrationListItem,
  type ExamRegistrationRowError,
  validateImportMeta,
} from "@/lib/examResultRegistration";
import { toDateInputValue } from "@/lib/questionCountSettings";

type EditableRow = {
  recordId?: number | string | null;
  studentId?: number | null;
  gakuseiId: string;
  studentName: string;
  scores: Partial<Record<TestScoreSubjectColumn, string>>;
  subjectScores: Record<string, string>;
  totalCorrect: number | null;
  correctRate: number | null;
};

function getApiErrorMessage(status: number, message?: string) {
  if (status === 401) {
    return "ログインが必要です。";
  }
  if (status === 404) {
    return message ?? "試験データが見つかりません。";
  }
  return message ?? "処理中にエラーが発生しました。";
}

function formatRowErrors(rowErrors: ExamRegistrationRowError[]) {
  return rowErrors
    .slice(0, 8)
    .map((item) => `${item.rowNumber}行目: ${item.message}`)
    .join("\n");
}

function detailToEditableRows(detail: ExamRegistrationDetail): EditableRow[] {
  return detail.rows.map((row) => {
    const scores: Partial<Record<TestScoreSubjectColumn, string>> = {};
    TEST_SCORE_SUBJECTS.forEach(({ column }) => {
      const value = row.scores?.[column];
      scores[column] = value === null || value === undefined ? "" : String(value);
    });

    const subjectScores: Record<string, string> = {};
    Object.entries(row.subjectScores ?? {}).forEach(([subject, value]) => {
      subjectScores[subject] = value === null || value === undefined ? "" : String(value);
    });

    return {
      recordId: row.recordId,
      studentId: row.studentId,
      gakuseiId: row.gakuseiId,
      studentName: row.studentName,
      scores,
      subjectScores,
      totalCorrect: row.totalCorrect,
      correctRate: row.correctRate,
    };
  });
}

function getExamTypeBadgeClass(examType: ExamRegistrationListItem["examType"]) {
  if (examType === "mock") {
    return "examResultRegBadgeMock";
  }
  if (examType === "graduation") {
    return "examResultRegBadgeGraduation";
  }
  return "examResultRegBadgeRegular";
}

export function ExamResultRegistrationView() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const headerFileInputRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<ExamRegistrationListItem[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<ExamRegistrationDetail | null>(null);
  const [editTestName, setEditTestName] = useState("");
  const [editTestDate, setEditTestDate] = useState("");
  const [editRows, setEditRows] = useState<EditableRow[]>([]);
  const [search, setSearch] = useState("");
  const [importTestName, setImportTestName] = useState("");
  const [importTestDate, setImportTestDate] = useState("");
  const [selectedSubject, setSelectedSubject] = useState<string>("summary");
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [importDetail, setImportDetail] = useState<string | null>(null);

  const isBusy = isLoadingList || isLoadingDetail || isSaving || isImporting;

  const loadList = useCallback(async (searchValue = search) => {
    setIsLoadingList(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (searchValue.trim()) {
        params.set("search", searchValue.trim());
      }
      const response = await fetch(`/api/exam-result-registration?${params.toString()}`);
      const payload = (await response.json()) as {
        items?: ExamRegistrationListItem[];
        message?: string;
      };

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response.status, payload.message));
      }

      setItems(payload.items ?? []);
      return payload.items ?? [];
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "一覧の取得に失敗しました。");
      return [];
    } finally {
      setIsLoadingList(false);
    }
  }, [search]);

  const loadDetail = useCallback(async (key: string) => {
    setIsLoadingDetail(true);
    setError(null);

    try {
      const response = await fetch(`/api/exam-result-registration?key=${encodeURIComponent(key)}`);
      const payload = (await response.json()) as {
        detail?: ExamRegistrationDetail;
        message?: string;
      };

      if (!response.ok || !payload.detail) {
        throw new Error(getApiErrorMessage(response.status, payload.message));
      }

      setDetail(payload.detail);
      setEditTestName(payload.detail.testName);
      setEditTestDate(toDateInputValue(payload.detail.testDate));
      setEditRows(detailToEditableRows(payload.detail));
      setSelectedSubject("summary");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "詳細の取得に失敗しました。");
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selectedKey) {
      setDetail(null);
      setEditRows([]);
      return;
    }
    void loadDetail(selectedKey);
  }, [selectedKey, loadDetail]);

  useEffect(() => {
    if (!selectedKey && items.length > 0) {
      setSelectedKey(items[0].key);
    }
  }, [items, selectedKey]);

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return items;
    }
    return items.filter((item) => {
      const haystack = `${item.testName} ${item.testDateLabel ?? ""} ${item.examTypeLabel}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [items, search]);

  const handleImport = async (file: File) => {
    const metaError = validateImportMeta(importTestName, importTestDate);
    if (metaError) {
      setError(metaError);
      setMessage(null);
      setImportDetail(null);
      return;
    }

    setIsImporting(true);
    setError(null);
    setMessage(null);
    setImportDetail(null);

    try {
      const text = await file.text();
      const parsed = parseExamResultCsv(text);
      if (!parsed.ok) {
        if (parsed.rowErrors?.length) {
          setImportDetail(formatRowErrors(parsed.rowErrors));
        }
        throw new Error(parsed.message);
      }

      const response = await fetch("/api/exam-result-registration/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testName: importTestName.trim(),
          testDate: importTestDate.trim(),
          rows: parsed.rows,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        rowErrors?: ExamRegistrationRowError[];
      } | null;

      if (!response.ok) {
        if (payload?.rowErrors?.length) {
          setImportDetail(formatRowErrors(payload.rowErrors));
        }
        throw new Error(getApiErrorMessage(response.status, payload?.message));
      }

      const nextKey = buildExamResultListKey("test_scores", importTestName.trim());
      await loadList();
      setSelectedKey(nextKey);
      setMessage(payload?.message ?? "試験結果をインポートしました。");

      const skippedNotes: string[] = [];
      if (parsed.skippedSampleRows > 0) {
        skippedNotes.push(`記入例 ${parsed.skippedSampleRows}行をスキップ`);
      }
      if (parsed.skippedEmptyRows > 0) {
        skippedNotes.push(`空行 ${parsed.skippedEmptyRows}行をスキップ`);
      }
      if (skippedNotes.length > 0) {
        setImportDetail(skippedNotes.join(" / "));
      }
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "CSVインポートに失敗しました。");
    } finally {
      setIsImporting(false);
    }
  };

  const handleSave = async () => {
    if (!selectedKey || !detail) {
      return;
    }

    if (!editTestName.trim() || !editTestDate.trim()) {
      setError("試験名と実施日を入力してください。");
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/exam-result-registration", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: selectedKey,
          testName: editTestName.trim(),
          testDate: editTestDate.trim(),
          rows: editRows.map((row) => ({
            recordId: row.recordId,
            studentId: row.studentId,
            gakuseiId: row.gakuseiId,
            scores: Object.fromEntries(
              TEST_SCORE_SUBJECTS.map(({ column }) => [
                column,
                row.scores[column]?.trim() ? Number(row.scores[column]) : null,
              ]),
            ),
            subjectScores: Object.fromEntries(
              Object.entries(row.subjectScores).map(([subject, value]) => [
                subject,
                value.trim() ? Number(value) : null,
              ]),
            ),
          })),
        }),
      });

      const payload = (await response.json()) as {
        message?: string;
        detail?: ExamRegistrationDetail;
      };

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response.status, payload.message));
      }

      if (payload.detail) {
        setDetail(payload.detail);
        setEditRows(detailToEditableRows(payload.detail));
      }

      await loadList();
      setMessage(payload.message ?? "試験結果を保存しました。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  };

  const updateScore = (gakuseiId: string, column: TestScoreSubjectColumn, value: string) => {
    setEditRows((current) =>
      current.map((row) =>
        row.gakuseiId === gakuseiId
          ? { ...row, scores: { ...row.scores, [column]: value } }
          : row,
      ),
    );
  };

  const updateSubjectScore = (gakuseiId: string, subjectName: string, value: string) => {
    setEditRows((current) =>
      current.map((row) =>
        row.gakuseiId === gakuseiId
          ? {
              ...row,
              subjectScores: { ...row.subjectScores, [subjectName]: value },
            }
          : row,
      ),
    );
  };

  return (
    <div className="examResultRegPage">
      <header className="examResultRegHeader">
        <div>
          <h1 className="examResultRegTitle">試験結果登録</h1>
          <p className="examResultRegSubtitle">
            試験結果のCSVインポートと登録済みデータの編集ができます
          </p>
        </div>
        <div className="examResultRegHeaderActions">
          <input
            ref={headerFileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="examResultRegFileInput"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) {
                void handleImport(file);
              }
            }}
          />
          <button
            type="button"
            className="examResultRegActionBtn"
            onClick={() => downloadExamResultTemplate()}
            disabled={isBusy}
          >
            ↓ テンプレートダウンロード
          </button>
          <button
            type="button"
            className="examResultRegActionBtn"
            onClick={() => headerFileInputRef.current?.click()}
            disabled={isBusy}
          >
            ↑ CSVインポート
          </button>
          <p className="examResultRegHeaderHint">CSVインポート時は試験名と実施日を入力してください</p>
        </div>
      </header>

      <section className="examResultRegImportCard">
        <div className="examResultRegImportCardHeader">
          <h2 className="examResultRegImportCardTitle">CSVインポート</h2>
          <p className="examResultRegImportCardHint">インポート前に試験名・実施日を入力</p>
        </div>
        <div className="examResultRegImportFields">
          <label className="examResultRegField">
            <span className="examResultRegFieldLabel">試験名</span>
            <input
              className="examResultRegFieldInput"
              type="text"
              value={importTestName}
              placeholder="例：第1回模擬試験（25期生3年次）"
              onChange={(event) => setImportTestName(event.target.value)}
              disabled={isBusy}
            />
          </label>
          <label className="examResultRegField examResultRegFieldDate">
            <span className="examResultRegFieldLabel">実施日</span>
            <input
              className="examResultRegFieldInput"
              type="date"
              value={importTestDate}
              onChange={(event) => setImportTestDate(event.target.value)}
              disabled={isBusy}
            />
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="examResultRegFileInput"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) {
                void handleImport(file);
              }
            }}
          />
          <button
            type="button"
            className="examResultRegFileBtn"
            onClick={() => fileInputRef.current?.click()}
            disabled={isBusy}
          >
            ファイルを選択
          </button>
          <button
            type="button"
            className="examResultRegImportBtn"
            onClick={() => fileInputRef.current?.click()}
            disabled={isBusy}
          >
            {isImporting ? "インポート中..." : "インポート実行"}
          </button>
        </div>
      </section>

      {error ? <p className="examResultRegError">{error}</p> : null}
      {message ? <p className="examResultRegMessage">{message}</p> : null}
      {importDetail ? <pre className="examResultRegImportDetail">{importDetail}</pre> : null}

      <div className="examResultRegWorkspace">
        <aside className="examResultRegListPanel">
          <div className="examResultRegListHeader">
            <h2 className="examResultRegPanelTitle">登録済み試験データ</h2>
            <span className="examResultRegCountBadge">全{filteredItems.length}件</span>
          </div>
          <input
            className="examResultRegSearch"
            type="search"
            placeholder="検索：試験名 / 実施日"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="examResultRegListBody">
            {filteredItems.length === 0 ? (
              <p className="examResultRegEmpty">登録済みの試験データがありません。</p>
            ) : (
              filteredItems.map((item) => {
                const isActive = item.key === selectedKey;
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`examResultRegListItem${isActive ? " examResultRegListItemActive" : ""}`}
                    onClick={() => setSelectedKey(item.key)}
                  >
                    <div className="examResultRegListItemTop">
                      <span className="examResultRegListItemName">{item.testName}</span>
                      <span className={`examResultRegBadge ${getExamTypeBadgeClass(item.examType)}`}>
                        {item.examTypeLabel}
                      </span>
                    </div>
                    <span className="examResultRegListItemMeta">
                      {item.testDateLabel ?? "実施日未設定"} · 登録{item.registeredCount}名
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className="examResultRegEditPanel">
          <div className="examResultRegEditHeader">
            <div>
              <h2 className="examResultRegPanelTitle">試験結果を編集</h2>
              <p className="examResultRegEditHint">選択した試験の結果データを確認・編集できます。</p>
            </div>
          </div>

          {!detail ? (
            <div className="examResultRegEditEmpty">試験を選択してください。</div>
          ) : (
            <>
              <div className="examResultRegEditBody">
                <h3 className="examResultRegSectionTitle">基本情報</h3>
                <div className="examResultRegBasicRow">
                  <label className="examResultRegField">
                    <span className="examResultRegFieldLabel">試験名</span>
                    <input
                      className="examResultRegFieldInput"
                      type="text"
                      value={editTestName}
                      onChange={(event) => setEditTestName(event.target.value)}
                      disabled={isBusy}
                    />
                  </label>
                  <label className="examResultRegField examResultRegFieldDate">
                    <span className="examResultRegFieldLabel">実施日</span>
                    <input
                      className="examResultRegFieldInput"
                      type="date"
                      value={editTestDate}
                      onChange={(event) => setEditTestDate(event.target.value)}
                      disabled={isBusy}
                    />
                  </label>
                  <label className="examResultRegField examResultRegFieldType">
                    <span className="examResultRegFieldLabel">試験種別</span>
                    <input
                      className="examResultRegFieldInput examResultRegFieldInputReadonly"
                      type="text"
                      value={
                        detail.examType === "mock"
                          ? "模擬試験"
                          : detail.examType === "graduation"
                            ? "卒業試験"
                            : "定期試験"
                      }
                      readOnly
                    />
                  </label>
                </div>

                {detail.questionCountsMissing ? (
                  <p className="examResultRegWarning">
                    試験問題数が未設定です。正解率は試験問題数設定後に表示されます。
                  </p>
                ) : null}

                <div className="examResultRegTableToolbar">
                  <h3 className="examResultRegSectionTitle">試験結果一覧</h3>
                  {detail.source === "test_scores" ? (
                    <label className="examResultRegSubjectFilter">
                      <span>科目</span>
                      <select
                        value={selectedSubject}
                        onChange={(event) => setSelectedSubject(event.target.value)}
                        disabled={isBusy}
                      >
                        <option value="summary">サマリー</option>
                        {TEST_SCORE_SUBJECTS.map((subject) => (
                          <option key={subject.column} value={subject.column}>
                            {subject.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>

                <div className="examResultRegTableWrap">
                  <table className="examResultRegTable">
                    <thead>
                      <tr>
                        <th>氏名</th>
                        <th>学籍番号</th>
                        {detail.source === "test_scores" && selectedSubject !== "summary" ? (
                          <th>
                            {TEST_SCORE_SUBJECTS.find((subject) => subject.column === selectedSubject)
                              ?.label ?? "得点"}
                          </th>
                        ) : null}
                        {detail.source === "student_exam_results"
                          ? detail.subjects.map((subject) => (
                              <th key={subject.label}>{subject.label}</th>
                            ))
                          : null}
                        {detail.source === "test_scores" ? <th>総得点</th> : null}
                        <th>正解率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editRows.map((row) => (
                        <tr key={row.gakuseiId}>
                          <td>{row.studentName}</td>
                          <td>{row.gakuseiId}</td>
                          {detail.source === "test_scores" && selectedSubject !== "summary" ? (
                            <td>
                              <input
                                className="examResultRegScoreInput"
                                type="text"
                                inputMode="numeric"
                                value={row.scores[selectedSubject as TestScoreSubjectColumn] ?? ""}
                                onChange={(event) =>
                                  updateScore(
                                    row.gakuseiId,
                                    selectedSubject as TestScoreSubjectColumn,
                                    event.target.value,
                                  )
                                }
                                disabled={isBusy}
                              />
                            </td>
                          ) : null}
                          {detail.source === "student_exam_results"
                            ? detail.subjects.map((subject) => (
                                <td key={`${row.gakuseiId}-${subject.label}`}>
                                  <input
                                    className="examResultRegScoreInput"
                                    type="text"
                                    inputMode="decimal"
                                    value={row.subjectScores[subject.label] ?? ""}
                                    onChange={(event) =>
                                      updateSubjectScore(row.gakuseiId, subject.label, event.target.value)
                                    }
                                    disabled={isBusy}
                                  />
                                </td>
                              ))
                            : null}
                          {detail.source === "test_scores" ? <td>{row.totalCorrect ?? "—"}</td> : null}
                          <td className="examResultRegRateCell">{formatCorrectRate(row.correctRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="examResultRegEditFooter">
                <button
                  type="button"
                  className="examResultRegCancelBtn"
                  onClick={() => {
                    if (detail) {
                      setEditTestName(detail.testName);
                      setEditTestDate(toDateInputValue(detail.testDate));
                      setEditRows(detailToEditableRows(detail));
                    }
                  }}
                  disabled={isBusy}
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  className="examResultRegSaveBtn"
                  onClick={() => void handleSave()}
                  disabled={isBusy}
                >
                  {isSaving ? "保存中..." : "変更を保存"}
                </button>
              </div>
            </>
          )}

          <PortalLoadingOverlay
            active={isLoadingDetail || isSaving || isImporting}
            label={isImporting ? "インポート中..." : isSaving ? "保存中..." : "読み込み中..."}
          />
        </section>
      </div>
    </div>
  );
}
