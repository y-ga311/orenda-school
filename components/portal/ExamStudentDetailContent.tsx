"use client";

import { useMemo } from "react";
import { ExamRadarChart } from "@/components/portal/ExamRadarChart";
import { ExamPassRateAnalysisPanel } from "@/components/portal/ExamPassRateAnalysisPanel";
import {
  calculateExamTrackTotals,
  formatScoreDetail,
  formatTestScoreDetail,
  getNotTakenScoreTone,
  getPercentScoreTone,
  getScoreTone,
  isTakenExamScore,
  sortExamSessionsByDateDescending,
  type ExamScoreRow,
  type ExamSessionOption,
  type ExamType,
} from "@/lib/examResults";
import type { ExamPassRateAnalysis } from "@/lib/passRateAnalysis";

export type ExamStudentDetailContentProps = {
  layout: "compact" | "fullscreen";
  examType: ExamType;
  examLabel: string;
  sectionTitle: string | null | undefined;
  isLoading: boolean;
  usesPointScoreFormat: boolean;
  usesTestScoreFormat: boolean;
  scores: ExamScoreRow[];
  hasTakenScores: boolean;
  radarScores: ExamScoreRow[];
  radarAverageScore: number | null;
  radarCohortScores: ExamScoreRow[] | null;
  cohortAverageLabel: string | null;
  radarFailedCohortScores: ExamScoreRow[] | null;
  failedCohortAverageLabel: string | null;
  radarPassedCohortScores: ExamScoreRow[] | null;
  passedCohortAverageLabel: string | null;
  trackTotals: ReturnType<typeof calculateExamTrackTotals>;
  passRateAnalysis: ExamPassRateAnalysis | null | undefined;
  tableMissing?: boolean;
};

export function ExamStudentDetailContent({
  layout,
  examLabel,
  sectionTitle,
  isLoading,
  usesPointScoreFormat,
  usesTestScoreFormat,
  scores,
  hasTakenScores,
  radarScores,
  radarAverageScore,
  radarCohortScores,
  cohortAverageLabel,
  radarFailedCohortScores,
  failedCohortAverageLabel,
  radarPassedCohortScores,
  passedCohortAverageLabel,
  trackTotals,
  passRateAnalysis,
  tableMissing,
}: ExamStudentDetailContentProps) {
  const isFullscreen = layout === "fullscreen";
  const scoreUnit = usesPointScoreFormat ? "点" : "%";

  const scoreSection = (
    <section
      className={`examScoreSection${isFullscreen ? " examScoreSectionFullscreen" : ""}`}
    >
      <h3 className="examScoreSectionTitle">
        {isLoading ? "読み込み中..." : (sectionTitle ?? `${examLabel}成績`)}
      </h3>

      <div className="examScoreListWrap">
        {isLoading ? (
          <p className="learningTimeEmpty">読み込み中...</p>
        ) : tableMissing && !usesPointScoreFormat ? (
          <p className="learningTimeEmpty">
            test_scores テーブルが未作成です。データ登録後に表示されます。
          </p>
        ) : scores.length === 0 ? (
          <p className="learningTimeEmpty">この試験の成績データがありません。</p>
        ) : (
          <>
            <div className="examScoreList">
              {scores.map((row) => {
                const isNotTaken = !isTakenExamScore(row);
                const tone = isNotTaken
                  ? getNotTakenScoreTone()
                  : usesPointScoreFormat
                    ? getScoreTone(row.score ?? 0)
                    : getPercentScoreTone(row.score ?? 0);
                const label = usesPointScoreFormat
                  ? formatScoreDetail(row)
                  : formatTestScoreDetail(row);

                return (
                  <div key={row.subjectName} className="examScoreRow">
                    <span className="examScoreSubject">{row.subjectName}</span>
                    <span
                      className="examScoreValue"
                      style={{
                        backgroundColor: tone.boxBackground,
                        borderColor: tone.boxBorder,
                        color: tone.textColor,
                      }}
                    >
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
            {!hasTakenScores ? (
              <p className="examScoreNotice">実施済みの科目がありません。</p>
            ) : null}
          </>
        )}
      </div>

      {!isFullscreen ? (
        <p className="examScoreHint">
          {usesPointScoreFormat
            ? "未実施科目は「-」表示。実施科目は100点満点の得点で表示します。80点以上は緑、60点以上は黄、60点未満は赤です。"
            : "未実施科目は「-」表示。実施科目は正解数/問題数（正解率%）で表示します。40%以下は赤、60%未満は黄、60%以上は緑です。"}
        </p>
      ) : null}
    </section>
  );

  const radarSection = (
    <section className="examRadarSection examDetailFullscreenRadarSection">
      <h3 className="examScoreSectionTitle">レーダーチャート</h3>
      {isLoading ? (
        <p className="learningTimeEmpty">読み込み中...</p>
      ) : (
        <ExamRadarChart
          scores={radarScores}
          averageScore={radarAverageScore}
          cohortScores={radarCohortScores}
          cohortAverageLabel={cohortAverageLabel}
          failedCohortScores={radarFailedCohortScores}
          failedCohortAverageLabel={failedCohortAverageLabel}
          passedCohortScores={radarPassedCohortScores}
          passedCohortAverageLabel={passedCohortAverageLabel}
          trackTotals={trackTotals}
          scoreUnit={scoreUnit}
          chartSize={460}
        />
      )}
    </section>
  );

  if (!isFullscreen) {
    return (
      <div className="examDetailBody examDetailBodyCompact">
        {scoreSection}
        <section className="examDetailCompactPrompt">
          <p className="examDetailCompactPromptText">
            {usesTestScoreFormat
              ? "レーダーチャートと ABCD 分析は「詳細」または右上の全画面ボタンから開けます。"
              : "レーダーチャートは「詳細」または右上の全画面ボタンから開けます。"}
          </p>
        </section>
      </div>
    );
  }

  return (
    <div
      className={`examFullscreenLayout${usesTestScoreFormat ? "" : " examFullscreenLayoutNoAnalysis"}`}
    >
      <aside className="examFullscreenCol examFullscreenColScores">{scoreSection}</aside>
      {usesTestScoreFormat ? (
        <section className="examFullscreenCol examFullscreenColAnalysis">
          <ExamPassRateAnalysisPanel
            analysis={passRateAnalysis}
            isLoading={isLoading}
            expanded
          />
        </section>
      ) : null}
      <aside className="examFullscreenCol examFullscreenColRadar">{radarSection}</aside>
    </div>
  );
}

export type ExamDetailHeaderProps = {
  studentName: string;
  studentClass: string | null;
  examLabel: string;
  testDate?: string | null;
  sessions: ExamSessionOption[];
  currentSessionKey: string;
  onSessionChange: (sessionKey: string) => void;
  onOpenFullscreen?: () => void;
  onCloseFullscreen?: () => void;
  isFullscreen?: boolean;
};

export function ExamDetailHeader({
  studentName,
  studentClass,
  examLabel,
  testDate,
  sessions,
  currentSessionKey,
  onSessionChange,
  onOpenFullscreen,
  onCloseFullscreen,
  isFullscreen = false,
}: ExamDetailHeaderProps) {
  const orderedSessions = useMemo(
    () => sortExamSessionsByDateDescending(sessions),
    [sessions],
  );

  return (
    <div className="examDetailHeader">
      <div>
        <h2 className="examDetailName">{studentName}</h2>
        <p className="examDetailMeta">
          {studentClass ?? "クラス未設定"} · {examLabel}
          {testDate ? ` · 試験日 ${testDate}` : ""}
        </p>
      </div>
      <div className="examDetailHeaderActions">
        {sessions.length > 0 ? (
          <label className="examSessionSelectWrap">
            <select
              className="examSessionSelect"
              value={currentSessionKey}
              onChange={(event) => onSessionChange(event.target.value)}
              aria-label="試験回次"
            >
              {orderedSessions.map((session) => (
                <option key={session.sessionKey} value={session.sessionKey}>
                  {session.sessionLabel}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {isFullscreen ? (
          <button
            type="button"
            className="examDetailCloseBtn"
            onClick={onCloseFullscreen}
            aria-label="全画面を閉じる"
          >
            閉じる
          </button>
        ) : onOpenFullscreen ? (
          <button
            type="button"
            className="examDetailExpandBtn examDetailExpandBtnHeader"
            onClick={onOpenFullscreen}
          >
            全画面
          </button>
        ) : null}
      </div>
    </div>
  );
}
