"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PortalLoadingOverlay } from "@/components/portal/PortalLoadingOverlay";
import {
  formatBulkScoreImportRowErrors,
  downloadStudentBulkScoreTemplate,
  STUDENT_BULK_SCORE_IMPORT_GROUPS,
  type BulkScoreImportRowError,
  type StudentBulkScoreImportGroup,
} from "@/lib/studentBulkScoreImport";
import {
  STUDENT_BULK_SECTION_LABELS,
  countDirtyRows,
  getChangedGroupValues,
  getStudentBulkGroup,
  getStudentBulkGroupsBySection,
  isRowGroupDirty,
  pickRowGroupValues,
  type StudentBulkGroupKey,
  type StudentBulkRow,
  type StudentBulkRowValues,
  type StudentBulkSectionKey,
} from "@/lib/studentProfileBulk";

const SECTIONS: StudentBulkSectionKey[] = ["basic", "score", "account"];

function getApiErrorMessage(status: number, message?: string) {
  if (status === 401) {
    return "ログインが必要です。";
  }
  if (status === 400) {
    return message ?? "入力内容を確認してください。";
  }
  if (status === 500) {
    return message ?? "学生情報の取得中にエラーが発生しました。";
  }
  return message ?? "処理中にエラーが発生しました。";
}

function getPasswordPlaceholder(
  columnKey: "studentPassword" | "parentPassword",
  row: StudentBulkRow,
) {
  if (columnKey === "studentPassword") {
    return row.hasStudentPassword ? "変更時のみ入力" : "未設定";
  }
  return row.hasParentPassword ? "変更時のみ入力" : "未設定";
}

export function StudentBulkEditView() {
  const csvImportInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<StudentBulkRow[]>([]);
  const [extendedFieldsAvailable, setExtendedFieldsAvailable] = useState(true);
  const [nationalExamStatusAvailable, setNationalExamStatusAvailable] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<StudentBulkGroupKey>("nickname");
  const [editValues, setEditValues] = useState<Record<string, StudentBulkRowValues>>({});
  const [baselineValues, setBaselineValues] = useState<Record<string, StudentBulkRowValues>>({});
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [importDetail, setImportDetail] = useState<string | null>(null);

  const selectedGroupDef = getStudentBulkGroup(selectedGroup);
  const supportsCsvImport = STUDENT_BULK_SCORE_IMPORT_GROUPS.has(
    selectedGroup as StudentBulkScoreImportGroup,
  );
  const isBusy = isLoading || isSaving || isImporting;

  const loadRows = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/student-profiles-bulk");
      const payload = (await response.json()) as {
        rows?: StudentBulkRow[];
        extendedFieldsAvailable?: boolean;
        nationalExamStatusAvailable?: boolean;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response.status, payload.message));
      }

      const nextRows = payload.rows ?? [];
      setRows(nextRows);
      setExtendedFieldsAvailable(Boolean(payload.extendedFieldsAvailable));
      setNationalExamStatusAvailable(Boolean(payload.nationalExamStatusAvailable ?? true));
      return nextRows;
    } catch (loadError) {
      setRows([]);
      setError(loadError instanceof Error ? loadError.message : "一覧の取得に失敗しました。");
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const applyGroupValues = useCallback(
    (nextRows: StudentBulkRow[], groupKey: StudentBulkGroupKey) => {
      const group = getStudentBulkGroup(groupKey);
      if (!group) {
        return;
      }

      const nextEdit: Record<string, StudentBulkRowValues> = {};
      const nextBaseline: Record<string, StudentBulkRowValues> = {};
      nextRows.forEach((row) => {
        const values = pickRowGroupValues(row, group);
        nextEdit[row.gakuseiId] = { ...values };
        nextBaseline[row.gakuseiId] = { ...values };
      });
      setEditValues(nextEdit);
      setBaselineValues(nextBaseline);
    },
    [],
  );

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  useEffect(() => {
    if (rows.length > 0) {
      applyGroupValues(rows, selectedGroup);
    }
  }, [applyGroupValues, rows, selectedGroup]);

  const classFilterOptions = useMemo(() => {
    const classes = new Map<string, string>();
    let hasUnset = false;

    rows.forEach((row) => {
      const trimmed = row.className.trim();
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
  }, [rows]);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    const list = rows.filter((row) => {
      if (classFilter !== "all") {
        const trimmedClass = row.className.trim();
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

      return [row.name, row.gakuseiId, row.className].join(" ").toLowerCase().includes(keyword);
    });

    return list.sort((a, b) => {
      const result = a.name.localeCompare(b.name, "ja");
      return sortOrder === "asc" ? result : -result;
    });
  }, [classFilter, rows, search, sortOrder]);

  const dirtyCount = useMemo(() => {
    if (!selectedGroupDef) {
      return 0;
    }
    return countDirtyRows(rows, selectedGroupDef, editValues, baselineValues);
  }, [baselineValues, editValues, rows, selectedGroupDef]);

  const fieldDisabled =
    isBusy ||
    Boolean(selectedGroupDef?.requiresExtended && !extendedFieldsAvailable) ||
    Boolean(selectedGroupDef?.key === "nationalExamStatus" && !nationalExamStatusAvailable);

  async function handleCsvImport(file: File) {
    if (!supportsCsvImport) {
      return;
    }

    setIsImporting(true);
    setError(null);
    setSaveMessage(null);
    setImportDetail(null);

    try {
      const csvText = await file.text();
      const response = await fetch("/api/student-profiles-bulk/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group: selectedGroup,
          csvText,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        rows?: StudentBulkRow[];
        extendedFieldsAvailable?: boolean;
        message?: string;
        rowErrors?: BulkScoreImportRowError[];
      } | null;

      if (!response.ok) {
        if (payload?.rowErrors?.length) {
          setImportDetail(formatBulkScoreImportRowErrors(payload.rowErrors));
        }
        throw new Error(getApiErrorMessage(response.status, payload?.message));
      }

      const nextRows = payload?.rows ?? [];
      setRows(nextRows);
      setExtendedFieldsAvailable(Boolean(payload?.extendedFieldsAvailable));
      applyGroupValues(nextRows, selectedGroup);
      setSaveMessage(payload?.message ?? "インポートしました。");
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "CSVインポートに失敗しました。");
    } finally {
      setIsImporting(false);
      if (csvImportInputRef.current) {
        csvImportInputRef.current.value = "";
      }
    }
  }

  function handleGroupSelect(groupKey: StudentBulkGroupKey) {
    if (groupKey === selectedGroup) {
      return;
    }

    if (dirtyCount > 0) {
      const confirmed = window.confirm("未保存の変更があります。項目を切り替えますか？");
      if (!confirmed) {
        return;
      }
    }

    setSelectedGroup(groupKey);
    setSaveMessage(null);
    setImportDetail(null);
    setError(null);
  }

  function handleValueChange(gakuseiId: string, fieldKey: string, value: string) {
    setEditValues((current) => ({
      ...current,
      [gakuseiId]: {
        ...(current[gakuseiId] ?? {}),
        [fieldKey]: value,
      },
    }));
    setSaveMessage(null);
  }

  function handleCancel() {
    setEditValues({ ...baselineValues });
    setSaveMessage(null);
    setError(null);
  }

  async function handleSave() {
    if (!selectedGroupDef || fieldDisabled) {
      return;
    }

    const updates = rows
      .map((row) => {
        const current = editValues[row.gakuseiId] ?? {};
        const baseline = baselineValues[row.gakuseiId] ?? {};
        const values = getChangedGroupValues(selectedGroupDef, current, baseline);
        if (Object.keys(values).length === 0) {
          return null;
        }
        return { gakuseiId: row.gakuseiId, values };
      })
      .filter((item): item is { gakuseiId: string; values: StudentBulkRowValues } => item !== null);

    if (updates.length === 0) {
      setSaveMessage("変更はありません。");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      const response = await fetch("/api/student-profiles-bulk", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group: selectedGroup,
          updates,
        }),
      });

      const payload = (await response.json()) as {
        rows?: StudentBulkRow[];
        extendedFieldsAvailable?: boolean;
        nationalExamStatusAvailable?: boolean;
        message?: string;
        failures?: { gakuseiId: string; message: string }[];
      };

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response.status, payload.message));
      }

      const nextRows = payload.rows ?? [];
      setRows(nextRows);
      setExtendedFieldsAvailable(Boolean(payload.extendedFieldsAvailable));
      setNationalExamStatusAvailable(Boolean(payload.nationalExamStatusAvailable ?? true));
      applyGroupValues(nextRows, selectedGroup);
      setSaveMessage(payload.message ?? "保存しました。");

      if (payload.failures && payload.failures.length > 0) {
        const firstFailure = payload.failures[0];
        setError(`${firstFailure.gakuseiId}: ${firstFailure.message}`);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  }

  const columnCount = selectedGroupDef ? selectedGroupDef.columns.length + 1 : 1;

  return (
    <div className="studentBulkPage">
      <header className="studentBulkHeader">
        <div>
          <h1 className="studentBulkTitle">学生基本情報</h1>
          <p className="studentBulkSubtitle">項目ごとに一括編集 · {rows.length}名</p>
        </div>
        <div className="studentBulkHeaderActions">
          <Link href="/student-info" className="studentBulkSecondaryBtn">
            個別編集
          </Link>
          <button
            type="button"
            className="studentBulkSaveBtn"
            onClick={() => void handleSave()}
            disabled={isLoading || isSaving || fieldDisabled || dirtyCount === 0}
          >
            {isSaving ? "保存中..." : "保存"}
          </button>
        </div>
      </header>

      <div className="studentBulkWorkspace">
        <aside className="studentBulkFieldList">
          <h2 className="studentBulkPanelTitle">編集項目</h2>
          {SECTIONS.map((section) => (
            <section key={section} className="studentBulkFieldGroup">
              <h3 className="studentBulkFieldGroupTitle">
                {STUDENT_BULK_SECTION_LABELS[section]}
              </h3>
              <div className="studentBulkFieldButtons">
                {getStudentBulkGroupsBySection(section).map((group) => {
                  const isActive = group.key === selectedGroup;
                  const isUnavailable =
                    (group.requiresExtended && !extendedFieldsAvailable) ||
                    (group.key === "nationalExamStatus" && !nationalExamStatusAvailable);
                  return (
                    <button
                      key={group.key}
                      type="button"
                      className={`studentBulkFieldBtn${isActive ? " studentBulkFieldBtnActive" : ""}`}
                      onClick={() => handleGroupSelect(group.key)}
                      disabled={isBusy}
                    >
                      {group.label}
                      {isUnavailable ? "（未設定）" : ""}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </aside>

        <section className="studentBulkTablePanel">
          <PortalLoadingOverlay
            active={isBusy}
            label={isImporting ? "インポート中..." : isSaving ? "保存中..." : undefined}
          />

          <div className="studentBulkTableHeader">
            <div>
              <h2 className="studentBulkPanelTitle">{selectedGroupDef?.label ?? "項目"}</h2>
              <p className="studentBulkTableHint">
                選択した項目を全学生分まとめて編集できます。
                {dirtyCount > 0 ? ` 未保存 ${dirtyCount}件` : ""}
              </p>
            </div>
            <div className="studentBulkTableHeaderActions">
              <button
                type="button"
                className="studentBulkSecondaryBtn"
                onClick={handleCancel}
                disabled={isBusy || dirtyCount === 0}
              >
                変更を戻す
              </button>
            </div>
          </div>

          {supportsCsvImport ? (
            <section className="studentBulkImportCard">
              <div className="studentBulkImportCardHeader">
                <h3 className="studentBulkImportCardTitle">CSVインポート</h3>
                <p className="studentBulkImportCardHint">
                  テンプレートを記入して学籍番号ごとに一括インポートできます
                </p>
              </div>
              <div className="studentBulkImportFields">
                <button
                  type="button"
                  className="studentBulkImportActionBtn"
                  onClick={() =>
                    downloadStudentBulkScoreTemplate(
                      selectedGroup as StudentBulkScoreImportGroup,
                    )
                  }
                  disabled={isBusy || fieldDisabled}
                >
                  ↓ テンプレートダウンロード
                </button>
                <input
                  ref={csvImportInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="studentBulkFileInput"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void handleCsvImport(file);
                    }
                  }}
                />
                <button
                  type="button"
                  className="studentBulkImportFileBtn"
                  onClick={() => csvImportInputRef.current?.click()}
                  disabled={isBusy || fieldDisabled}
                >
                  ファイルを選択
                </button>
                <button
                  type="button"
                  className="studentBulkImportExecuteBtn"
                  onClick={() => csvImportInputRef.current?.click()}
                  disabled={isBusy || fieldDisabled}
                >
                  {isImporting ? "インポート中..." : "インポート実行"}
                </button>
              </div>
            </section>
          ) : null}

          {error ? <p className="loginError">{error}</p> : null}
          {saveMessage ? <p className="studentInfoSaveMessage">{saveMessage}</p> : null}
          {importDetail ? <pre className="studentBulkImportDetail">{importDetail}</pre> : null}

          {selectedGroupDef?.requiresExtended && !extendedFieldsAvailable ? (
            <p className="studentInfoScoreHint">
              スコア項目のカラムが未作成です。SQL マイグレーション後に編集できます。
            </p>
          ) : null}

          {selectedGroupDef?.key === "nationalExamStatus" && !nationalExamStatusAvailable ? (
            <p className="studentInfoScoreHint">
              国家試験合格カラムが未作成です。SQL マイグレーション後に編集できます。
            </p>
          ) : null}

          <input
            className="learningTimeSearch"
            type="search"
            placeholder="検索: 氏名"
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
                onChange={(event) => setSortOrder(event.target.value as "asc" | "desc")}
              >
                <option value="asc">氏名（昇順）</option>
                <option value="desc">氏名（降順）</option>
              </select>
            </label>
          </div>

          <div className="studentBulkTableWrap">
            <table className="studentBulkTable">
              <thead>
                <tr>
                  <th>氏名</th>
                  {selectedGroupDef?.columns.map((column) => (
                    <th key={column.key}>{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={columnCount} className="studentBulkTableEmpty">
                      該当する学生がいません。
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => {
                    const isDirty =
                      selectedGroupDef &&
                      isRowGroupDirty(
                        row.gakuseiId,
                        selectedGroupDef,
                        editValues,
                        baselineValues,
                      );

                    return (
                      <tr
                        key={row.gakuseiId}
                        className={isDirty ? "studentBulkTableRowDirty" : ""}
                      >
                        <td>{row.name}</td>
                        {selectedGroupDef?.columns.map((column) => {
                          const placeholder =
                            column.key === "studentPassword" ||
                            column.key === "parentPassword"
                              ? getPasswordPlaceholder(column.key, row)
                              : column.placeholder ?? "未設定";

                          return (
                            <td key={column.key}>
                              {column.inputType === "select" ? (
                                <select
                                  className="studentBulkTableSelect"
                                  value={editValues[row.gakuseiId]?.[column.key] ?? ""}
                                  onChange={(event) =>
                                    handleValueChange(
                                      row.gakuseiId,
                                      column.key,
                                      event.target.value,
                                    )
                                  }
                                  disabled={fieldDisabled}
                                >
                                  {(column.selectOptions ?? []).map((option) => (
                                    <option key={option.value || "__unset__"} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  className="studentBulkTableInput"
                                  type={column.isPassword ? "password" : "text"}
                                  inputMode={column.inputMode}
                                  value={editValues[row.gakuseiId]?.[column.key] ?? ""}
                                  placeholder={placeholder}
                                  onChange={(event) =>
                                    handleValueChange(
                                      row.gakuseiId,
                                      column.key,
                                      event.target.value,
                                    )
                                  }
                                  disabled={fieldDisabled}
                                />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
