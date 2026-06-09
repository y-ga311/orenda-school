"use client";

import { useEffect, useMemo, useState } from "react";
import type { StudentRow } from "@/components/portal/LearningTimeView";
import {
  buildProfileFormState,
  COGNITIVE_SCORE_ITEMS,
  formatScoreBadgeValue,
  getHighlightedCognitiveKey,
  type StudentProfileData,
  type StudentProfileFormState,
} from "@/lib/studentProfile";

type StudentBasicInfoViewProps = {
  students: StudentRow[];
};

function getProfileErrorMessage(status: number, message?: string) {
  if (status === 401) {
    return "ログインが必要です。";
  }
  if (status === 404) {
    return "学生が見つかりません。";
  }
  if (status === 400) {
    return message ?? "入力内容を確認してください。";
  }
  if (status === 500) {
    return message ?? "学生情報の取得中にエラーが発生しました。";
  }
  return message ?? "学生情報の取得に失敗しました。";
}

function ScoreBadge({
  label,
  value,
  highlighted = false,
}: {
  label: string;
  value: string;
  highlighted?: boolean;
}) {
  return (
    <div className={`studentInfoScoreBadge${highlighted ? " studentInfoScoreBadgeHighlight" : ""}`}>
      <span className="studentInfoScoreBadgeLabel">{label}</span>
      <strong className="studentInfoScoreBadgeValue">{value}</strong>
    </div>
  );
}

export function StudentBasicInfoView({ students }: StudentBasicInfoViewProps) {
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [classFilter, setClassFilter] = useState("all");
  const [selectedGakuseiId, setSelectedGakuseiId] = useState(
    students[0]?.gakusei_id ?? "",
  );
  const [profile, setProfile] = useState<StudentProfileData | null>(null);
  const [form, setForm] = useState<StudentProfileFormState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

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

  useEffect(() => {
    if (!selectedGakuseiId) {
      setProfile(null);
      setForm(null);
      setError(null);
      setSaveMessage(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadProfile() {
      setIsLoading(true);
      setError(null);
      setSaveMessage(null);

      try {
        const response = await fetch(
          `/api/student-profile?gakuseiId=${encodeURIComponent(selectedGakuseiId)}`,
        );
        const payload = (await response.json()) as StudentProfileData & {
          message?: string;
        };

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setError(getProfileErrorMessage(response.status, payload.message));
          setProfile(null);
          setForm(null);
          return;
        }

        setProfile(payload);
        setForm(buildProfileFormState(payload));
      } catch {
        if (!cancelled) {
          setError("学生情報の取得に失敗しました。");
          setProfile(null);
          setForm(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [selectedGakuseiId]);

  const highlightedCognitiveKey = profile
    ? getHighlightedCognitiveKey(profile.cognitiveScores)
    : null;

  function updateFormField<K extends keyof StudentProfileFormState>(
    key: K,
    value: StudentProfileFormState[K],
  ) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setSaveMessage(null);
  }

  function handleCancel() {
    if (profile) {
      setForm(buildProfileFormState(profile));
      setSaveMessage(null);
      setError(null);
    }
  }

  async function handleSave() {
    if (!selectedGakuseiId || !form) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      const response = await fetch("/api/student-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gakuseiId: selectedGakuseiId,
          nickname: form.nickname,
          className: form.className,
          studentPassword: form.studentPassword,
          parentId: form.parentId,
          parentPassword: form.parentPassword,
          parentEmail: form.parentEmail,
        }),
      });

      const payload = (await response.json()) as StudentProfileData & {
        message?: string;
        warning?: string;
      };

      if (!response.ok) {
        setError(getProfileErrorMessage(response.status, payload.message));
        return;
      }

      setProfile(payload);
      setForm(buildProfileFormState(payload));
      setSaveMessage(payload.warning ?? "保存しました。");
    } catch {
      setError("学生情報の保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="learningTimePage">
      <header className="learningTimeHeader">
        <div>
          <h1 className="learningTimeTitle">学生基本情報</h1>
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

        <section className="learningTimeDetail studentInfoDetailPanel">
          {!selectedGakuseiId || !form ? (
            <div className="learningTimeEmptyPanel">学生を選択してください。</div>
          ) : (
            <>
              <div className="studentInfoDetailHeader">
                <div>
                  <h2 className="studentInfoDetailName">
                    {profile?.name ?? "読み込み中..."}
                  </h2>
                  <p className="studentInfoDetailMeta">
                    {form.className || "クラス未設定"} · 学籍番号 {profile?.gakuseiId}
                  </p>
                </div>
              </div>

              {error ? <p className="loginError">{error}</p> : null}
              {saveMessage ? <p className="studentInfoSaveMessage">{saveMessage}</p> : null}

              <div className="studentInfoScrollBody">
                <section className="studentInfoScoreSection">
                  <h3 className="studentInfoSectionTitle">スコアサマリー</h3>
                  <div className="studentInfoScoreBody">
                    <div className="studentInfoScoreRow">
                      <article className="studentInfoScoreCard studentInfoScoreCardCompact">
                        <h4 className="studentInfoScoreCardTitle">入学前プレ</h4>
                        <ScoreBadge
                          label="スコア"
                          value={formatScoreBadgeValue(profile?.pretestScore)}
                          highlighted={profile?.pretestScore != null}
                        />
                      </article>

                      <article className="studentInfoScoreCard studentInfoScoreCardCareer">
                        <h4 className="studentInfoScoreCardTitle">キャリアサポート</h4>
                        <div className="studentInfoCareerBadges">
                          <ScoreBadge
                            label="サポート領域"
                            value={profile?.supportArea ?? "—"}
                          />
                          <ScoreBadge
                            label="キャリア教育"
                            value={profile?.careerEducation ?? "—"}
                          />
                        </div>
                      </article>

                      <article className="studentInfoScoreCard studentInfoScoreCardCognitive">
                        <h4 className="studentInfoScoreCardTitle">認知特性スコア</h4>
                        <div className="studentInfoCognitiveBadges">
                          {COGNITIVE_SCORE_ITEMS.map(({ key, label }) => (
                            <ScoreBadge
                              key={key}
                              label={label}
                              value={formatScoreBadgeValue(profile?.cognitiveScores[key])}
                              highlighted={highlightedCognitiveKey === key}
                            />
                          ))}
                        </div>
                      </article>
                    </div>

                    {!profile?.extendedFieldsAvailable ? (
                      <p className="studentInfoScoreHint">
                        スコア項目のカラムが未作成です。SQL マイグレーション後に表示されます。
                      </p>
                    ) : null}
                  </div>
                </section>

                <section className="studentInfoFormSection">
                  <h3 className="studentInfoSectionTitle">基本情報</h3>
                  <div className="studentInfoFormGrid">
                    <label className="studentInfoField">
                      <span className="studentInfoFieldLabel">ニックネーム</span>
                      <input
                        className="studentInfoFieldInput"
                        type="text"
                        value={form.nickname}
                        maxLength={12}
                        onChange={(event) => updateFormField("nickname", event.target.value)}
                        disabled={isLoading || isSaving}
                      />
                    </label>
                    <label className="studentInfoField">
                      <span className="studentInfoFieldLabel">クラス</span>
                      <input
                        className="studentInfoFieldInput"
                        type="text"
                        value={form.className}
                        onChange={(event) => updateFormField("className", event.target.value)}
                        disabled={isLoading || isSaving}
                      />
                    </label>
                    <label className="studentInfoField">
                      <span className="studentInfoFieldLabel">学生ID</span>
                      <input
                        className="studentInfoFieldInput studentInfoFieldInputReadonly"
                        type="text"
                        value={profile?.gakuseiId ?? ""}
                        readOnly
                      />
                    </label>
                    <label className="studentInfoField">
                      <span className="studentInfoFieldLabel">学生パスワード</span>
                      <input
                        className="studentInfoFieldInput"
                        type="password"
                        value={form.studentPassword}
                        placeholder={profile?.hasStudentPassword ? "********" : "未設定"}
                        onChange={(event) =>
                          updateFormField("studentPassword", event.target.value)
                        }
                        disabled={isLoading || isSaving}
                      />
                    </label>
                    <label className="studentInfoField">
                      <span className="studentInfoFieldLabel">保護者ID</span>
                      <input
                        className="studentInfoFieldInput"
                        type="text"
                        value={form.parentId}
                        onChange={(event) => updateFormField("parentId", event.target.value)}
                        disabled={isLoading || isSaving}
                      />
                    </label>
                    <label className="studentInfoField">
                      <span className="studentInfoFieldLabel">保護者パスワード</span>
                      <input
                        className="studentInfoFieldInput"
                        type="password"
                        value={form.parentPassword}
                        placeholder={profile?.hasParentPassword ? "********" : "未設定"}
                        onChange={(event) =>
                          updateFormField("parentPassword", event.target.value)
                        }
                        disabled={isLoading || isSaving}
                      />
                    </label>
                    <label className="studentInfoField studentInfoFieldFull">
                      <span className="studentInfoFieldLabel">保護者メールアドレス</span>
                      <input
                        className="studentInfoFieldInput"
                        type="email"
                        value={form.parentEmail}
                        onChange={(event) => updateFormField("parentEmail", event.target.value)}
                        disabled={isLoading || isSaving}
                      />
                    </label>
                  </div>
                </section>
              </div>

              <div className="studentInfoFooter">
                <button
                  type="button"
                  className="studentInfoCancelBtn"
                  onClick={handleCancel}
                  disabled={isLoading || isSaving}
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  className="studentInfoSaveBtn"
                  onClick={() => void handleSave()}
                  disabled={isLoading || isSaving}
                >
                  {isSaving ? "保存中..." : "保存"}
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
