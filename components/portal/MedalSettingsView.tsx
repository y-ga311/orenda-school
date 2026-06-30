"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PortalLoadingOverlay } from "@/components/portal/PortalLoadingOverlay";
import {
  getMedalGrantStatus,
  getMedalGrantStatusLabel,
  type MedalAchievement,
} from "@/lib/medalCatalog";

type MedalSettingsStudent = {
  gakuseiId: string;
  name: string;
  className: string | null;
};

type MedalSettingsResponse = {
  catalog?: MedalAchievement[];
  students?: MedalSettingsStudent[];
  grantsByGakuseiId?: Record<string, string[]>;
  tableMissing?: boolean;
  message?: string;
};

type SelectionMode = "bulk" | "select";

function grantKey(gakuseiId: string, achievementId: string) {
  return `${gakuseiId}::${achievementId}`;
}

function cloneGrantsMap(source: Record<string, string[]>) {
  const next: Record<string, string[]> = {};
  Object.entries(source).forEach(([gakuseiId, achievementIds]) => {
    next[gakuseiId] = [...achievementIds];
  });
  return next;
}

function isGrantedInMap(
  grantsByGakuseiId: Record<string, string[]>,
  gakuseiId: string,
  achievementId: string,
) {
  return (grantsByGakuseiId[gakuseiId] ?? []).includes(achievementId);
}

function setGrantInMap(
  grantsByGakuseiId: Record<string, string[]>,
  gakuseiId: string,
  achievementId: string,
  granted: boolean,
) {
  const current = new Set(grantsByGakuseiId[gakuseiId] ?? []);
  if (granted) {
    current.add(achievementId);
  } else {
    current.delete(achievementId);
  }
  grantsByGakuseiId[gakuseiId] = [...current];
}

function getApiErrorMessage(status: number, message?: string) {
  if (status === 401) {
    return "ログインが必要です。";
  }
  return message ?? "処理中にエラーが発生しました。";
}

export function MedalSettingsView() {
  const [catalog, setCatalog] = useState<MedalAchievement[]>([]);
  const [students, setStudents] = useState<MedalSettingsStudent[]>([]);
  const [savedGrants, setSavedGrants] = useState<Record<string, string[]>>({});
  const [draftGrants, setDraftGrants] = useState<Record<string, string[]>>({});
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("bulk");
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [selectedMedalIds, setSelectedMedalIds] = useState<Set<string>>(new Set());
  const [tableMissing, setTableMissing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isBusy = isLoading || isSaving;

  const classFilterOptions = useMemo(() => {
    const classes = new Map<string, string>();
    let hasUnset = false;

    students.forEach((student) => {
      const trimmed = student.className?.trim();
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
    return students.filter((student) => {
      if (classFilter !== "all") {
        const trimmedClass = student.className?.trim();
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

      return [student.name, student.gakuseiId, student.className ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [classFilter, search, students]);

  const activeStudentIds = useMemo(() => {
    if (selectionMode === "bulk") {
      return filteredStudents.map((student) => student.gakuseiId);
    }
    return filteredStudents
      .filter((student) => selectedStudentIds.has(student.gakuseiId))
      .map((student) => student.gakuseiId);
  }, [filteredStudents, selectedStudentIds, selectionMode]);

  const hasPendingChanges = useMemo(() => {
    const savedKeys = new Set<string>();
    Object.entries(savedGrants).forEach(([gakuseiId, achievementIds]) => {
      achievementIds.forEach((achievementId) => {
        savedKeys.add(grantKey(gakuseiId, achievementId));
      });
    });

    const draftKeys = new Set<string>();
    Object.entries(draftGrants).forEach(([gakuseiId, achievementIds]) => {
      achievementIds.forEach((achievementId) => {
        draftKeys.add(grantKey(gakuseiId, achievementId));
      });
    });

    if (savedKeys.size !== draftKeys.size) {
      return true;
    }

    for (const key of savedKeys) {
      if (!draftKeys.has(key)) {
        return true;
      }
    }

    return false;
  }, [draftGrants, savedGrants]);

  const targetSummary = useMemo(() => {
    if (activeStudentIds.length === 0) {
      return "対象学生が選択されていません";
    }

    const classLabel =
      classFilter === "all"
        ? "全クラス"
        : classFilterOptions.find((option) => option.value === classFilter)?.label ?? "クラス指定";

    return `${classLabel} · ${activeStudentIds.length}名`;
  }, [activeStudentIds.length, classFilter, classFilterOptions]);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/medal-settings");
      const payload = (await response.json()) as MedalSettingsResponse;

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response.status, payload.message));
      }

      const nextCatalog = payload.catalog ?? [];
      const nextStudents = payload.students ?? [];
      const nextGrants = payload.grantsByGakuseiId ?? {};
      setCatalog(nextCatalog);
      setStudents(nextStudents);
      setSavedGrants(nextGrants);
      setDraftGrants(cloneGrantsMap(nextGrants));
      setTableMissing(Boolean(payload.tableMissing));

      return payload;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "設定の取得に失敗しました。");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (selectionMode === "bulk") {
      setSelectedStudentIds(new Set(filteredStudents.map((student) => student.gakuseiId)));
    }
  }, [filteredStudents, selectionMode]);

  function toggleStudentSelection(gakuseiId: string) {
    setSelectedStudentIds((current) => {
      const next = new Set(current);
      if (next.has(gakuseiId)) {
        next.delete(gakuseiId);
      } else {
        next.add(gakuseiId);
      }
      return next;
    });
  }

  function toggleSelectAllStudents() {
    const filteredIds = filteredStudents.map((student) => student.gakuseiId);
    const allSelected = filteredIds.every((id) => selectedStudentIds.has(id));

    setSelectedStudentIds((current) => {
      const next = new Set(current);
      if (allSelected) {
        filteredIds.forEach((id) => next.delete(id));
      } else {
        filteredIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  function toggleMedalSelection(achievementId: string) {
    setSelectedMedalIds((current) => {
      const next = new Set(current);
      if (next.has(achievementId)) {
        next.delete(achievementId);
      } else {
        next.add(achievementId);
      }
      return next;
    });
  }

  function applyGrantToStudents(achievementIds: string[], granted: boolean) {
    if (activeStudentIds.length === 0 || achievementIds.length === 0) {
      return;
    }

    setDraftGrants((current) => {
      const next = cloneGrantsMap(current);
      activeStudentIds.forEach((gakuseiId) => {
        achievementIds.forEach((achievementId) => {
          setGrantInMap(next, gakuseiId, achievementId, granted);
        });
      });
      return next;
    });
  }

  function toggleAchievementGrant(achievementId: string) {
    const status = getMedalGrantStatus(activeStudentIds, achievementId, draftGrants);
    applyGrantToStudents([achievementId], status !== "granted");
  }

  function handleBulkGrantSelected() {
    applyGrantToStudents([...selectedMedalIds], true);
  }

  function handleBulkRevokeSelected() {
    applyGrantToStudents([...selectedMedalIds], false);
  }

  async function handleSave() {
    if (!hasPendingChanges) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const updates: Array<{
        gakuseiId: string;
        achievementId: string;
        granted: boolean;
      }> = [];

      const studentIds = new Set([
        ...Object.keys(savedGrants),
        ...Object.keys(draftGrants),
        ...students.map((student) => student.gakuseiId),
      ]);

      const achievementIds = catalog.map((item) => item.id);

      studentIds.forEach((gakuseiId) => {
        achievementIds.forEach((achievementId) => {
          const wasGranted = isGrantedInMap(savedGrants, gakuseiId, achievementId);
          const isGranted = isGrantedInMap(draftGrants, gakuseiId, achievementId);
          if (wasGranted !== isGranted) {
            updates.push({
              gakuseiId,
              achievementId,
              granted: isGranted,
            });
          }
        });
      });

      const response = await fetch("/api/medal-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });

      const payload = (await response.json()) as MedalSettingsResponse;

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response.status, payload.message));
      }

      const nextGrants = payload.grantsByGakuseiId ?? {};
      setSavedGrants(nextGrants);
      setDraftGrants(cloneGrantsMap(nextGrants));
      setCatalog(payload.catalog ?? catalog);
      setStudents(payload.students ?? students);
      setTableMissing(Boolean(payload.tableMissing));
      setMessage(payload.message ?? "メダル設定を保存しました。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  }

  const allFilteredSelected =
    filteredStudents.length > 0 &&
    filteredStudents.every((student) => selectedStudentIds.has(student.gakuseiId));

  return (
    <div className="medalTab">
      {tableMissing ? (
        <p className="mcqWarning">
          medal_achievements テーブルが未作成です。docs/sql/create-medal-tables.sql と
          seed-medal-achievements.sql を実行してください。
        </p>
      ) : null}

      {error ? <p className="mcqError">{error}</p> : null}
      {message ? <p className="mcqMessage">{message}</p> : null}

      <div className="medalBody">
        <aside className="medalStudentPanel">
          <h3 className="mcqPanelTitle">対象学生</h3>

          <div className="medalModeSwitch" role="tablist" aria-label="学生選択モード">
            <button
              type="button"
              role="tab"
              aria-selected={selectionMode === "bulk"}
              className={`medalModeBtn${selectionMode === "bulk" ? " medalModeBtnActive" : ""}`}
              onClick={() => setSelectionMode("bulk")}
              disabled={isBusy}
            >
              一括設定
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={selectionMode === "select"}
              className={`medalModeBtn${selectionMode === "select" ? " medalModeBtnActive" : ""}`}
              onClick={() => setSelectionMode("select")}
              disabled={isBusy}
            >
              選択設定
            </button>
          </div>

          <input
            className="mcqSearch"
            type="search"
            placeholder="検索：氏名 / 学籍番号"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            disabled={isBusy}
          />

          <select
            className="mcqFilterSelect"
            value={classFilter}
            onChange={(event) => setClassFilter(event.target.value)}
            disabled={isBusy}
          >
            {classFilterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {selectionMode === "select" ? (
            <button
              type="button"
              className={`medalSelectAllRow${allFilteredSelected ? " medalSelectAllRowActive" : ""}`}
              onClick={toggleSelectAllStudents}
              disabled={isBusy || filteredStudents.length === 0}
            >
              <span aria-hidden="true">{allFilteredSelected ? "☑" : "☐"}</span>
              全員選択（{filteredStudents.length}名）
            </button>
          ) : (
            <div className="medalBulkHint">
              フィルター条件に一致する {filteredStudents.length} 名が対象です
            </div>
          )}

          <div className="medalStudentList">
            {isLoading && students.length === 0 ? (
              <p className="mcqEmpty">読み込み中...</p>
            ) : filteredStudents.length === 0 ? (
              <p className="mcqEmpty">該当する学生がいません。</p>
            ) : (
              filteredStudents.map((student) => {
                const isActive =
                  selectionMode === "bulk" || selectedStudentIds.has(student.gakuseiId);
                return (
                  <button
                    key={student.gakuseiId}
                    type="button"
                    className={`medalStudentItem${isActive ? " medalStudentItemActive" : ""}`}
                    onClick={() => {
                      if (selectionMode === "select") {
                        toggleStudentSelection(student.gakuseiId);
                      }
                    }}
                    disabled={isBusy || selectionMode === "bulk"}
                  >
                    {selectionMode === "select" ? (
                      <span aria-hidden="true">{isActive ? "☑" : "☐"}</span>
                    ) : null}
                    <span className="medalStudentName">{student.name}</span>
                    <span className="medalStudentMeta">
                      {student.gakuseiId}
                      {student.className ? ` · ${student.className}` : ""}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className="medalGrantPanel">
          <PortalLoadingOverlay active={isBusy} label={isSaving ? "保存中..." : undefined} />

          <div className="medalGrantHeader">
            <div>
              <h3 className="mcqPanelTitle">メダル付与設定</h3>
              <p className="mcqEditHint">
                達成項目ごとに、選択した学生へメダルを付与・解除できます。
              </p>
            </div>
            <span className="mcqCountBadge">
              {selectionMode === "bulk" ? "一括設定" : "選択設定"} · {activeStudentIds.length}名対象
            </span>
          </div>

          <div className="medalTargetBanner">
            <span className="medalTargetLabel">対象：</span>
            <strong>{targetSummary}</strong>
          </div>

          <div className="medalAchievementSection">
            <p className="medalAchievementSectionTitle">達成項目・メダル一覧</p>

            <div className="medalAchievementList">
              {catalog.map((achievement) => {
                const status = getMedalGrantStatus(
                  activeStudentIds,
                  achievement.id,
                  draftGrants,
                );
                const statusLabel = getMedalGrantStatusLabel(status);
                const medalSelected = selectedMedalIds.has(achievement.id);

                return (
                  <div key={achievement.id} className="medalAchievementRow">
                    <label className="medalAchievementCheck">
                      <input
                        type="checkbox"
                        checked={medalSelected}
                        onChange={() => toggleMedalSelection(achievement.id)}
                        disabled={isBusy}
                      />
                    </label>

                    <div className="medalAchievementText">
                      <p className="medalAchievementTitle">{achievement.title}</p>
                      <p className="medalAchievementDescription">{achievement.description}</p>
                    </div>

                    <button
                      type="button"
                      className={`medalGrantBadge medalGrantBadge${status === "granted" ? "Granted" : status === "partial" ? "Partial" : "NotGranted"}`}
                      onClick={() => toggleAchievementGrant(achievement.id)}
                      disabled={isBusy || activeStudentIds.length === 0}
                    >
                      {statusLabel}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="medalFooter">
            <div className="medalBulkActions">
              <button
                type="button"
                className="mcqSaveBtn"
                onClick={handleBulkGrantSelected}
                disabled={isBusy || selectedMedalIds.size === 0 || activeStudentIds.length === 0}
              >
                選択メダルを一括付与
              </button>
              <button
                type="button"
                className="mcqSecondaryBtn"
                onClick={handleBulkRevokeSelected}
                disabled={isBusy || selectedMedalIds.size === 0 || activeStudentIds.length === 0}
              >
                選択メダルを一括解除
              </button>
            </div>

            <button
              type="button"
              className="mcqSaveBtn"
              onClick={() => void handleSave()}
              disabled={isBusy || !hasPendingChanges}
            >
              メダル設定を保存
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
