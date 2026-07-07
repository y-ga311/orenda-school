"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PortalLoadingOverlay } from "@/components/portal/PortalLoadingOverlay";
import type { StudentRow } from "@/components/portal/LearningTimeView";
import {
  buildProfileFormState,
  COGNITIVE_SCORE_ITEMS,
  LEARNING_ABILITY_SCORE_ITEMS,
  getHighlightedCognitiveKeys,
  getScoreCohortHighlight,
  parseCognitiveScoresFormState,
  parseLearningAbilityScoresFormState,
  parsePretestScoreFormValue,
  type CognitiveScoreKey,
  type LearningAbilityScoreKey,
  type ScoreCohortHighlight,
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

function ScoreBadgeInput({
  label,
  value,
  onChange,
  highlight = null,
  inputMode = "text",
  placeholder = "—",
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  highlight?: "above" | "below" | null;
  inputMode?: "numeric" | "decimal" | "text";
  placeholder?: string;
  disabled?: boolean;
}) {
  const highlightClass =
    highlight === "above"
      ? " studentInfoScoreBadgeHighlight"
      : highlight === "below"
        ? " studentInfoScoreBadgeHighlightBelow"
        : "";

  return (
    <div className={`studentInfoScoreBadge${highlightClass}`}>
      <span className="studentInfoScoreBadgeLabel">{label}</span>
      <input
        className="studentInfoScoreInput"
        type="text"
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />
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

  const scoreFieldsDisabled = isLoading || isSaving || !profile?.extendedFieldsAvailable;

  const highlightedCognitiveKeys = useMemo(() => {
    if (!form) {
      return new Set<CognitiveScoreKey>();
    }
    return new Set(
      getHighlightedCognitiveKeys(parseCognitiveScoresFormState(form.cognitiveScores)),
    );
  }, [form]);

  const scoreCohortAverages = profile?.scoreCohortAverages ?? null;

  const pretestHighlight = useMemo((): ScoreCohortHighlight | null => {
    if (!form || !scoreCohortAverages) {
      return null;
    }
    return getScoreCohortHighlight(
      parsePretestScoreFormValue(form.pretestScore),
      scoreCohortAverages.pretestScore,
    );
  }, [form, scoreCohortAverages]);

  const medicalFoundationHighlight = useMemo((): ScoreCohortHighlight | null => {
    if (!form || !scoreCohortAverages) {
      return null;
    }
    return getScoreCohortHighlight(
      parsePretestScoreFormValue(form.medicalFoundationTestScore),
      scoreCohortAverages.medicalFoundationTestScore,
    );
  }, [form, scoreCohortAverages]);

  const learningAbilityHighlights = useMemo(() => {
    const highlights = new Map<LearningAbilityScoreKey, ScoreCohortHighlight>();
    if (!form || !scoreCohortAverages) {
      return highlights;
    }

    const scores = parseLearningAbilityScoresFormState(form.learningAbilityScores);
    LEARNING_ABILITY_SCORE_ITEMS.forEach(({ key }) => {
      const highlight = getScoreCohortHighlight(
        scores[key],
        scoreCohortAverages.learningAbilityScores[key],
      );
      if (highlight) {
        highlights.set(key, highlight);
      }
    });

    return highlights;
  }, [form, scoreCohortAverages]);

  function updateFormField<K extends keyof StudentProfileFormState>(
    key: K,
    value: StudentProfileFormState[K],
  ) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setSaveMessage(null);
  }

  function updateCognitiveScore(key: CognitiveScoreKey, value: string) {
    setForm((current) =>
      current
        ? {
            ...current,
            cognitiveScores: {
              ...current.cognitiveScores,
              [key]: value,
            },
          }
        : current,
    );
    setSaveMessage(null);
  }

  function updateLearningAbilityScore(key: LearningAbilityScoreKey, value: string) {
    setForm((current) =>
      current
        ? {
            ...current,
            learningAbilityScores: {
              ...current.learningAbilityScores,
              [key]: value,
            },
          }
        : current,
    );
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
          pretestScore: form.pretestScore,
          supportArea: form.supportArea,
          careerEducation: form.careerEducation,
          cognitiveScores: form.cognitiveScores,
          learningAbilityScores: form.learningAbilityScores,
          medicalFoundationTestScore: form.medicalFoundationTestScore,
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
        <Link href="/student-info/bulk" className="studentInfoBulkEditBtn">
          一括編集
        </Link>
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

        <section className="learningTimeDetail studentInfoDetailPanel">
          <PortalLoadingOverlay active={isLoading} />
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
                    <div className="studentInfoScoreGrid">
                      <div className="studentInfoScoreRow studentInfoScoreRowPrimary">
                        <article className="studentInfoScoreCard studentInfoScoreCardCompact">
                          <h4 className="studentInfoScoreCardTitle">入学前プレ</h4>
                          <ScoreBadgeInput
                            label="スコア"
                            inputMode="decimal"
                            value={form.pretestScore}
                            placeholder="—"
                            highlight={pretestHighlight}
                            onChange={(value) => updateFormField("pretestScore", value)}
                            disabled={scoreFieldsDisabled}
                          />
                        </article>

                        <article className="studentInfoScoreCard studentInfoScoreCardCareer">
                          <h4 className="studentInfoScoreCardTitle">キャリアサポート</h4>
                          <div className="studentInfoCareerBadges">
                            <ScoreBadgeInput
                              label="サポート領域"
                              value={form.supportArea}
                              placeholder="—"
                              onChange={(value) => updateFormField("supportArea", value)}
                              disabled={scoreFieldsDisabled}
                            />
                            <ScoreBadgeInput
                              label="キャリア教育"
                              value={form.careerEducation}
                              placeholder="—"
                              onChange={(value) => updateFormField("careerEducation", value)}
                              disabled={scoreFieldsDisabled}
                            />
                          </div>
                        </article>

                        <article className="studentInfoScoreCard studentInfoScoreCardCompact studentInfoScoreCardMedical">
                          <h4 className="studentInfoScoreCardTitle">医療系専門基礎テスト</h4>
                          <ScoreBadgeInput
                            label="スコア"
                            inputMode="decimal"
                            value={form.medicalFoundationTestScore}
                            placeholder="—"
                            highlight={medicalFoundationHighlight}
                            onChange={(value) =>
                              updateFormField("medicalFoundationTestScore", value)
                            }
                            disabled={scoreFieldsDisabled}
                          />
                        </article>
                      </div>

                      <div className="studentInfoScoreRow studentInfoScoreRowSecondary">
                        <article className="studentInfoScoreCard studentInfoScoreCardLearning">
                          <h4 className="studentInfoScoreCardTitle">学習能力チェック</h4>
                          <div className="studentInfoLearningBadges">
                            {LEARNING_ABILITY_SCORE_ITEMS.map(({ key, label }) => (
                              <ScoreBadgeInput
                                key={key}
                                label={label}
                                inputMode="numeric"
                                value={form.learningAbilityScores[key]}
                                placeholder="—"
                                highlight={learningAbilityHighlights.get(key) ?? null}
                                onChange={(value) => updateLearningAbilityScore(key, value)}
                                disabled={scoreFieldsDisabled}
                              />
                            ))}
                          </div>
                        </article>

                        <article className="studentInfoScoreCard studentInfoScoreCardCognitive">
                          <h4 className="studentInfoScoreCardTitle">認知特性スコア</h4>
                          <div className="studentInfoCognitiveBadges">
                            {COGNITIVE_SCORE_ITEMS.map(({ key, label }) => (
                              <ScoreBadgeInput
                                key={key}
                                label={label}
                                inputMode="numeric"
                                value={form.cognitiveScores[key]}
                                placeholder="—"
                                highlight={
                                  highlightedCognitiveKeys.has(key) ? "above" : null
                                }
                                onChange={(value) => updateCognitiveScore(key, value)}
                                disabled={scoreFieldsDisabled}
                              />
                            ))}
                          </div>
                        </article>
                      </div>
                    </div>

                    {!profile?.extendedFieldsAvailable ? (
                      <p className="studentInfoScoreHint">
                        スコア項目のカラムが未作成です。SQL マイグレーション後に編集できます。
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
                        placeholder="未設定"
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
                        placeholder="未設定"
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
