"use client";

import { SubjectTrendAnalysisPanel } from "@/components/portal/SubjectTrendAnalysisPanel";
import { SubjectTrendLineChart } from "@/components/portal/SubjectTrendLineChart";
import type { SubjectTrendData, SubjectTrendPoint } from "@/lib/subjectTrend";
import type { SubjectTrendAnalysis } from "@/lib/subjectTrendAnalysis";

export type SubjectTrendDetailContentProps = {
  subjectName: string;
  points: SubjectTrendPoint[];
  cohortAverageLabel: string | null;
  failedCohortAverageLabel: string | null;
  passedCohortAverageLabel: string | null;
  subjectAnalysis: SubjectTrendAnalysis | null | undefined;
  isLoading?: boolean;
  notices?: string[];
};

function buildDeltaLabel(
  point: SubjectTrendPoint,
  previous: SubjectTrendPoint | undefined,
) {
  const delta =
    point.chartValue !== null &&
    previous?.chartValue !== null &&
    previous?.chartValue !== undefined
      ? point.chartValue - previous.chartValue
      : null;
  if (delta === null) {
    return "—";
  }
  return delta > 0 ? `+${delta}` : `${delta}`;
}

export function SubjectTrendDetailContent({
  subjectName,
  points,
  cohortAverageLabel,
  failedCohortAverageLabel,
  passedCohortAverageLabel,
  subjectAnalysis,
  isLoading = false,
  notices = [],
}: SubjectTrendDetailContentProps) {
  return (
    <div className="subjectTrendFullscreenLayout">
      <section className="subjectTrendFullscreenChartSection">
        <h3 className="examScoreSectionTitle">成績推移（日程順）</h3>
        <p className="subjectTrendChartSubject">{subjectName}</p>
        <div className="subjectTrendFullscreenChartBody">
          <SubjectTrendLineChart
            points={points}
            cohortAverageLabel={cohortAverageLabel}
            failedCohortAverageLabel={failedCohortAverageLabel}
            passedCohortAverageLabel={passedCohortAverageLabel}
            variant="fullscreen"
          />
        </div>
      </section>

      <div className="subjectTrendFullscreenBottomRow">
        <section className="subjectTrendFullscreenAnalysisSection">
          {notices.map((notice) => (
            <p key={notice} className="examScoreNotice">
              {notice}
            </p>
          ))}
          <SubjectTrendAnalysisPanel
            analysis={subjectAnalysis}
            subjectName={subjectName}
            isLoading={isLoading}
            expanded
          />
        </section>

        <section className="subjectTrendFullscreenTableSection">
          <h3 className="examScoreSectionTitle">試験別スコア一覧</h3>
          <div className="subjectTrendTableWrap subjectTrendFullscreenTableWrap">
            <table className="subjectTrendTable">
              <thead>
                <tr>
                  <th>実施日</th>
                  <th>試験</th>
                  <th>種別</th>
                  <th>成績</th>
                  <th>前回比</th>
                </tr>
              </thead>
              <tbody>
                {points.map((point, index, rows) => {
                  const previous = rows
                    .slice(0, index)
                    .reverse()
                    .find((item) => !item.notTaken && item.chartValue !== null);

                  return (
                    <tr key={point.sessionKey}>
                      <td>{point.examDateLabel ?? "未設定"}</td>
                      <td>{point.sessionLabel}</td>
                      <td>{point.sourceType === "regular" ? "定期" : "模擬"}</td>
                      <td>{point.displayValue}</td>
                      <td>{buildDeltaLabel(point, previous)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

export type SubjectTrendHeaderProps = {
  studentName: string;
  studentClass: string | null;
  subjectOptions: string[];
  currentSubject: string;
  onSubjectChange: (subjectName: string) => void;
  onOpenFullscreen?: () => void;
  onCloseFullscreen?: () => void;
  isFullscreen?: boolean;
};

export function SubjectTrendHeader({
  studentName,
  studentClass,
  subjectOptions,
  currentSubject,
  onSubjectChange,
  onOpenFullscreen,
  onCloseFullscreen,
  isFullscreen = false,
}: SubjectTrendHeaderProps) {
  return (
    <div className="examDetailHeader">
      <div>
        <h2 className="examDetailName">{studentName}</h2>
        <p className="examDetailMeta">
          {studentClass ?? "クラス未設定"} · 科目別推移
        </p>
      </div>
      <div className="examDetailHeaderActions">
        {subjectOptions.length > 0 ? (
          <label className="examSessionSelectWrap">
            <select
              className="examSessionSelect"
              value={currentSubject}
              onChange={(event) => onSubjectChange(event.target.value)}
              aria-label="科目"
            >
              {subjectOptions.map((subject) => (
                <option key={subject} value={subject}>
                  {subject}
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

export function buildSubjectTrendNotices(data: SubjectTrendData | null) {
  const notices: string[] = [];

  if (data?.summary.cohortMissing) {
    notices.push(
      "所属クラスから期を特定できません（例: 25期生昼間部）。定期試験の実施日を反映するにはクラス名に「25期」形式を含めてください。",
    );
  }

  if (data?.summary.hasUndatedRegularExams) {
    notices.push(
      data.summary.cohortLabel
        ? `${data.summary.cohortLabel}の定期試験に実施日が未設定の学期があります。`
        : "一部の定期試験に実施日が未設定です。試験設定の「定期試験」タブで期ごとに実施日を設定すると日程順に並びます。",
    );
  }

  return notices;
}
